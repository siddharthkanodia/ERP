"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateProductionEntry } from "@/actions/production";

type Entry = {
  id: string;
  entryDate: Date;
  quantityProduced: number;
  wasteGenerated: number;
  createdAt: Date;
};

export function ProductionEntriesTable({
  workOrderId,
  unit,
  entries,
}: {
  workOrderId: string;
  unit: "KG" | "PIECE";
  entries: Entry[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quantityProduced, setQuantityProduced] = useState("");
  const [wasteGenerated, setWasteGenerated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
  );

  async function saveEdit(entryId: string) {
    setError(null);
    const produced = Number.parseFloat(quantityProduced);
    const waste = Number.parseFloat(wasteGenerated || "0");
    if (!Number.isFinite(produced) || produced <= 0) {
      setError("Quantity produced must be greater than 0.");
      return;
    }
    if (!Number.isFinite(waste) || waste < 0) {
      setError("Waste generated cannot be negative.");
      return;
    }
    if (unit === "PIECE" && !Number.isInteger(produced)) {
      setError("Quantity produced must be a whole number for pcs.");
      return;
    }

    const payload = new FormData();
    payload.set("quantityProduced", produced.toString());
    payload.set("wasteGenerated", waste.toString());

    setIsPending(true);
    const result = await updateProductionEntry(entryId, payload);
    setIsPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    setEditingId(null);
    setQuantityProduced("");
    setWasteGenerated("");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-md border bg-card p-4">
      <h2 className="text-sm font-semibold">Production Entries</h2>

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
                <th className="px-3 py-2 text-right font-medium">
                  Waste (kg)
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
                      {format(entry.entryDate, "dd MMM yyyy, HH:mm")}
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
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wasteGenerated}
                          onChange={(e) => setWasteGenerated(e.target.value)}
                          className="h-8 w-28 rounded-md border bg-background px-2 py-1 text-right text-sm outline-none ring-ring/50 focus-visible:ring-2"
                        />
                      ) : (
                        `${entry.wasteGenerated} kg`
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
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
                          className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-black transition-colors hover:bg-muted"
                          onClick={() => {
                            setEditingId(entry.id);
                            setQuantityProduced(entry.quantityProduced.toString());
                            setWasteGenerated(entry.wasteGenerated.toString());
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

