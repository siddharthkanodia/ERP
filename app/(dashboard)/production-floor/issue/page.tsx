import { getProductionFloorStocks } from "@/actions/production-floor";
import { IssueToFloorForm } from "@/components/production-floor/IssueToFloorForm";

export default async function IssueToFloorPage() {
  const stocks = await getProductionFloorStocks();

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Issue to Floor</h1>
        <p className="text-sm text-muted-foreground">
          Move raw materials from inventory to the production floor.
        </p>
      </header>
      <IssueToFloorForm
        materials={stocks.map((s) => ({
          id: s.rawMaterialId,
          name: s.name,
          inventoryStock: s.inventoryStock,
          floorStock: s.floorStock,
        }))}
      />
    </section>
  );
}
