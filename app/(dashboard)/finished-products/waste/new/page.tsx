import { getWasteTypes } from "@/actions/finished-products";
import { WasteEntryForm } from "@/components/finished-goods/WasteEntryForm";

export default async function WasteEntryPage() {
  const wasteTypes = await getWasteTypes();

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Add Waste</h1>
        <p className="text-sm text-muted-foreground">
          Record a new waste entry for the selected date.
        </p>
      </header>

      <WasteEntryForm wasteTypes={wasteTypes.map((w) => ({ id: w.id, name: w.name }))} />
    </section>
  );
}
