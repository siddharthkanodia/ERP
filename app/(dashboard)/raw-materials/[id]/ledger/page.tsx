import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { getRawMaterialById, getRawMaterialLedger } from "@/actions/raw-materials";

export default async function RawMaterialLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const material = await getRawMaterialById(id);

  if (!material) {
    redirect("/raw-materials");
  }

  const ledger = await getRawMaterialLedger(id);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {material.name} - Stock Ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Current Stock: {material.quantityInStock} kg
          </p>
        </div>
        <Link
          href="/raw-materials"
          className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
        >
          Exit
        </Link>
      </header>

      {ledger.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions recorded yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium text-foreground">
                  Date &amp; Time
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Opening Balance (kg)
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Received (kg)
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Given for Production (kg)
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Closing Balance (kg)
                </th>
                <th className="px-3 py-2 font-medium text-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    {format(entry.date, "dd MMM yyyy, HH:mm")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.openingBalance}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.quantityIn}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.quantityOut}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.closingBalance}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {entry.notes ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

