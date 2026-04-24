"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateProductionEntry } from "@/actions/production";

import { useWorkOrder } from "./work-order-context";

type Entry = {
  id: string;
  entryDate: Date;
  quantityProduced: number;
  createdAt: Date;
};

function toDateInputValue(date: Date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayLocalISODate() {
  return toDateInputValue(new Date());
}

export function ProductionEntriesTable({
  workOrderId,
  unit,
  entries,
  disabled = false,
}: {
  workOrderId: string;
  unit: "KG" | "PIECE";
  entries: Entry[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const { openCompletionModal } = useWorkOrder();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quantityProduced, setQuantityProduced] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
  );

  async function saveEdit(entryId: string) {
    setError(null);
    const produced = Number.parseFloat(quantityProduced);
    if (!Number.isFinite(produced) || produced <= 0) {
      setError("Production quantity must be greater than 0.");
      return;
    }
    if (unit === "PIECE" && !Number.isInteger(produced)) {
      setError("Production quantity must be a whole number for pcs.");
      return;
    }
    if (!entryDate) {
      setError("Entry date is required.");
      return;
    }

    const payload = new FormData();
    payload.set("quantityProduced", produced.toString());
    payload.set("entryDate", entryDate);

    setIsPending(true);
    const result = await updateProductionEntry(entryId, payload);
    setIsPending(false);

    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }

    toast.success("Production entry updated.");

    setEditingId(null);
    setQuantityProduced("");
    setEntryDate("");
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
    <div className="space-y-2 rounded-md border bg-card p-4">
      <h2 className="text-sm font-semibold">Production History</h2>

      {sortedEntries.length === 0 ? (
        <div className="rounded-md border bg-background px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No production entries yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">
                  Quantity Produced ({unit === "PIECE" ? "pcs" : "kg"})
                </th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => {
                const isEditing = editingId === entry.id;
                return (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="date"
                          value={entryDate}
                          onChange={(e) => setEntryDate(e.target.value)}
                          max={todayLocalISODate()}
                          className="h-8 rounded-md border bg-background px-2 py-1 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                        />
                      ) : (
                        format(entry.entryDate, "dd MMM yyyy")
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step={unit === "PIECE" ? "1" : "0.01"}
                          value={quantityProduced}
                          onChange={(e) => setQuantityProduced(e.target.value)}
                          className="h-8 w-28 rounded-md border bg-background px-2 py-1 text-right text-sm outline-none ring-ring/50 focus-visible:ring-2"
                        />
                      ) : (
                        `${entry.quantityProduced} ${unit === "PIECE" ? "pcs" : "kg"}`
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {disabled ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-xs font-medium text-black transition-colors hover:bg-muted"
                            onClick={() => saveEdit(entry.id)}
                            disabled={isPending}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-xs font-medium text-black transition-colors hover:bg-muted"
                            onClick={() => {
                              setEditingId(null);
                              setError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-black transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            setEditingId(entry.id);
                            setQuantityProduced(entry.quantityProduced.toString());
                            setEntryDate(toDateInputValue(entry.entryDate));
                            setError(null);
                          }}
                          aria-label={`Edit production entry ${entry.id}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <input type="hidden" value={workOrderId} readOnly />
    </div>
  );
}
