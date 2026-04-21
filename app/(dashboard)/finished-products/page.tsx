import Link from "next/link";

import { getAllFinishedProducts } from "@/actions/finished-products";
import { FinishedProductsTable } from "@/app/(dashboard)/finished-products/finished-products-table";

const primaryButton =
  "inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 h-8";
const outlineButton =
  "inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted h-8";

export default async function FinishedProductsPage() {
  const finishedProducts = await getAllFinishedProducts();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Finished Goods
          </h1>
          <p className="text-sm text-muted-foreground">
            Track stock levels and latest dispatch activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/finished-products/new" className={primaryButton}>
            Add Finished Product
          </Link>
          <Link href="/finished-products/dispatch" className={outlineButton}>
            Dispatch Stock
          </Link>
        </div>
      </header>

      {finishedProducts.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No finished products found. Add your first finished product to
            start tracking inventory.
          </p>
        </div>
      ) : (
        <FinishedProductsTable finishedProducts={finishedProducts} />
      )}
    </section>
  );
}

