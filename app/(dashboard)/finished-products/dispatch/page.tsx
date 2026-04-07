"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown } from "lucide-react";

import {
  dispatchFinishedProduct,
  getAllFinishedProducts,
} from "@/actions/finished-products";
import { Calendar } from "@/components/ui/calendar";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";
const outlinedButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted";

type ProductOption = {
  id: string;
  name: string;
  unit: "KG" | "PIECE";
  quantityInStock: number;
  variants: Array<{
    id: string;
    name: string;
    quantityInStock: number;
  }>;
};

type FormState = {
  productError?: string;
  quantityError?: string;
};

const initialState: FormState = {};

export default function DispatchFinishedProductPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [localProductError, setLocalProductError] = useState<string | null>(null);
  const [dispatchDate, setDispatchDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedProduct = products.find((p) => p.id === selectedId);
  const selectedUnit: "KG" | "PIECE" = selectedProduct?.unit ?? "KG";
  const productVariants = selectedProduct?.variants ?? [];
  const hasVariants = productVariants.length > 0;
  const selectedVariant = productVariants.find((v) => v.id === selectedVariantId);
  const availableStock = selectedVariant
    ? selectedVariant.quantityInStock
    : hasVariants
      ? null
      : selectedProduct?.quantityInStock ?? null;

  useEffect(() => {
    async function loadProducts() {
      const res = await getAllFinishedProducts();
      const raw = res as unknown[];
      const mapped = raw.map((p) => {
          const obj = p as {
            id: string;
            name: string;
            unit: "KG" | "PIECE";
            quantityInStock: number;
            variants?: Array<{
              id: string;
              name: string;
              quantityInStock: number;
            }>;
          };
          return {
            id: obj.id,
            name: obj.name,
            unit: obj.unit,
            quantityInStock: obj.quantityInStock,
            variants: (obj.variants ?? []).map((variant) => ({
              id: variant.id,
              name: variant.name,
              quantityInStock: Number(variant.quantityInStock),
            })),
          };
        });
      setProducts(mapped);
      if (selectedId && !mapped.some((p) => p.id === selectedId)) {
        setSelectedId("");
        setSelectedVariantId("");
        setLocalProductError("This product was deleted");
      }
    }

    void loadProducts();
  }, [selectedId]);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const id = formData.get("id") as string | null;
      const variantId = (formData.get("variantId") as string | null)?.trim() ?? "";
      const rawQuantity = formData.get("quantity");
      const quantity =
        rawQuantity === null || rawQuantity === ""
          ? NaN
          : parseFloat(rawQuantity as string);

      if (!id) {
        return { productError: "Please select a finished product." };
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { quantityError: "Quantity must be greater than 0." };
      }
      if (hasVariants && !variantId) {
        return { productError: "Please select a variant." };
      }

      if (selectedUnit === "PIECE" && !Number.isInteger(quantity)) {
        return { quantityError: "Pieces must be whole numbers." };
      }

      const normalizedFormData = new FormData();
      normalizedFormData.set("id", id);
      normalizedFormData.set("productId", id);
      normalizedFormData.set("variantId", variantId);
      normalizedFormData.set("quantity", quantity.toString());
      normalizedFormData.set("dispatchDate", dispatchDate.toISOString());

      const res = await dispatchFinishedProduct(normalizedFormData);
      if (res?.error) {
        const err = res.error;
        if (err.toLowerCase().includes("select")) {
          return { productError: err };
        }
        return { quantityError: err };
      }

      return {};
    },
    initialState
  );

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Dispatch Stock
        </h1>
        <p className="text-sm text-muted-foreground">
          Reduce inventory by dispatching finished product quantity.
        </p>
      </header>

      <form
        action={formAction}
        className="space-y-4 rounded-md border bg-card p-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="finished-product-select" className="text-sm font-medium">
            Finished Product
          </label>
          <Select.Root
            value={selectedId}
            onValueChange={(value) => {
              setSelectedId(value);
              setSelectedVariantId("");
              setLocalProductError(null);
            }}
          >
            <Select.Trigger
              id="finished-product-select"
              className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            >
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
                  {products.map((product) => {
                    return (
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
                    );
                  })}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <input type="hidden" name="id" value={selectedId} />
          {state.productError || localProductError ? (
            <p className="text-sm text-destructive">
              {localProductError ?? state.productError}
            </p>
          ) : null}
        </div>

        {selectedProduct?.variants?.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="variant-select" className="text-sm font-medium">
              Variant
            </label>
            <Select.Root value={selectedVariantId} onValueChange={setSelectedVariantId}>
              <Select.Trigger
                id="variant-select"
                className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
              >
                <Select.Value placeholder="Select Variant" />
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
                    {productVariants.map((variant) => (
                      <Select.Item
                        key={variant.id}
                        value={variant.id}
                        className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                      >
                        <Select.ItemText>
                          {variant.name} ({variant.quantityInStock}{" "}
                          {selectedUnit === "PIECE" ? "pcs" : "kg"})
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
            <input type="hidden" name="variantId" value={selectedVariantId} />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Dispatch Date</label>
          <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="flex h-9 w-full items-center rounded-md border bg-background px-3 text-left text-sm font-normal"
              >
                <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                {format(dispatchDate, "PPP")}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                className="z-50 rounded-md border bg-popover p-0 shadow-md"
              >
                <Calendar
                  mode="single"
                  selected={dispatchDate}
                  onSelect={(date) => {
                    if (date) {
                      setDispatchDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="quantity" className="text-sm font-medium">
            {selectedUnit === "PIECE"
              ? "Quantity to Dispatch (pieces)"
              : "Quantity to Dispatch (kg)"}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step={selectedUnit === "PIECE" ? "1" : "0.01"}
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            placeholder={selectedUnit === "PIECE" ? "e.g. 10" : "e.g. 10.55"}
          />
          {(selectedProduct && !hasVariants) || (hasVariants && selectedVariant) ? (
            <p className="text-xs text-muted-foreground">
              Available Stock: {availableStock ?? 0}{" "}
              {selectedUnit === "PIECE" ? "pcs" : "kg"}
            </p>
          ) : null}
          {state.quantityError ? (
            <p className="text-sm text-destructive">{state.quantityError}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={outlinedButtonClass}
            onClick={() => router.push("/finished-products")}
          >
            Exit
          </button>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={isPending}
          >
            {isPending ? "Dispatching..." : "Dispatch Stock"}
          </button>
        </div>
      </form>
    </section>
  );
}

