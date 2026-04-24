"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown, Pencil, Trash2 } from "lucide-react";

import {
  deleteFloorLedgerEntry,
  updateFloorLedgerEntry,
  type FloorLedgerEntry,
} from "@/actions/production-floor";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type MaterialOption = { id: string; name: string };

function eventBadgeClass(eventType: FloorLedgerEntry["eventType"]) {
  switch (eventType) {
    case "ISSUE":
      return "bg-emerald-100 text-emerald-800";
    case "CONSUME":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function signedAdjustment(entry: FloorLedgerEntry) {
  if (entry.eventType === "ADJUSTMENT") {
    return entry.quantityIn - entry.quantityOut;
  }
  return 0;
}

export function FloorTransactionsClient({
  materials,
  selectedId,
  entries,
}: {
  materials: MaterialOption[];
  selectedId: string;
  entries: FloorLedgerEntry[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<FloorLedgerEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSelectMaterial(id: string) {
    router.push(`/production-floor/transactions?materialId=${id}`);
  }

  function onDelete(entry: FloorLedgerEntry) {
    const confirmText =
      entry.eventType === "ISSUE"
        ? `Delete this issue of ${entry.quantityIn.toFixed(2)} kg? The quantity will be returned to warehouse stock and downstream balances will be recalculated.`
        : `Delete this ${entry.eventType.toLowerCase()} entry? Downstream balances will be recalculated.`;
    if (!window.confirm(confirmText)) return;

    setPageError(null);
    setDeletingId(entry.id);
    startTransition(async () => {
      const result = await deleteFloorLedgerEntry(entry.id);
      setDeletingId(null);
      if ("error" in result) {
        setPageError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <label className="text-sm font-medium">Raw Material</label>
          <Select.Root value={selectedId || undefined} onValueChange={onSelectMaterial}>
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
                  {materials.map((m) => (
                    <Select.Item
                      key={m.id}
                      value={m.id}
                      className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                    >
                      <Select.ItemText>{m.name}</Select.ItemText>
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
        <p className="text-xs text-muted-foreground">
          Showing up to 200 most recent entries.
        </p>
      </div>

      {pageError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {pageError}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/40">
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">In</th>
              <th className="px-3 py-2 text-right font-medium">Out</th>
              <th className="px-3 py-2 text-right font-medium">Opening</th>
              <th className="px-3 py-2 text-right font-medium">Closing</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No ledger entries yet for this raw material.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const adj = signedAdjustment(entry);
                return (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          eventBadgeClass(entry.eventType)
                        )}
                      >
                        {entry.eventType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {entry.quantityIn > 0 ? entry.quantityIn.toFixed(2) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {entry.quantityOut > 0 ? entry.quantityOut.toFixed(2) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {entry.openingBalance.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {entry.closingBalance.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground">
                      {entry.eventType === "ADJUSTMENT" && adj !== 0 ? (
                        <span
                          className={cn(
                            "mr-1 text-xs font-medium",
                            adj > 0 ? "text-emerald-700" : "text-rose-700"
                          )}
                        >
                          {adj > 0 ? "+" : ""}
                          {adj.toFixed(2)} kg
                        </span>
                      ) : null}
                      {entry.notes ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-black bg-white px-2 text-xs text-black hover:bg-muted"
                          onClick={() => {
                            setPageError(null);
                            setEditing(entry);
                          }}
                          disabled={isPending}
                        >
                          <Pencil className="mr-1 size-3" /> Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-destructive/40 bg-white px-2 text-xs text-destructive hover:bg-destructive/5"
                          onClick={() => onDelete(entry)}
                          disabled={isPending && deletingId === entry.id}
                        >
                          <Trash2 className="mr-1 size-3" />
                          {isPending && deletingId === entry.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <EditLedgerDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function EditLedgerDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: FloorLedgerEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<Date>(() => new Date(entry.date));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const initialAdj: "IN" | "OUT" =
    entry.eventType === "ADJUSTMENT"
      ? entry.quantityIn >= entry.quantityOut
        ? "IN"
        : "OUT"
      : "IN";
  const [adjustmentType, setAdjustmentType] = useState<"IN" | "OUT">(initialAdj);
  const initialQty =
    entry.eventType === "ISSUE"
      ? entry.quantityIn
      : entry.eventType === "CONSUME"
      ? entry.quantityOut
      : Math.max(entry.quantityIn, entry.quantityOut);
  const [quantity, setQuantity] = useState<string>(initialQty.toFixed(2));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const title = useMemo(() => {
    switch (entry.eventType) {
      case "ISSUE":
        return "Edit Issue Entry";
      case "CONSUME":
        return "Edit Consume Entry";
      default:
        return "Edit Adjustment Entry";
    }
  }, [entry.eventType]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      setError("Please select a valid date.");
      return;
    }
    const qty = parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    let quantityIn = 0;
    let quantityOut = 0;
    if (entry.eventType === "ISSUE") {
      quantityIn = qty;
    } else if (entry.eventType === "CONSUME") {
      quantityOut = qty;
    } else if (adjustmentType === "IN") {
      quantityIn = qty;
    } else {
      quantityOut = qty;
    }

    startTransition(async () => {
      const result = await updateFloorLedgerEntry(entry.id, {
        date: date.toISOString(),
        notes: notes.trim() === "" ? undefined : notes.trim(),
        quantityIn: Math.round(quantityIn * 100) / 100,
        quantityOut: Math.round(quantityOut * 100) / 100,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
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

          {entry.eventType === "ADJUSTMENT" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Adjustment Type</label>
              <div className="inline-flex overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={() => setAdjustmentType("IN")}
                  className={cn(
                    "h-9 px-4 text-sm font-medium",
                    adjustmentType === "IN"
                      ? "bg-black text-white"
                      : "bg-background text-foreground hover:bg-muted"
                  )}
                >
                  IN (+)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentType("OUT")}
                  className={cn(
                    "h-9 px-4 text-sm font-medium",
                    adjustmentType === "OUT"
                      ? "bg-black text-white"
                      : "bg-background text-foreground hover:bg-muted"
                  )}
                >
                  OUT (−)
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-quantity">
              Quantity (kg)
            </label>
            <input
              id="edit-quantity"
              type="number"
              min={0.01}
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-notes" className="text-sm font-medium">
              Notes{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={2}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            />
          </div>

          {entry.eventType === "ISSUE" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Editing an issue adjusts warehouse stock to match the new quantity
              and logs a reconciliation entry in the raw material ledger.
            </p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-black bg-white px-3 text-black hover:bg-muted"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8 px-3" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
