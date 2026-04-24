import Link from "next/link";

import { getWasteTypes } from "@/actions/finished-products";
import { WasteReportClient } from "@/components/finished-goods/WasteReportClient";

const primaryButton =
  "inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 h-8";
const outlineButton =
  "inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted h-8";

export default async function WasteHomePage() {
  const wasteTypes = await getWasteTypes();
  const defaultWasteTypeId = wasteTypes[0]?.id ?? "";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Waste</h1>
          <p className="text-sm text-muted-foreground">
            Track daily waste generation and dispatch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/finished-products/waste/manage" className={outlineButton}>
            Manage Waste Types
          </Link>
          <Link href="/finished-products/waste/new" className={primaryButton}>
            Add Waste
          </Link>
          <Link href="/finished-products/waste/dispatch" className={outlineButton}>
            Dispatch Waste
          </Link>
        </div>
      </header>

      <WasteReportClient
        wasteTypes={wasteTypes.map((w) => ({ id: w.id, name: w.name }))}
        defaultWasteTypeId={defaultWasteTypeId}
      />
    </section>
  );
}
