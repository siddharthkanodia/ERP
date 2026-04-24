import { getProductionFloorStocks } from "@/actions/production-floor";
import { FloorReportClient } from "@/components/production-floor/FloorReportClient";

export default async function ProductionFloorReportPage() {
  const stocks = await getProductionFloorStocks();
  const options = stocks.map((s) => ({ id: s.rawMaterialId, name: s.name }));
  const defaultId = options[0]?.id ?? "";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Production Floor Report</h1>
        <p className="text-sm text-muted-foreground">
          Date-wise opening, issued, consumed, adjusted and closing for floor stock.
        </p>
      </header>

      {options.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No raw materials yet. Add raw materials first to generate a report.
          </p>
        </div>
      ) : (
        <FloorReportClient materials={options} defaultMaterialId={defaultId} />
      )}
    </section>
  );
}
