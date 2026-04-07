"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { updateRawMaterial } from "@/actions/raw-materials";
import { Button } from "@/components/ui/button";

type FormState = { error?: string };

type Props = {
  id: string;
  initialName: string;
  quantityInStock: number;
};

const initialState: FormState = {};

export function EditRawMaterialForm({ id, initialName, quantityInStock }: Props) {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const name = (formData.get("name") as string | null)?.trim() ?? "";
      if (!name) {
        return { error: "Name is required." };
      }

      const normalizedFormData = new FormData();
      normalizedFormData.set("name", name);

      return (await updateRawMaterial(id, normalizedFormData)) ?? {};
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initialName}
          required
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="currentStock" className="text-sm font-medium">
          Current Stock (kg)
        </label>
        <input
          id="currentStock"
          type="text"
          value={quantityInStock}
          disabled
          className="h-9 w-full rounded-md border bg-gray-50 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
          readOnly
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

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
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

