import { getAllFinishedProducts } from "@/actions/finished-products";

import { InventoryReportClient } from "@/components/reports/InventoryReportClient";

export default async function FinishedGoodsInventoryReportPage() {
  const allProducts = await getAllFinishedProducts();
  const products = allProducts.filter((p) => p.isDeleted !== true);
  const defaultProductId = products[0]?.id ?? "";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Finished Goods Inventory Report
        </h1>
        <p className="text-sm text-muted-foreground">
          Day-by-day breakdown for opening, production, dispatch, and closing balances.
        </p>
      </header>

      <InventoryReportClient
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        defaultProductId={defaultProductId}
      />
    </section>
  );
}
