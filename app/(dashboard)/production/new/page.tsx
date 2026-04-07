import { getAllFinishedProducts } from "@/actions/finished-products";
import { getAllRawMaterials } from "@/actions/raw-materials";

import { CreateWorkOrderForm } from "./work-order-form";

export default async function NewWorkOrderPage() {
  const [finishedProducts, rawMaterials] = await Promise.all([
    getAllFinishedProducts(),
    getAllRawMaterials(),
  ]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Generate Work Order</h1>
        <p className="text-sm text-muted-foreground">
          Define production target and issue raw materials.
        </p>
      </header>

      <CreateWorkOrderForm
        finishedProducts={finishedProducts.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          quantityInStock: p.quantityInStock,
          variants: p.variants.map((v) => ({
            id: v.id,
            name: v.name,
            weightInGrams: v.weightInGrams,
          })),
        }))}
        rawMaterials={rawMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          quantityInStock: m.quantityInStock,
        }))}
      />
    </section>
  );
}

