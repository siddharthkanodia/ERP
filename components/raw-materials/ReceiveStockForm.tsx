"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown, Trash2 } from "lucide-react";

import { getAllRawMaterials, receiveStockBatch } from "@/actions/raw-materials";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type LineItem = {
  id: string;
  materialId: string;
  quantity: string;
};

type RawMaterialOption = { id: string; name: string };

function mergeLines(lines: LineItem[]) {
  const map = new Map<string, number>();
  for (const line of lines) {
    const qty = parseFloat(line.quantity) || 0;
    map.set(line.materialId, (map.get(line.materialId) ?? 0) + qty);
  }
  return Array.from(map.entries()).map(([materialId, quantity]) => ({
    materialId,
    quantity,
  }));
}

export function ReceiveStockForm() {
  const router = useRouter();
  const [rawMaterials, setRawMaterials] = useState<RawMaterialOption[]>([]);
  const [receivedDate, setReceivedDate] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>(() => [
    { id: crypto.randomUUID(), materialId: "", quantity: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadRawMaterials() {
      const materials = await getAllRawMaterials();
      setRawMaterials(
        materials.map((material) => ({ id: material.id, name: material.name }))
      );
    }
    void loadRawMaterials();
  }, []);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), materialId: "", quantity: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((l) => l.id !== id);
    });
  }

  function updateLine(id: string, field: keyof Pick<LineItem, "materialId" | "quantity">, value: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(receivedDate instanceof Date) || Number.isNaN(receivedDate.getTime())) {
      setError("Please select a valid received date.");
      return;
    }

    for (const line of lines) {
      if (!line.materialId) {
        setError("Please select a raw material for all rows");
        return;
      }
    }

    for (const line of lines) {
      const qty = parseFloat(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Quantity must be greater than 0 for all rows");
        return;
      }
    }

    const merged = mergeLines(lines);

    startTransition(async () => {
      const result = await receiveStockBatch({
        receivedDate: receivedDate.toISOString(),
        notes: notes.trim() === "" ? undefined : notes.trim(),
        items: merged,
      });
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Received Date</label>
        <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
          <Popover.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start bg-background px-3 text-left font-normal"
            >
              <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
              {format(receivedDate, "PPP")}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              className="z-50 rounded-md border bg-popover p-0 shadow-md"
            >
              <Calendar
                mode="single"
                selected={receivedDate}
                onSelect={(date) => {
                  if (date) {
                    setReceivedDate(date);
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
        <label htmlFor="receive-notes" className="text-sm font-medium">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="receive-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={2}
          placeholder="e.g. Supplier name, invoice number, remarks"
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
        <p className="text-xs text-muted-foreground">{notes.length}/500</p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Materials</p>
        {lines.map((line, index) => (
          <div
            key={line.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground sm:sr-only">
                Material {index + 1}
              </label>
              <Select.Root
                value={line.materialId || undefined}
                onValueChange={(v) => updateLine(line.id, "materialId", v)}
              >
                <Select.Trigger
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50",
                    "focus-visible:ring-2 data-placeholder:text-muted-foreground"
                  )}
                >
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
                          className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                        >
                          <Select.ItemText>{material.name}</Select.ItemText>
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
            <div className="w-full space-y-1.5 sm:w-32">
              <label className="text-xs text-muted-foreground sm:sr-only">Qty (kg)</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={line.quantity}
                onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                placeholder="e.g. 25"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 shrink-0"
              disabled={lines.length === 1}
              onClick={() => removeLine(line.id)}
              aria-label="Remove row"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={addLine}>
        + Add another material
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-black bg-white px-3 text-black hover:bg-muted"
          onClick={() => router.push("/raw-materials")}
        >
          Exit
        </Button>
        <Button type="submit" size="sm" className="h-8 px-3" disabled={isPending}>
          {isPending ? "Saving..." : "Receive Stock"}
        </Button>
      </div>
    </form>
  );
}
