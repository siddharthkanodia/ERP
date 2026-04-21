import Link from "next/link";
import { format } from "date-fns";

import { getProductionFloorStocks } from "@/actions/production-floor";

const primaryButton =
  "inline-flex h-8 items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";
const outlineButton =
  "inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted";

export default async function ProductionFloorPage() {
  const stocks = await getProductionFloorStocks();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Production Floor</h1>
          <p className="text-sm text-muted-foreground">
            Track raw material movement between inventory and production floor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/production-floor/issue" className={primaryButton}>
            Issue to Floor
          </Link>
          <Link href="/production-floor/consume" className={outlineButton}>
            Consume Stock
          </Link>
          <Link href="/reports/production-floor" className={outlineButton}>
            View Report
          </Link>
        </div>
      </header>

      {stocks.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No raw materials yet. Add raw materials first to manage floor stock.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Click a material name to view its transaction history.
          </p>
          <div className="overflow-x-auto rounded-md border bg-card">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Raw Material</th>
                <th className="px-3 py-2 text-right font-medium">Inventory Stock (kg)</th>
                <th className="px-3 py-2 text-right font-medium">Floor Stock (kg)</th>
                <th className="px-3 py-2 font-medium">Last Issued</th>
                <th className="px-3 py-2 font-medium">Last Consumed</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((row) => (
                <tr key={row.rawMaterialId} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/production-floor/transactions?materialId=${row.rawMaterialId}`}
                      className="cursor-pointer text-foreground underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.inventoryStock.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.floorStock.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.lastIssuedAt
                      ? format(row.lastIssuedAt, "dd MMM yyyy")
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.lastConsumedAt
                      ? format(row.lastConsumedAt, "dd MMM yyyy")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  );
}
