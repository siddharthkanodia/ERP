import { getAllFinishedProducts } from "@/actions/finished-products";
import { getAllRawMaterials } from "@/actions/raw-materials";
import { getFloorStockForRawMaterials } from "@/actions/production-floor";

import { CreateWorkOrderForm } from "./work-order-form";

export default async function NewWorkOrderPage() {
  const [finishedProducts, rawMaterials] = await Promise.all([
    getAllFinishedProducts(),
    getAllRawMaterials(),
  ]);
  const floorStocks = await getFloorStockForRawMaterials(
    rawMaterials.map((m) => m.id)
  );
  const floorStockById = new Map(
    floorStocks.map((f) => [f.rawMaterialId, f.floorStock])
  );

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Create Work Order</h1>
        <p className="text-sm text-muted-foreground">
          Define production target and select raw material types.
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
            weightPerPiece: v.weightPerPiece,
          })),
        }))}
        rawMaterials={rawMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          floorStock: floorStockById.get(m.id) ?? 0,
        }))}
      />
    </section>
  );
}

