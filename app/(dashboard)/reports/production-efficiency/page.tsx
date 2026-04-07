import { getProductionEfficiencyReport } from "@/lib/reports/queries";

export default async function ProductionEfficiencyReportPage() {
  const now = new Date();
  const year = now.getFullYear();

  const report = await getProductionEfficiencyReport(year);
  const { rawMaterials, rows } = report;

  const rawMaterialColumns = rawMaterials ?? [];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Production Efficiency Report
        </h1>
        <p className="text-sm text-muted-foreground">
          Compare finished goods output vs raw material allocations + waste.
        </p>
      </header>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium text-foreground border-r">
                Month
              </th>
              <th
                className="px-3 py-2 font-medium text-foreground border-r"
                colSpan={1}
              >
                Finished Products/Variants
              </th>
              <th
                className="px-3 py-2 text-right font-medium text-foreground border-r"
              >
                Total Waste (KG)
              </th>
              <th
                className="px-3 py-2 text-right font-medium text-foreground border-r"
              >
                Total RM Required (KG)
              </th>

              {rawMaterialColumns.map((m) => (
                <th
                  key={m.id}
                  className="px-3 py-2 text-right font-medium text-foreground border-r"
                >
                  {m.name} (KG)
                </th>
              ))}

              <th
                className="px-3 py-2 text-right font-medium text-foreground border-r"
              >
                Total RM Issued (KG)
              </th>
              <th
                className="px-3 py-2 text-right font-medium text-foreground border-r"
              >
                Excess Issued (KG)
              </th>
              <th className="px-3 py-2 text-right font-medium text-foreground">
                Excess %
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const hasPieces = r.fgPieces > 0;
              const excessColor =
                r.excessKg > 0
                  ? "text-amber-600"
                  : r.excessKg < 0
                    ? "text-red-600"
                    : "text-green-600";

              return (
                <tr key={r.monthIndex} className="border-b last:border-b-0">
                  <td className="px-3 py-2 tabular-nums border-r">
                    {r.monthLabel}
                  </td>

                  <td className="px-3 py-2 border-r">
                    {hasPieces ? (
                      <div className="space-y-1">
                        <div className="font-medium tabular-nums">
                          {r.fgPieces} pcs
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          Total Weight: {r.fgWeightKg} kg
                        </div>
                      </div>
                    ) : (
                      <div className="font-medium tabular-nums">
                        {r.fgWeightKg} kg
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums border-r">
                    {r.totalWasteKg.toFixed(2)}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums border-r">
                    {r.totalRmRequiredKg.toFixed(2)}
                  </td>

                  {rawMaterialColumns.map((m) => {
                    const val =
                      r.rmAllocatedByMaterialId?.[m.id] ?? 0;
                    return (
                      <td
                        key={`${r.monthIndex}-${m.id}`}
                        className="px-3 py-2 text-right tabular-nums border-r"
                      >
                        {val.toFixed(2)}
                      </td>
                    );
                  })}

                  <td className="px-3 py-2 text-right tabular-nums border-r">
                    {r.totalRmIssuedKg.toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums border-r ${excessColor}`}
                  >
                    {r.excessKg.toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${excessColor}`}
                  >
                    {r.excessPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

