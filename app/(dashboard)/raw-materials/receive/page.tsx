"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown } from "lucide-react";

import { getAllRawMaterials, receiveRawMaterial } from "@/actions/raw-materials";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type FormState = { error?: string };
type RawMaterialOption = { id: string; name: string };

const initialState: FormState = {};

export default function ReceiveRawMaterialPage() {
  const router = useRouter();
  const [rawMaterials, setRawMaterials] = useState<RawMaterialOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [receivedDate, setReceivedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    async function loadRawMaterials() {
      const materials = await getAllRawMaterials();
      setRawMaterials(materials.map((material) => ({ id: material.id, name: material.name })));
    }

    void loadRawMaterials();
  }, []);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const quantity = parseFloat(
        (formData.get("quantity") as string | null) ?? ""
      );
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { error: "Quantity must be greater than 0." };
      }
      if (!formData.get("id")) {
        return { error: "Please select a raw material." };
      }

      const normalizedFormData = new FormData();
      normalizedFormData.set("id", String(formData.get("id")));
      normalizedFormData.set("quantity", quantity.toString());
      normalizedFormData.set("receivedDate", receivedDate.toISOString());

      return (await receiveRawMaterial(normalizedFormData)) ?? {};
    },
    initialState
  );

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Receive Stock</h1>
        <p className="text-sm text-muted-foreground">
          Add newly received quantity to an existing raw material.
        </p>
      </header>

      <form action={formAction} className="space-y-4 rounded-md border bg-card p-4">
        <div className="space-y-1.5">
          <label htmlFor="raw-material-select" className="text-sm font-medium">
            Raw Material
          </label>
          <Select.Root value={selectedId} onValueChange={setSelectedId}>
            <Select.Trigger
              id="raw-material-select"
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
          <input type="hidden" name="id" value={selectedId} />
        </div>

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
          <label htmlFor="quantity" className="text-sm font-medium">
            Quantity Received (kg)
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={0.01}
            step="0.01"
            required
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            placeholder="e.g. 25"
          />
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
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
    </section>
  );
}
