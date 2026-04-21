"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown, Trash2 } from "lucide-react";

import {
  dispatchFinishedGoodsBatch,
  getAllFinishedProducts,
} from "@/actions/finished-products";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type LineItem = {
  id: string;
  finishedGoodId: string;
  quantity: string;
};

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

type SelectOption = {
  value: string;
  label: string;
  unit: "KG" | "PIECE";
  stock: number;
};

function buildSelectOptions(products: ProductOption[]): SelectOption[] {
  const out: SelectOption[] = [];
  for (const p of products) {
    if ((p.variants?.length ?? 0) > 0) {
      for (const v of p.variants) {
        out.push({
          value: `v:${v.id}`,
          label: `${p.name} — ${v.name}`,
          unit: p.unit,
          stock: v.quantityInStock,
        });
      }
    } else {
      out.push({
        value: `p:${p.id}`,
        label: p.name,
        unit: p.unit,
        stock: p.quantityInStock,
      });
    }
  }
  return out;
}

function mergeLines(lines: LineItem[]) {
  const map = new Map<string, number>();
  for (const line of lines) {
    const qty = parseFloat(line.quantity) || 0;
    map.set(line.finishedGoodId, (map.get(line.finishedGoodId) ?? 0) + qty);
  }
  return Array.from(map.entries()).map(([finishedGoodId, quantity]) => ({
    finishedGoodId,
    quantity,
  }));
}

export function DispatchForm() {
  const router = useRouter();
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [dispatchDate, setDispatchDate] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>(() => [
    { id: crypto.randomUUID(), finishedGoodId: "", quantity: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadProducts() {
      const res = await getAllFinishedProducts();
      const raw = res as unknown as ProductOption[];
      const mapped = raw.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        quantityInStock: Number(p.quantityInStock),
        variants: (p.variants ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          quantityInStock: Number(v.quantityInStock),
        })),
      }));
      setOptions(buildSelectOptions(mapped));
    }
    void loadProducts();
  }, []);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), finishedGoodId: "", quantity: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((l) => l.id !== id);
    });
  }

  function updateLine(
    id: string,
    field: keyof Pick<LineItem, "finishedGoodId" | "quantity">,
    value: string
  ) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  }

  function optionForValue(value: string): SelectOption | undefined {
    return options.find((o) => o.value === value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(dispatchDate instanceof Date) || Number.isNaN(dispatchDate.getTime())) {
      setError("Please select a valid dispatch date.");
      return;
    }

    for (const line of lines) {
      if (!line.finishedGoodId) {
        setError("Please select a finished good for all rows");
        return;
      }
    }

    for (const line of lines) {
      const qty = parseFloat(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Quantity must be greater than 0 for all rows");
        return;
      }
      const opt = optionForValue(line.finishedGoodId);
      if (opt?.unit === "PIECE" && !Number.isInteger(qty)) {
        setError("Pieces must be whole numbers.");
        return;
      }
    }

    const merged = mergeLines(lines);

    for (const row of merged) {
      const opt = optionForValue(row.finishedGoodId);
      if (!opt) {
        setError("One or more selected items are invalid.");
        return;
      }
      if (row.quantity > opt.stock) {
        setError("Dispatch quantity cannot exceed available stock.");
        return;
      }
      if (opt.unit === "PIECE" && !Number.isInteger(row.quantity)) {
        setError("Pieces must be whole numbers.");
        return;
      }
    }

    startTransition(async () => {
      const result = await dispatchFinishedGoodsBatch({
        dispatchDate: dispatchDate.toISOString(),
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
        <label className="text-sm font-medium">Dispatch Date</label>
        <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
          <Popover.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start bg-background px-3 text-left font-normal"
            >
              <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
              {format(dispatchDate, "PPP")}
            </Button>
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
        <label htmlFor="dispatch-notes" className="text-sm font-medium">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="dispatch-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={2}
          placeholder="e.g. Customer name, invoice number, remarks"
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
        <p className="text-xs text-muted-foreground">{notes.length}/500</p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Finished Goods</p>
        {lines.map((line, index) => {
          const opt = optionForValue(line.finishedGoodId);
          const unitLabel = opt?.unit === "PIECE" ? "pcs" : "kg";
          const step = opt?.unit === "PIECE" ? "1" : "0.01";
          return (
            <div key={line.id} className="flex w-full items-center gap-3">
              <div className="min-w-0 flex-1">
                <label className="text-xs text-muted-foreground sm:sr-only">
                  Finished good {index + 1}
                </label>
                <Select.Root
                  value={line.finishedGoodId || undefined}
                  onValueChange={(v) => updateLine(line.id, "finishedGoodId", v)}
                >
                  <Select.Trigger
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50",
                      "focus-visible:ring-2 data-placeholder:text-muted-foreground"
                    )}
                  >
                    <Select.Value placeholder="Select finished good" />
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
                        {options.map((o) => (
                          <Select.Item
                            key={o.value}
                            value={o.value}
                            className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                          >
                            <Select.ItemText>
                              {o.label} ({o.stock} {o.unit === "PIECE" ? "pcs" : "kg"})
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
              </div>
              <div className="w-32 shrink-0">
                <label className="text-xs text-muted-foreground sm:sr-only">
                  Qty ({unitLabel})
                </label>
                <input
                  type="number"
                  min={opt?.unit === "PIECE" ? 1 : 0.01}
                  step={step}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  placeholder={opt?.unit === "PIECE" ? "e.g. 10" : "e.g. 10.55"}
                />
              </div>
              <div className="shrink-0">
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
        + Add another finished good
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-black bg-white px-3 text-black hover:bg-muted"
          onClick={() => router.push("/finished-products")}
        >
          Exit
        </Button>
        <Button type="submit" size="sm" className="h-8 px-3" disabled={isPending}>
          {isPending ? "Saving..." : "Dispatch Stock"}
        </Button>
      </div>
    </form>
  );
}
