"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import * as Switch from "@radix-ui/react-switch";
import { Plus, Trash2 } from "lucide-react";

import { createFinishedProduct } from "@/actions/finished-products";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";
const outlinedButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted";

type UnitOfMeasure = "KG" | "PIECE";

type FormState = {
  nameError?: string;
  quantityError?: string;
  variantError?: string;
  weightPerPieceError?: string;
};

const initialState: FormState = {};

export default function NewFinishedProductPage() {
  const router = useRouter();
  const [unit, setUnit] = useState<UnitOfMeasure>("KG");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [weightPerPiece, setWeightPerPiece] = useState("");
  const [variants, setVariants] = useState<
    Array<{
      key: string;
      name: string;
      weightPerPiece: string;
      initialQuantity: string;
    }>
  >([]);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const name = (formData.get("name") as string | null)?.trim() ?? "";
      const unitValue =
        (formData.get("unit") as UnitOfMeasure | null) ?? "KG";
      const parsedInitialQuantity = parseFloat(initialQuantity || "0");
      const parsedWeightPerPiece = parseFloat(weightPerPiece || "");

      if (!name) {
        return { nameError: "Name is required." };
      }

      if (variants.length === 0) {
        if (!Number.isFinite(parsedInitialQuantity) || parsedInitialQuantity < 0) {
          return {
            quantityError: "Initial quantity must be greater than or equal to 0.",
          };
        }
        if (unitValue === "PIECE" && !Number.isInteger(parsedInitialQuantity)) {
          return { quantityError: "Pieces must be whole numbers." };
        }
        if (unitValue === "PIECE") {
          if (!Number.isFinite(parsedWeightPerPiece)) {
            return { weightPerPieceError: "Weight per piece is required." };
          }
          if (parsedWeightPerPiece <= 0) {
            return { weightPerPieceError: "Must be greater than 0." };
          }
        }
      }

      const normalizedVariants = variants.map((variant) => ({
        clientKey: variant.key,
        name: variant.name.trim(),
        weightPerPiece: parseFloat(variant.weightPerPiece),
        initialQuantity: parseFloat(variant.initialQuantity || "0"),
      }));
      const variantNames = new Set<string>();
      for (const variant of normalizedVariants) {
        if (!variant.name) {
          return { variantError: "Variant name is required for all variant rows." };
        }
        if (!Number.isFinite(variant.weightPerPiece) || variant.weightPerPiece <= 0) {
          return { variantError: "Weight must be greater than 0." };
        }
        if (!Number.isFinite(variant.initialQuantity) || variant.initialQuantity < 0) {
          return {
            variantError: "Variant initial quantity must be greater than or equal to 0.",
          };
        }
        if (unitValue === "PIECE" && !Number.isInteger(variant.initialQuantity)) {
          return { variantError: "Pieces must be whole numbers." };
        }
        const normalizedName = variant.name.toLowerCase();
        if (variantNames.has(normalizedName)) {
          return { variantError: "Duplicate variant names are not allowed." };
        }
        variantNames.add(normalizedName);
      }

      const normalizedFormData = new FormData();
      normalizedFormData.set("name", name);
      normalizedFormData.set("unit", unitValue);
      normalizedFormData.set("initialQuantity", parsedInitialQuantity.toString());
      normalizedFormData.set(
        "weightPerPiece",
        unitValue === "PIECE" && variants.length === 0 && Number.isFinite(parsedWeightPerPiece)
          ? parsedWeightPerPiece.toString()
          : ""
      );
      normalizedFormData.set("variants", JSON.stringify(normalizedVariants));

      const res = await createFinishedProduct(normalizedFormData);
      if (res?.error) {
        const err = res.error;
        if (err === "Name is required." || err.includes("already exists")) {
          return { nameError: err };
        }
        if (err.toLowerCase().includes("initial quantity")) {
          return { quantityError: err };
        }
        return { variantError: err };
      }

      return {};
    },
    initialState
  );
  const nameCounts = variants.reduce<Record<string, number>>((acc, variant) => {
    const key = variant.name.trim().toLowerCase();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const totalVariantStock = variants.reduce(
    (sum, variant) => sum + (parseFloat(variant.initialQuantity || "0") || 0),
    0
  );

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Add Finished Product
        </h1>
        <p className="text-sm text-muted-foreground">
          Create a new finished product type for inventory tracking.
        </p>
      </header>

      <form
        action={formAction}
        className="space-y-4 rounded-md border bg-card p-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          />
          {state.nameError ? (
            <p className="text-sm text-destructive">{state.nameError}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Unit</span>
          <div className="flex items-center gap-2">
            <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
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
                aria-label="Toggle unit of measure"
                checked={unit === "PIECE"}
                onCheckedChange={(checked) =>
                  setUnit(checked ? "PIECE" : "KG")
                }
                className="relative h-5 w-9 cursor-pointer rounded-full border border-black bg-white transition-colors data-[state=checked]:bg-black"
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
            {variants.length > 0 ? (
              <span className="text-sm text-muted-foreground">
                Total Stock: {totalVariantStock} {unit === "PIECE" ? "pcs" : "kg"}
              </span>
            ) : null}
          </div>
          <input type="hidden" name="unit" value={unit} />
        </div>

        {variants.length === 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="initialQuantity" className="text-sm font-medium">
              Initial Quantity ({unit === "PIECE" ? "pcs" : "kg"})
            </label>
            <input
              id="initialQuantity"
              type="number"
              step={unit === "PIECE" ? "1" : "0.01"}
              min="0"
              value={initialQuantity}
              onChange={(e) => setInitialQuantity(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            />
            {state.quantityError ? (
              <p className="text-sm text-destructive">{state.quantityError}</p>
            ) : null}
          </div>
        ) : null}

        {unit === "PIECE" && variants.length === 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="weightPerPiece" className="text-sm font-medium">
              Weight per Piece (kg)
            </label>
            <input
              id="weightPerPiece"
              name="weightPerPiece"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="e.g. 0.25"
              value={weightPerPiece}
              onChange={(e) => setWeightPerPiece(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            />
            <p className="text-xs text-muted-foreground">
              Weight of a single unit in kg. Cannot be changed after saving.
            </p>
            {state.weightPerPieceError ? (
              <p className="text-sm text-destructive">{state.weightPerPieceError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Variants (Optional)</h2>
            <button
              type="button"
              className={outlinedButtonClass}
              onClick={() =>
                setVariants((prev) =>
                  prev.length === 0
                    ? [
                        {
                          key: crypto.randomUUID(),
                          name: "",
                          weightPerPiece: "",
                          initialQuantity: "",
                        },
                        {
                          key: crypto.randomUUID(),
                          name: "",
                          weightPerPiece: "",
                          initialQuantity: "",
                        },
                      ]
                    : [
                        ...prev,
                        {
                          key: crypto.randomUUID(),
                          name: "",
                          weightPerPiece: "",
                          initialQuantity: "",
                        },
                      ]
                )
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
              {variants.map((variant) => (
                <div
                  key={variant.key}
                  className="grid gap-2 rounded-md border bg-card p-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 500g, 1kg"
                      value={variant.name}
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
                    {!variant.name.trim() ? (
                      <p className="text-xs text-destructive">Name is required.</p>
                    ) : nameCounts[variant.name.trim().toLowerCase()] > 1 ? (
                      <p className="text-xs text-destructive">
                        Duplicate variant name.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Initial Quantity ({unit === "PIECE" ? "pcs" : "kg"})
                    </label>
                    <input
                      type="number"
                      step={unit === "PIECE" ? "1" : "0.01"}
                      min="0"
                      value={variant.initialQuantity}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((row) =>
                            row.key === variant.key
                              ? { ...row, initialQuantity: e.target.value }
                              : row
                          )
                        )
                      }
                      className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                    />
                    {(() => {
                      if (variant.initialQuantity.trim() === "") return null;
                      const qty = parseFloat(variant.initialQuantity);
                      if (!Number.isFinite(qty) || qty < 0) {
                        return (
                          <p className="text-xs text-destructive">
                            Quantity must be greater than or equal to 0.
                          </p>
                        );
                      }
                      if (unit === "PIECE" && !Number.isInteger(qty)) {
                        return (
                          <p className="text-xs text-destructive">
                            Pieces must be whole numbers.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={variant.weightPerPiece}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((row) =>
                            row.key === variant.key
                              ? { ...row, weightPerPiece: e.target.value }
                              : row
                          )
                        )
                      }
                      className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                    />
                    {(() => {
                      const weightKg = parseFloat(variant.weightPerPiece);
                      return Number.isFinite(weightKg) && weightKg > 0 ? null : (
                        <p className="text-xs text-destructive">
                          Weight must be greater than 0.
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setVariants((prev) =>
                          prev.filter((row) => row.key !== variant.key)
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black bg-white text-black transition-colors hover:bg-muted"
                      aria-label="Remove variant row"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {state.variantError ? (
            <p className="text-sm text-destructive">{state.variantError}</p>
          ) : null}
        </div>
        <input
          type="hidden"
          name="variants"
          value={JSON.stringify(
            variants.map((variant) => ({
              clientKey: variant.key,
              name: variant.name.trim(),
              weightPerPiece: parseFloat(variant.weightPerPiece || "0"),
              initialQuantity: parseFloat(variant.initialQuantity || "0"),
            }))
          )}
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={outlinedButtonClass}
            onClick={() => router.push("/finished-products")}
          >
            Exit
          </button>
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? "Creating..." : "Create Finished Product"}
          </button>
        </div>
      </form>
    </section>
  );
}

