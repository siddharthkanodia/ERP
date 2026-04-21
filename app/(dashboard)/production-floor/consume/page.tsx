import Link from "next/link";

import { getProductionFloorStocks } from "@/actions/production-floor";
import { ConsumeFromFloorForm } from "@/components/production-floor/ConsumeFromFloorForm";
import { Button } from "@/components/ui/button";

export default async function ConsumeFromFloorPage() {
  const stocks = await getProductionFloorStocks();
  const floorMaterials = stocks
    .filter((s) => s.floorStock > 0)
    .map((s) => ({
      id: s.rawMaterialId,
      name: s.name,
      floorStock: s.floorStock,
    }));

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Consume Stock</h1>
        <p className="text-sm text-muted-foreground">
          Consume raw materials from the production floor as they are used.
        </p>
      </header>

      {floorMaterials.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-center">
          <p className="text-sm font-medium">
            No materials currently on the production floor.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Issue materials first before consuming.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/production-floor">Back to Production Floor</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/production-floor/issue">Issue to Floor</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ConsumeFromFloorForm materials={floorMaterials} />
      )}
    </section>
  );
}
