"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { CalendarIcon, Check, ChevronDown } from "lucide-react";
import { format } from "date-fns";

import { createWasteEntry } from "@/actions/finished-products";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type WasteType = { id: string; name: string };

export function WasteEntryForm({ wasteTypes }: { wasteTypes: WasteType[] }) {
  const router = useRouter();
  const [wasteTypeId, setWasteTypeId] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const qty = parseFloat(quantity);
    if (!wasteTypeId) return setError("Please select a waste type.");
    if (Number.isNaN(date.getTime())) return setError("Please select a valid date.");
    if (date.getTime() > Date.now()) return setError("Date cannot be in the future.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Quantity must be greater than 0.");

    startTransition(async () => {
      const res = await createWasteEntry({
        date: date.toISOString(),
        wasteTypeId,
        quantity: qty,
        notes: notes.trim() || undefined,
      });
      if (res?.error) return setError(res.error);
      router.push("/finished-products/waste");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Date</label>
        <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
          <Popover.Trigger asChild>
            <Button type="button" variant="outline" className="h-9 w-full justify-start bg-background px-3 text-left font-normal">
              <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
              {format(date, "PPP")}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" className="z-50 rounded-md border bg-popover p-0 shadow-md">
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
        <label className="text-sm font-medium">Waste Type</label>
        <Select.Root value={wasteTypeId || undefined} onValueChange={setWasteTypeId}>
          <Select.Trigger
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50",
              "focus-visible:ring-2 data-placeholder:text-muted-foreground"
            )}
          >
            <Select.Value placeholder="Select waste type" />
            <Select.Icon>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" className="z-50 min-w-(--radix-select-trigger-width) rounded-md border bg-popover shadow-md">
              <Select.Viewport className="p-1">
                {wasteTypes.map((w) => (
                  <Select.Item
                    key={w.id}
                    value={w.id}
                    className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                  >
                    <Select.ItemText>{w.name}</Select.ItemText>
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

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Quantity (kg)</label>
        <input
          type="number"
          min={0.01}
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          placeholder="e.g. 12.5"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={2}
          placeholder="e.g. Shift-end cleaning waste"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" size="sm" variant="outline" className="h-8 border-black bg-white px-3 text-black hover:bg-muted" onClick={() => router.push("/finished-products/waste")}>
          Exit
        </Button>
        <Button type="submit" size="sm" className="h-8 px-3" disabled={isPending}>
          {isPending ? "Saving..." : "Add Waste"}
        </Button>
      </div>
    </form>
  );
}
