import Link from "next/link";

import {
  getFloorLedgerEntries,
  getProductionFloorStocks,
} from "@/actions/production-floor";
import { FloorTransactionsClient } from "@/components/production-floor/FloorTransactionsClient";

type SearchParams = Promise<{ materialId?: string }>;

export default async function ProductionFloorTransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const stocks = await getProductionFloorStocks();
  const materials = stocks.map((s) => ({ id: s.rawMaterialId, name: s.name }));
  const requestedId = params.materialId;
  const isRequestedValid = requestedId
    ? materials.some((m) => m.id === requestedId)
    : false;
  const selectedId = isRequestedValid
    ? (requestedId as string)
    : materials[0]?.id ?? "";

  const entries = selectedId
    ? await getFloorLedgerEntries({ rawMaterialId: selectedId, limit: 200 })
    : [];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Floor Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            Review, edit, or delete production floor ledger entries. Changes
            recalculate downstream balances automatically.
          </p>
        </div>
        <Link
          href="/production-floor"
          className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
        >
          Back to Floor
        </Link>
      </header>

      {materials.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No raw materials yet. Add raw materials first to view transactions.
          </p>
        </div>
      ) : (
        <FloorTransactionsClient
          materials={materials}
          selectedId={selectedId}
          entries={entries}
        />
      )}
    </section>
  );
}
