import { redirect } from "next/navigation";

import { getRawMaterialById } from "@/actions/raw-materials";

import { EditRawMaterialForm } from "./raw-material-edit-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditRawMaterialPage({ params }: PageProps) {
  const { id } = await params;
  const rawMaterial = await getRawMaterialById(id);

  if (!rawMaterial) {
    redirect("/raw-materials");
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Edit Raw Material</h1>
        <p className="text-sm text-muted-foreground">
          Update raw material details.
        </p>
      </header>

      <EditRawMaterialForm
        id={rawMaterial.id}
        initialName={rawMaterial.name}
        quantityInStock={rawMaterial.quantityInStock}
      />
    </section>
  );
}

