import { getWasteTypesWithVariants } from "@/actions/finished-products";
import { WasteTypeManager } from "@/components/finished-goods/WasteTypeManager";

export default async function ManageWasteTypesPage() {
  const wasteTypes = await getWasteTypesWithVariants();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Manage Waste Types</h1>
        <p className="text-sm text-muted-foreground">
          Create waste types and manage their variants.
        </p>
      </header>

      <WasteTypeManager initialWasteTypes={wasteTypes} />
    </section>
  );
}
