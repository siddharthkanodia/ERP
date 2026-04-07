"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Switch from "@radix-ui/react-switch";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Trash2 } from "lucide-react";

import { updateFinishedProduct } from "@/actions/finished-products";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";
const outlinedButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted";

type UnitOfMeasure = "KG" | "PIECE";

type Props = {
  id: string;
  initialName: string;
  unit: UnitOfMeasure;
  /** Parent-level stock; used when distributing stock to new variants (migration). */
  quantityInStock: number;
  /** Sum of variant stock when variants exist; otherwise same as quantityInStock. */
  aggregateStock: number;
  initialVariants: Array<{
    id: string;
    name: string;
    weightInGrams: number;
    quantityInStock: number;
  }>;
};

/** Persisted DB variant (cuid); new rows use a `new_…` key and omit `id`. */
function isExistingVariantRow(variant: { id?: string }): boolean {
  return Boolean(variant.id && variant.id.trim() !== "");
}

export function EditFinishedProductForm({
  id,
  initialName,
  unit,
  quantityInStock,
  aggregateStock,
  initialVariants,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const parentStockRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState(() => initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [variants, setVariants] = useState<
    Array<{
      key: string;
      id?: string;
      name: string;
      weightInGrams: string;
      stock: string;
      quantityInStock: number;
      markedForDelete: boolean;
    }>
  >(
    initialVariants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      name: variant.name ?? "",
      weightInGrams:
        variant.weightInGrams != null
          ? String(variant.weightInGrams)
          : "",
      stock: String(Number(variant.quantityInStock) || 0),
      quantityInStock: Number(variant.quantityInStock) || 0,
      markedForDelete: false,
    }))
  );
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const visibleVariants = useMemo(
    () => variants.filter((variant) => !variant.markedForDelete),
    [variants]
  );
  const nameCounts = visibleVariants.reduce<Record<string, number>>((acc, variant) => {
    const key = (variant.name ?? "").trim().toLowerCase();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const isMigrationScenario = initialVariants.length === 0 && visibleVariants.length > 0;
  const unitLabel = unit === "PIECE" ? "pcs" : "kg";
  const parentCurrentStock = Number(aggregateStock) || 0;
  const totalVariantStock = visibleVariants.reduce(
    (sum, variant) => sum + (Number(variant.stock) || 0),
    0
  );
  const remainder = Number((parentCurrentStock - totalVariantStock).toFixed(2));
  const allocatedTotal = visibleVariants.reduce(
    (sum, variant) => sum + (parseFloat(allocations[variant.key] ?? "0") || 0),
    0
  );

  function validateFormData(): string | null {
    if (!name.trim()) return "Name is required.";
    const seenNames = new Set<string>();
    for (const variant of visibleVariants) {
      const variantName = (variant.name ?? "").trim();
      const weightInGrams = parseFloat(variant.weightInGrams);
      if (!variantName) return "Variant name is required for all variant rows.";
      if (!Number.isFinite(weightInGrams) || weightInGrams <= 0) {
        return "Variant weight must be greater than 0 grams.";
      }
      if (!isExistingVariantRow(variant) && !isMigrationScenario) {
        const initialQty = parseFloat(variant.stock ?? "0");
        if (!Number.isFinite(initialQty) || initialQty < 0) {
          return "Initial quantity must be greater than or equal to 0.";
        }
        if (unit === "PIECE" && !Number.isInteger(initialQty)) {
          return "Pieces must be whole numbers.";
        }
      }
      const normalized = variantName.toLowerCase();
      if (seenNames.has(normalized)) return "Duplicate variant names are not allowed.";
      seenNames.add(normalized);
    }
    return null;
  }

  function validateAllocationData(): string | null {
    for (const variant of visibleVariants) {
      const value = parseFloat(allocations[variant.key] ?? "0");
      if (!Number.isFinite(value) || value < 0) {
        return "Allocated quantity must be greater than or equal to 0.";
      }
      if (unit === "PIECE" && !Number.isInteger(value)) {
        return "Pieces must be whole numbers.";
      }
    }
    if (Math.round(allocatedTotal * 100) / 100 !== Math.round(quantityInStock * 100) / 100) {
      return "Total allocated quantity must equal existing stock.";
    }
    return null;
  }

  function buildPayload() {
    const payload = new FormData();
    payload.set("name", name.trim());
    payload.set(
      "variants",
      JSON.stringify(
        variants.map((variant) => {
          const base = {
            clientKey: variant.key,
            name: (variant.name ?? "").trim(),
            weightInGrams: parseFloat(variant.weightInGrams || "0"),
            _delete: variant.markedForDelete,
          };
          if (isExistingVariantRow(variant)) {
            return {
              ...base,
              id: variant.id,
              quantityInStock: parseFloat(variant.stock || "0"),
            };
          }
          const initialQuantity = parseFloat(variant.stock ?? "0");
          return {
            ...base,
            initialQuantity: Number.isFinite(initialQuantity) ? initialQuantity : 0,
          };
        })
      )
    );
    if (isMigrationScenario) {
      payload.set(
        "stockDistribution",
        JSON.stringify(
          visibleVariants.map((variant) => ({
            variantTempKeyOrId: variant.id ?? variant.key,
            allocatedQuantity: parseFloat(allocations[variant.key] ?? "0"),
          }))
        )
      );
    }
    return payload;
  }

  async function saveWithPayload(payload: FormData) {
    setIsPending(true);
    const result = await updateFinishedProduct(id, payload);
    setIsPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/finished-products");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (visibleVariants.length > 0 && remainder !== 0) {
      setDistributionError(
        `Please distribute all stock before saving. ${
          remainder > 0
            ? `${remainder} ${unitLabel} still unassigned.`
            : `Over-distributed by ${Math.abs(remainder)} ${unitLabel}.`
        }`
      );
      parentStockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setDistributionError(null);
    const validationError = validateFormData();
    if (validationError) {
      setError(validationError);
      return;
    }
    await saveWithPayload(buildPayload());
  }

  async function handleConfirmSave() {
    setError(null);
    const allocationError = validateAllocationData();
    if (allocationError) {
      setError(allocationError);
      return;
    }
    setIsDialogOpen(false);
    await saveWithPayload(buildPayload());
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      <div className="flex items-end gap-4">
        <div ref={parentStockRef} className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="currentStock" className="text-sm font-medium">
            {unit === "KG" ? "Current Stock (kg)" : "Current Stock (pcs)"}
          </label>
          <input
            id="currentStock"
            type="text"
            value={String(aggregateStock ?? 0)}
            disabled
            readOnly
            className="h-9 w-full rounded-md border bg-gray-50 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
          />
          {visibleVariants.length > 0 ? (
            <div className="text-sm mt-1">
              {remainder === 0 ? (
                <span className="text-green-600 font-medium">✓ All stock distributed</span>
              ) : (
                <span className="text-amber-600 font-medium">
                  Remaining: {remainder} {unitLabel}
                </span>
              )}
              {distributionError ? (
                <p className="text-red-600 text-sm font-medium mt-1">
                  {distributionError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 space-y-1.5">
          <span className="block text-sm font-medium">Unit</span>
          <div className="flex h-9 items-center gap-2 rounded-md border bg-gray-50 px-3 opacity-50 cursor-not-allowed">
            <span
              className={
                unit === "KG"
                  ? "text-sm font-medium text-foreground"
                  : "text-sm text-muted-foreground"
              }
            >
              KGs
            </span>
            <Switch.Root
              aria-label="Unit of measure"
              checked={unit === "PIECE"}
              disabled
              className="relative h-5 w-9 rounded-full border border-black bg-white transition-colors data-[state=checked]:bg-black"
            >
              <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-black shadow-sm ring-1 ring-black/10 transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-white" />
            </Switch.Root>
            <span
              className={
                unit === "PIECE"
                  ? "text-sm font-medium text-foreground"
                  : "text-sm text-muted-foreground"
              }
            >
              Pcs
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-md border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Variants (Optional)</h2>
          <button
            type="button"
            className={outlinedButtonClass}
            onClick={() =>
              setVariants((prev) => [
                ...prev,
                {
                  key: `new_${crypto.randomUUID()}`,
                  name: "",
                  weightInGrams: "",
                  stock: "",
                  quantityInStock: 0,
                  markedForDelete: false,
                },
              ])
            }
          >
            <Plus className="mr-1 size-4" />
            Add Variants
          </button>
        </div>

        {variants.length === 0 ? (
          <p className="text-xs text-muted-foreground">No variants added.</p>
        ) : (
          <div className="space-y-2">
            {visibleVariants.map((variant) => {
                const existing = isExistingVariantRow(variant);
                const cannotRemove = existing && variant.quantityInStock > 0;
                return (
                  <div
                    key={variant.key}
                    className="grid gap-2 rounded-md border bg-card p-2 md:grid-cols-[minmax(0,1fr)_180px_160px_auto]"
                  >
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 500gm, small"
                        value={variant.name ?? ""}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((row) =>
                              row.key === variant.key
                                ? { ...row, name: e.target.value }
                                : row
                            )
                          )
                        }
                        className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                      />
                      {!(variant.name ?? "").trim() ? (
                        <p className="text-xs text-destructive">Name is required.</p>
                      ) : nameCounts[(variant.name ?? "").trim().toLowerCase()] > 1 ? (
                        <p className="text-xs text-destructive">
                          Duplicate variant name.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Weight (grams)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={variant.weightInGrams ?? ""}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((row) =>
                              row.key === variant.key
                                ? { ...row, weightInGrams: e.target.value }
                                : row
                            )
                          )
                        }
                        className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                      />
                      {(() => {
                        const grams = parseFloat(variant.weightInGrams ?? "");
                        return Number.isFinite(grams) && grams > 0 ? null : (
                          <p className="text-xs text-destructive">
                            Weight must be greater than 0.
                          </p>
                        );
                      })()}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {initialVariants.length === 0
                          ? `Initial Stock (${unit === "PIECE" ? "pcs" : "kg"})`
                          : `Current Stock (${unit === "PIECE" ? "pcs" : "kg"})`}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={variant.stock ?? ""}
                        onChange={(e) => {
                          setDistributionError(null);
                          setVariants((prev) =>
                            prev.map((row) =>
                              row.key === variant.key
                                ? { ...row, stock: e.target.value }
                                : row
                            )
                          );
                        }}
                        placeholder="0"
                        className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                      />
                      {cannotRemove ? (
                        <p className="text-xs text-muted-foreground">
                          Cannot remove variant with existing stock
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        title={
                          cannotRemove
                            ? "Cannot remove variant with existing stock"
                            : "Remove variant"
                        }
                        disabled={cannotRemove}
                        onClick={() =>
                          setVariants((prev) =>
                            prev.map((row) =>
                              row.key === variant.key
                                ? { ...row, markedForDelete: true }
                                : row
                            )
                          )
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black bg-white text-black transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Remove variant row"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={outlinedButtonClass}
          onClick={() => router.push("/finished-products")}
        >
          Exit
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={isPending}
          onClick={() => {
            if (visibleVariants.length > 0 && remainder !== 0) {
              setDistributionError(
                `Please distribute all stock before saving. ${
                  remainder > 0
                    ? `${remainder} ${unitLabel} still unassigned.`
                    : `Over-distributed by ${Math.abs(remainder)} ${unitLabel}.`
                }`
              );
              parentStockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              return;
            }
            setDistributionError(null);
            formRef.current?.requestSubmit();
          }}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
      </form>

      <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Distribute Existing Stock to Variants
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Existing stock must be fully allocated to new variants before saving.
            </Dialog.Description>
            <p className="mt-3 text-sm">
              Total Existing Stock: <span className="font-medium">{quantityInStock}</span>{" "}
              {unit === "PIECE" ? "pcs" : "kg"}
            </p>

            <div className="mt-3 space-y-2 rounded-md border bg-background p-3">
              {visibleVariants.map((variant) => (
                <div
                  key={variant.key}
                  className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_160px_180px]"
                >
                  <div className="text-sm">
                    <p className="font-medium">{variant.name || "Unnamed Variant"}</p>
                    <p className="text-xs text-muted-foreground">
                      Weight: {variant.weightInGrams || "0"} grams
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Allocation</label>
                    <input
                      type="number"
                      min="0"
                      step={unit === "PIECE" ? "1" : "0.01"}
                      value={allocations[variant.key] ?? "0"}
                      onChange={(e) =>
                        setAllocations((prev) => ({
                          ...prev,
                          [variant.key]: e.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {unit === "PIECE" ? "pcs" : "kg"}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-sm">
              Allocated Total: <span className="font-medium">{allocatedTotal}</span>{" "}
              {unit === "PIECE" ? "pcs" : "kg"}
            </p>
            {Math.round(allocatedTotal * 100) / 100 !==
            Math.round(quantityInStock * 100) / 100 ? (
              <p className="mt-1 text-sm text-destructive">
                Total allocated quantity must equal existing stock.
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={outlinedButtonClass}
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={handleConfirmSave}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

