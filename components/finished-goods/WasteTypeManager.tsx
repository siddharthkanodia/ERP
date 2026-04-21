"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createWasteType,
  createWasteVariant,
} from "@/actions/finished-products";
import { Button } from "@/components/ui/button";

type WasteType = {
  id: string;
  name: string;
  variantCount: number;
  variants: Array<{ id: string; name: string }>;
};

export function WasteTypeManager({ initialWasteTypes }: { initialWasteTypes: WasteType[] }) {
  const router = useRouter();
  const [newTypeName, setNewTypeName] = useState("");
  const [newVariantNames, setNewVariantNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAddWasteType(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await createWasteType(newTypeName);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setNewTypeName("");
      setSuccess("Waste type added.");
      router.refresh();
    });
  }

  function handleAddVariant(wasteTypeId: string) {
    setError(null);
    setSuccess(null);
    const name = newVariantNames[wasteTypeId] ?? "";

    startTransition(async () => {
      const res = await createWasteVariant({ wasteTypeId, name });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setNewVariantNames((prev) => ({ ...prev, [wasteTypeId]: "" }));
      setSuccess("Variant added.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddWasteType} className="space-y-3 rounded-md border bg-card p-4">
        <label htmlFor="waste-type-name" className="text-sm font-medium">
          Add Waste Type
        </label>
        <div className="flex gap-2">
          <input
            id="waste-type-name"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="e.g. Plastic Scrap"
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          />
          <Button type="submit" size="sm" className="h-9 px-3" disabled={isPending}>
            Add Waste Type
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="rounded-md border bg-card">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium text-right">Variant Count</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialWasteTypes.map((w) => (
              <tr key={w.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">{w.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{w.variantCount}</td>
                <td className="px-3 py-2">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={newVariantNames[w.id] ?? ""}
                        onChange={(e) =>
                          setNewVariantNames((prev) => ({ ...prev, [w.id]: e.target.value }))
                        }
                        placeholder="Variant name"
                        className="h-8 w-full max-w-xs rounded-md border bg-background px-3 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-3"
                        onClick={() => handleAddVariant(w.id)}
                        disabled={isPending}
                      >
                        Add Variant
                      </Button>
                    </div>
                    {w.variants.length ? (
                      <div className="text-xs text-muted-foreground">
                        {w.variants.map((v) => v.name).join(", ")}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No variants</div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
