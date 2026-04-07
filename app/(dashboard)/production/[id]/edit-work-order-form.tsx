"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateWorkOrder } from "@/actions/production";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";

export function EditWorkOrderForm({
  workOrder,
  availableStocks,
}: {
  workOrder: {
    id: string;
    plannedQuantity: number;
    totalProduced: number;
    unit: "KG" | "PIECE";
    finishedProductName: string;
    finishedProductVariantName: string | null;
    rawMaterials: Array<{
      id: string;
      rawMaterialId: string;
      name: string;
      quantityIssued: number;
    }>;
  };
  availableStocks: Array<{
    rawMaterialId: string;
    quantityInStock: number;
  }>;
}) {
  const router = useRouter();
  const [plannedQuantity, setPlannedQuantity] = useState(
    workOrder.plannedQuantity.toString()
  );
  const [rows, setRows] = useState(
    workOrder.rawMaterials.map((rm) => ({
      ...rm,
      quantityIssuedInput: rm.quantityIssued.toString(),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const planned = Number.parseFloat(plannedQuantity);
    if (!Number.isFinite(planned) || planned <= 0) {
      setError("Planned quantity must be greater than 0.");
      return;
    }
    if (planned < workOrder.totalProduced) {
      setError("Planned quantity cannot be less than total produced.");
      return;
    }
    if (workOrder.unit === "PIECE" && !Number.isInteger(planned)) {
      setError("Planned quantity must be a whole number for pcs.");
      return;
    }

    const parsedRows = rows.map((r) => ({
      id: r.id,
      rawMaterialId: r.rawMaterialId,
      oldQuantityIssued: r.quantityIssued,
      quantityIssued: Number.parseFloat(r.quantityIssuedInput),
    }));

    for (const row of parsedRows) {
      if (!Number.isFinite(row.quantityIssued) || row.quantityIssued <= 0) {
        setError("Each issued quantity must be greater than 0.");
        return;
      }
      const stock = availableStocks.find(
        (s) => s.rawMaterialId === row.rawMaterialId
      )?.quantityInStock;
      if (typeof stock === "number" && row.quantityIssued > row.oldQuantityIssued) {
        const extraNeeded = row.quantityIssued - row.oldQuantityIssued;
        if (extraNeeded > stock) {
          setError("Insufficient raw material stock for one or more rows.");
          return;
        }
      }
    }

    const payload = new FormData();
    payload.set("plannedQuantity", planned.toString());
    payload.set(
      "rawMaterials",
      JSON.stringify(
        parsedRows.map((r) => ({
          id: r.id,
          quantityIssued: r.quantityIssued,
        }))
      )
    );

    setIsPending(true);
    const result = await updateWorkOrder(workOrder.id, payload);
    setIsPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <h2 className="text-sm font-semibold">Work Order Details</h2>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Finished Product</label>
        <input
          type="text"
          value={workOrder.finishedProductName}
          disabled
          readOnly
          className="h-9 w-full rounded-md border bg-gray-50 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Variant</label>
        <input
          type="text"
          value={workOrder.finishedProductVariantName || "-"}
          disabled
          readOnly
          className="h-9 w-full rounded-md border bg-gray-50 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
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

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Raw Material Name</th>
              <th className="px-3 py-2 text-right font-medium">Quantity Issued</th>
              <th className="px-3 py-2 text-right font-medium">Available Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const available =
                availableStocks.find((s) => s.rawMaterialId === row.rawMaterialId)
                  ?.quantityInStock ?? 0;
              return (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.quantityIssuedInput}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? { ...r, quantityIssuedInput: e.target.value }
                              : r
                          )
                        )
                      }
                      className="h-8 w-28 rounded-md border bg-background px-2 py-1 text-right text-sm outline-none ring-ring/50 focus-visible:ring-2"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{available} kg</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

