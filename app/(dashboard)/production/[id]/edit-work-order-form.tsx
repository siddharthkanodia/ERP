"use client";

import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateWorkOrder } from "@/actions/production";

import { useWorkOrder } from "./work-order-context";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";
const outlinedButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted";

export function EditWorkOrderForm({
  workOrder,
  rawMaterials,
  formId,
  disabled = false,
  hideSubmit = false,
}: {
  workOrder: {
    id: string;
    plannedQuantity: number;
    totalProduced: number;
    unit: "KG" | "PIECE";
    finishedProductName: string;
    finishedProductVariantName: string | null;
    rawMaterials: Array<{
      rawMaterialId: string;
      name: string;
    }>;
  };
  rawMaterials: Array<{
    id: string;
    name: string;
    floorStock: number;
  }>;
  formId?: string;
  disabled?: boolean;
  hideSubmit?: boolean;
}) {
  const router = useRouter();
  const { openCompletionModal } = useWorkOrder();
  const [plannedQuantity, setPlannedQuantity] = useState(
    workOrder.plannedQuantity.toString()
  );
  const [rows, setRows] = useState(
    workOrder.rawMaterials.map((rm) => ({
      key: crypto.randomUUID(),
      rawMaterialId: rm.rawMaterialId,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setError(null);

    const planned = Number.parseFloat(plannedQuantity);
    if (!Number.isFinite(planned) || planned <= 0) {
      setError("Planned quantity must be greater than 0.");
      return;
    }
    if (workOrder.unit === "PIECE" && !Number.isInteger(planned)) {
      setError("Planned quantity must be a whole number for pcs.");
      return;
    }

    if (rows.length === 0) {
      setError("At least one raw material type is required.");
      return;
    }

    const ids = rows.map((r) => r.rawMaterialId).filter(Boolean);
    if (ids.length !== rows.length) {
      setError("Please select raw material in all rows.");
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setError("Same raw material cannot be selected twice.");
      return;
    }

    const payload = new FormData();
    payload.set("plannedQuantity", planned.toString());
    payload.set(
      "rawMaterials",
      JSON.stringify(ids.map((rawMaterialId) => ({ rawMaterialId })))
    );

    setIsPending(true);
    const result = await updateWorkOrder(workOrder.id, payload);
    setIsPending(false);

    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }

    toast.success("Work order updated.");
    router.refresh();

    if (
      result &&
      "success" in result &&
      result.status === "OPEN" &&
      typeof result.updatedTotalProduced === "number" &&
      typeof result.plannedQuantity === "number" &&
      result.updatedTotalProduced >= result.plannedQuantity
    ) {
      openCompletionModal({
        totalProduced: result.updatedTotalProduced,
        plannedQuantity: result.plannedQuantity,
      });
    }
  }

  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      className="space-y-4 rounded-md border bg-card p-4"
    >
      <fieldset disabled={disabled} className="contents">
      <h2 className="text-sm font-semibold">Work Order Details</h2>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Finished Product</label>
        <input
          type="text"
          value={workOrder.finishedProductName}
          disabled
          readOnly
          className="h-9 w-full cursor-not-allowed rounded-md border bg-gray-50 px-3 py-2 text-sm opacity-50"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Variant</label>
        <input
          type="text"
          value={workOrder.finishedProductVariantName || "-"}
          disabled
          readOnly
          className="h-9 w-full cursor-not-allowed rounded-md border bg-gray-50 px-3 py-2 text-sm opacity-50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Planned Quantity ({workOrder.unit === "PIECE" ? "pcs" : "kg"})
        </label>
        <input
          type="number"
          min="0"
          step={workOrder.unit === "PIECE" ? "1" : "0.01"}
          value={plannedQuantity}
          onChange={(e) => setPlannedQuantity(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
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
                        No floor stock for {selectedMaterial.name}. Issue to floor before producing.
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {hideSubmit ? null : (
        <div className="flex justify-end">
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={isPending || disabled}
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
      </fieldset>
    </form>
  );
}
