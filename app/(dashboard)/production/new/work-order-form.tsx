"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";

import { createWorkOrder } from "@/actions/production";

type FinishedProduct = {
  id: string;
  name: string;
  unit: "KG" | "PIECE";
  quantityInStock: number;
  variants: Array<{
    id: string;
    name: string;
    weightPerPiece: number;
  }>;
};

type RawMaterial = {
  id: string;
  name: string;
  floorStock: number;
};

type RawMaterialRow = {
  key: string;
  rawMaterialId: string;
};

type FormState = { error?: string };

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";
const outlinedButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted";

const initialState: FormState = {};

export function CreateWorkOrderForm({
  finishedProducts,
  rawMaterials,
}: {
  finishedProducts: FinishedProduct[];
  rawMaterials: RawMaterial[];
}) {
  const router = useRouter();
  const [workOrderName, setWorkOrderName] = useState("");
  const [finishedProductId, setFinishedProductId] = useState("");
  const [finishedProductVariantId, setFinishedProductVariantId] = useState("");
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const [rows, setRows] = useState<RawMaterialRow[]>([
    { key: crypto.randomUUID(), rawMaterialId: "" },
  ]);

  const selectedFinishedProduct = useMemo(
    () => finishedProducts.find((fp) => fp.id === finishedProductId),
    [finishedProductId, finishedProducts]
  );
  const selectedVariants = selectedFinishedProduct?.variants ?? [];
  const hasVariants = selectedVariants.length > 0;

  const [state, formAction, isPending] = useActionState(
    async (): Promise<FormState> => {
      const trimmedWorkOrderName = workOrderName.trim();
      if (!trimmedWorkOrderName) {
        return { error: "Work order name is required." };
      }

      const selectedProduct = finishedProducts.find(
        (p) => p.id === finishedProductId
      );
      if (!selectedProduct) {
        return { error: "Please select a finished product." };
      }
      if (selectedProduct.variants.length > 0 && !finishedProductVariantId) {
        return { error: "Please select a variant" };
      }

      const planned = Number.parseFloat(plannedQuantity);
      if (!Number.isFinite(planned) || planned <= 0) {
        return { error: "Planned quantity must be greater than 0." };
      }
      if (selectedProduct.unit === "PIECE" && !Number.isInteger(planned)) {
        return { error: "Planned quantity must be a whole number for pieces." };
      }

      if (rows.length === 0) {
        return { error: "At least one raw material type is required." };
      }

      const selectedSet = new Set<string>();
      let serializedRows: { rawMaterialId: string }[] = [];
      try {
        serializedRows = rows.map((row) => {
          if (!row.rawMaterialId) {
            throw new Error("Please select raw material in all rows.");
          }
          if (selectedSet.has(row.rawMaterialId)) {
            throw new Error("Same raw material cannot be selected twice.");
          }
          selectedSet.add(row.rawMaterialId);

          return {
            rawMaterialId: row.rawMaterialId,
          };
        });
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Invalid raw material rows.",
        };
      }

      const payload = new FormData();
      payload.set("workOrderName", trimmedWorkOrderName);
      payload.set("finishedProductId", finishedProductId);
      payload.set("finishedProductVariantId", finishedProductVariantId);
      payload.set("plannedQuantity", planned.toString());
      payload.set("rawMaterials", JSON.stringify(serializedRows));

      const result = await createWorkOrder(payload);
      return result ?? {};
    },
    initialState
  );

  const computedError = (() => {
    try {
      const ids = rows.map((r) => r.rawMaterialId).filter(Boolean);
      if (new Set(ids).size !== ids.length) {
        return "Same raw material cannot be selected twice.";
      }
    } catch {
      return null;
    }
    return null;
  })();

  return (
    <form action={formAction} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label htmlFor="workOrderName" className="text-sm font-medium">
          Work Order Name
        </label>
        <input
          id="workOrderName"
          name="workOrderName"
          type="text"
          required
          placeholder="Enter work order name"
          value={workOrderName}
          onChange={(e) => setWorkOrderName(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Finished Product</label>
        <Select.Root
          value={finishedProductId}
          onValueChange={(productId) => {
            setFinishedProductId(productId);
            setFinishedProductVariantId("");
          }}
        >
          <Select.Trigger className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2">
            <Select.Value placeholder="Select finished product" />
            <Select.Icon>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border bg-popover shadow-md"
            >
              <Select.Viewport className="p-1">
                {finishedProducts.map((product) => (
                  <Select.Item
                    key={product.id}
                    value={product.id}
                    className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                  >
                    <Select.ItemText>{product.name}</Select.ItemText>
                    <Select.ItemIndicator className="absolute right-2 inline-flex items-center">
                      <Check className="size-4" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {selectedFinishedProduct && hasVariants ? (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Variant</label>
          <Select.Root
            value={finishedProductVariantId}
            onValueChange={setFinishedProductVariantId}
            required
          >
            <Select.Trigger className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2">
              <Select.Value placeholder="Select variant" />
              <Select.Icon>
                <ChevronDown className="size-4 text-muted-foreground" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border bg-popover shadow-md"
              >
                <Select.Viewport className="p-1">
                  {selectedVariants.map((variant) => (
                    <Select.Item
                      key={variant.id}
                      value={variant.id}
                      className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                    >
                      <Select.ItemText>{variant.name}</Select.ItemText>
                      <Select.ItemIndicator className="absolute right-2 inline-flex items-center">
                        <Check className="size-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="plannedQuantity" className="text-sm font-medium">
          Planned Quantity{" "}
          {selectedFinishedProduct?.unit === "PIECE" ? "(pcs)" : "(kg)"}
        </label>
        <input
          id="plannedQuantity"
          name="plannedQuantity"
          type="number"
          value={plannedQuantity}
          onChange={(e) => setPlannedQuantity(e.target.value)}
          step={selectedFinishedProduct?.unit === "PIECE" ? "1" : "0.01"}
          min="0"
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Raw Material Types</label>
          <button
            type="button"
            className={outlinedButtonClass}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { key: crypto.randomUUID(), rawMaterialId: "" },
              ])
            }
          >
            <Plus className="mr-1 size-4" />
            Add Raw Material
          </button>
        </div>

        {rows.map((row, index) => {
          const selectedIds = new Set(
            rows.filter((r) => r.key !== row.key).map((r) => r.rawMaterialId)
          );
          const selectedMaterial = rawMaterials.find(
            (m) => m.id === row.rawMaterialId
          );

          return (
            <div key={row.key} className="rounded-md border bg-background p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Raw Material
                  </label>
                  <Select.Root
                    value={row.rawMaterialId}
                    onValueChange={(value) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key ? { ...r, rawMaterialId: value } : r
                        )
                      )
                    }
                  >
                    <Select.Trigger className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2">
                      <Select.Value placeholder="Select raw material" />
                      <Select.Icon>
                        <ChevronDown className="size-4 text-muted-foreground" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        position="popper"
                        className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border bg-popover shadow-md"
                      >
                        <Select.Viewport className="p-1">
                          {rawMaterials.map((material) => (
                            <Select.Item
                              key={material.id}
                              value={material.id}
                              disabled={selectedIds.has(material.id)}
                              className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-50"
                            >
                              <Select.ItemText>
                                {material.name} · Floor: {material.floorStock.toFixed(2)} kg
                              </Select.ItemText>
                              <Select.ItemIndicator className="absolute right-2 inline-flex items-center">
                                <Check className="size-4" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                  {selectedMaterial ? (
                    selectedMaterial.floorStock <= 0 ? (
                      <p className="text-xs font-medium text-amber-600">
                        No floor stock for {selectedMaterial.name}. Issue to floor before production.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Floor stock: {selectedMaterial.floorStock.toFixed(2)} kg
                      </p>
                    )
                  ) : null}
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) =>
                        prev.length === 1
                          ? prev
                          : prev.filter((r) => r.key !== row.key)
                      )
                    }
                    disabled={rows.length === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black bg-white text-black transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Remove raw material row ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <input
        type="hidden"
        name="rawMaterials"
        value={JSON.stringify(
          rows.map((r) => ({
            rawMaterialId: r.rawMaterialId,
          }))
        )}
      />
      <input type="hidden" name="finishedProductId" value={finishedProductId} />
      <input
        type="hidden"
        name="finishedProductVariantId"
        value={finishedProductVariantId}
      />

      {computedError ? (
        <p className="text-sm text-destructive">{computedError}</p>
      ) : null}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={outlinedButtonClass}
          onClick={() => router.push("/production")}
        >
          Exit
        </button>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Creating..." : "Create Work Order"}
        </button>
      </div>
    </form>
  );
}
