import { getWasteTypes } from "@/actions/finished-products";
import { WasteDispatchForm } from "@/components/finished-goods/WasteDispatchForm";

export default async function WasteDispatchPage() {
  const wasteTypes = await getWasteTypes();

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Dispatch Waste</h1>
        <p className="text-sm text-muted-foreground">
          Dispatch waste and reduce available waste stock.
        </p>
      </header>

      <WasteDispatchForm
        wasteTypes={wasteTypes.map((w) => ({
          id: w.id,
          name: w.name,
          quantityInStock: w.quantityInStock,
        }))}
      />
    </section>
  );
}
