"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { addProductionEntry } from "@/actions/production";

const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";

export function AddProductionEntryForm({
  workOrderId,
  unit,
}: {
  workOrderId: string;
  unit: "KG" | "PIECE";
}) {
  const router = useRouter();
  const [quantityProduced, setQuantityProduced] = useState("");
  const [wasteGenerated, setWasteGenerated] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    const result = await addProductionEntry(workOrderId, payload);
    setIsPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    setQuantityProduced("");
    setWasteGenerated("0");
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
          <label className="text-sm font-medium">
            Waste Generated (kg)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={wasteGenerated}
            onChange={(e) => setWasteGenerated(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
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

