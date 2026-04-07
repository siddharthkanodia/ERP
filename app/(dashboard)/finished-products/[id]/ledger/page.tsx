import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import {
  getFinishedProductById,
  getFinishedProductLedger,
} from "@/actions/finished-products";

export default async function FinishedProductLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ variantId?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const variantId = resolvedSearchParams?.variantId?.trim() || undefined;
  const product = await getFinishedProductById(id);

  if (!product) {
    redirect("/finished-products");
  }

  const selectedVariant = variantId
    ? product.variants.find((variant) => variant.id === variantId)
    : null;
  const ledger = await getFinishedProductLedger(id, selectedVariant?.id);
  const unitLabel = product.unit === "PIECE" ? "pcs" : "kg";
  const title = selectedVariant
    ? `${product.name} (${selectedVariant.name}) — Stock Ledger`
    : `${product.name} (Consolidated) — Stock Ledger`;
  const currentStock = selectedVariant
    ? selectedVariant.quantityInStock
    : product.quantityInStock;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Current Stock: {currentStock} {unitLabel}
          </p>
        </div>
        <Link
          href="/finished-products"
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
                {!selectedVariant ? (
                  <th className="px-3 py-2 font-medium text-foreground">
                    Variant
                  </th>
                ) : null}
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Opening Balance ({unitLabel})
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Produced ({unitLabel})
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Dispatched ({unitLabel})
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Closing Balance ({unitLabel})
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
                  {!selectedVariant ? (
                    <td className="px-3 py-2 text-muted-foreground">
                      {"variantName" in entry
                        ? entry.variantName === "Base Product"
                          ? "Base"
                          : entry.variantName
                        : "Base"}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.openingBalance}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.quantityProduced}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {entry.quantityDispatched}
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

