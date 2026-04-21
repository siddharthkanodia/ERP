"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown, Trash2 } from "lucide-react";

import { consumeFromFloorBatch } from "@/actions/production-floor";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type MaterialOption = {
  id: string;
  name: string;
  floorStock: number;
};

type LineItem = {
  id: string;
  materialId: string;
  quantity: string;
};

export function ConsumeFromFloorForm({ materials }: { materials: MaterialOption[] }) {
  const router = useRouter();
  const [date, setDate] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>(() => [
    { id: crypto.randomUUID(), materialId: "", quantity: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const materialById = useMemo(() => {
    const map = new Map<string, MaterialOption>();
    for (const m of materials) map.set(m.id, m);
    return map;
  }, [materials]);

  const duplicateError = useMemo(() => {
    const ids = lines.map((l) => l.materialId).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      return "Same raw material cannot be selected twice.";
    }
    return null;
  }, [lines]);

  function updateLine(id: string, field: "materialId" | "quantity", value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), materialId: "", quantity: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      setError("Please select a valid date.");
      return;
    }
    if (duplicateError) {
      setError(duplicateError);
      return;
    }

    const items: { materialId: string; quantity: number }[] = [];
    for (const line of lines) {
      if (!line.materialId) {
        setError("Please select a raw material for all rows.");
        return;
      }
      const qty = parseFloat(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Quantity must be greater than 0 for all rows.");
        return;
      }
      const material = materialById.get(line.materialId);
      if (!material) {
        setError("Please select a valid raw material.");
        return;
      }
      if (qty > material.floorStock) {
        setError(
          `Consume quantity for ${material.name} exceeds floor stock (${material.floorStock.toFixed(
            2
          )} kg).`
        );
        return;
      }
      items.push({ materialId: line.materialId, quantity: Math.round(qty * 100) / 100 });
    }

    startTransition(async () => {
      const result = await consumeFromFloorBatch({
        date: date.toISOString(),
        notes: notes.trim() === "" ? undefined : notes.trim(),
        items,
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Date</label>
        <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
          <Popover.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start bg-background px-3 text-left font-normal"
            >
              <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
              {format(date, "PPP")}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              className="z-50 rounded-md border bg-popover p-0 shadow-md"
            >
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setCalendarOpen(false);
                  }
                }}
                disabled={(d) => d > new Date()}
                initialFocus
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="consume-notes" className="text-sm font-medium">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="consume-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={2}
          placeholder="e.g. Work order reference, shift"
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
        <p className="text-xs text-muted-foreground">{notes.length}/500</p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Materials</p>
        {lines.map((line) => {
          const selected = materialById.get(line.materialId);
          const selectedOtherIds = new Set(
            lines.filter((l) => l.id !== line.id).map((l) => l.materialId)
          );
          return (
            <div key={line.id} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
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
                      side="bottom"
                      sideOffset={4}
                      className="z-50 max-h-60 min-w-(--radix-select-trigger-width) overflow-y-auto rounded-md border bg-popover shadow-md"
                    >
                      <Select.Viewport className="p-1">
                        {materials.map((m) => {
                          const isTakenElsewhere = selectedOtherIds.has(m.id);
                          return (
                            <Select.Item
                              key={m.id}
                              value={m.id}
                              disabled={isTakenElsewhere}
                              className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent"
                            >
                              <Select.ItemText>
                                {m.name} · {m.floorStock.toFixed(2)} kg on floor
                                {isTakenElsewhere ? " (already added)" : ""}
                              </Select.ItemText>
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
                {selected ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Floor stock: {selected.floorStock.toFixed(2)} kg
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                  className="h-9 w-32 rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  placeholder="e.g. 10"
                  aria-label="Quantity (kg)"
                />
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
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={addLine}>
        + Add another material
      </Button>

      {duplicateError && !error ? (
        <p className="text-sm text-destructive">{duplicateError}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-black bg-white px-3 text-black hover:bg-muted"
          onClick={() => router.push("/production-floor")}
        >
          Exit
        </Button>
        <Button type="submit" size="sm" className="h-8 px-3" disabled={isPending}>
          {isPending ? "Saving..." : "Consume Stock"}
        </Button>
      </div>
    </form>
  );
}
