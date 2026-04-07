import Link from "next/link";

import { getAllWorkOrders } from "@/actions/production";
import { ProductionTable } from "./production-table";

const primaryButton =
  "inline-flex h-8 items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90";

export default async function ProductionPage() {
  const workOrders = await getAllWorkOrders();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Production</h1>
          <p className="text-sm text-muted-foreground">
            Track work orders and production progress.
          </p>
        </div>
        <Link href="/production/new" className={primaryButton}>
          Generate Work Order
        </Link>
      </header>

      <ProductionTable workOrders={workOrders} />
    </section>
  );
}

