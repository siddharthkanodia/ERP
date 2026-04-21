"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { addProductionEntry } from "@/actions/production";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";

function todayLocalISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function AddProductionEntryForm({
  workOrderId,
  unit,
}: {
  workOrderId: string;
  unit: "KG" | "PIECE";
}) {
  const router = useRouter();
  const [quantityProduced, setQuantityProduced] = useState("");
  const [entryDate, setEntryDate] = useState(todayLocalISODate());
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    const result = await addProductionEntry(workOrderId, payload);
    setIsPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    setQuantityProduced("");
    setEntryDate(todayLocalISODate());
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <h2 className="text-sm font-semibold">Add Production Entry</h2>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Quantity Produced ({unit === "PIECE" ? "pcs" : "kg"})
          </label>
          <input
            type="number"
            min="0"
            step={unit === "PIECE" ? "1" : "0.01"}
            value={quantityProduced}
            onChange={(e) => setQuantityProduced(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            max={todayLocalISODate()}
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            required
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Adding..." : "Add Entry"}
        </button>
      </div>
    </form>
  );
}
