"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { createRawMaterial } from "@/actions/raw-materials";
import { Button } from "@/components/ui/button";

type FormState = { error?: string };

const initialState: FormState = {};

export default function NewRawMaterialPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const name = (formData.get("name") as string | null)?.trim() ?? "";
      const initialQuantity = parseFloat(
        (formData.get("initialQuantity") as string | null) ?? "0"
      );
      if (!name) {
        return { error: "Name is required." };
      }
      if (Number.isNaN(initialQuantity) || initialQuantity < 0) {
        return { error: "Initial quantity must be greater than or equal to 0." };
      }

      const normalizedFormData = new FormData();
      normalizedFormData.set("name", name);
      normalizedFormData.set("initialQuantity", initialQuantity.toString());

      return (await createRawMaterial(normalizedFormData)) ?? {};
    },
    initialState
  );

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Add Raw Material</h1>
        <p className="text-sm text-muted-foreground">
          Create a new raw material type for inventory tracking.
        </p>
      </header>

      <form action={formAction} className="space-y-4 rounded-md border bg-card p-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
            placeholder="e.g. Aluminum Sheets"
          />
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="initialQuantity" className="text-sm font-medium">
            Initial Quantity (kg)
          </label>
          <input
            id="initialQuantity"
            name="initialQuantity"
            type="number"
            defaultValue={0}
            min={0}
            step="0.01"
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          />
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
            {isPending ? "Saving..." : "Create Raw Material"}
          </Button>
        </div>
      </form>
    </section>
  );
}
