import Link from "next/link";
import { BarChart3, Boxes, Package } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ReportsDashboardPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Production insights across inventory, materials, and efficiency.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md border bg-background p-2">
              <Package className="size-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Finished Goods Inventory</h2>
              <p className="text-sm text-muted-foreground">
                Daily breakdown of opening balance, production, dispatched, and closing balance.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Button
              asChild
              className="w-full bg-black text-white hover:bg-black/90"
            >
              <Link href="/reports/inventory">View Report</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md border bg-background p-2">
              <Boxes className="size-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Raw Material Report</h2>
              <p className="text-sm text-muted-foreground">
                Daily breakdown of opening balance, received, issued, and closing balance.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Button
              asChild
              className="w-full bg-black text-white hover:bg-black/90"
            >
              <Link href="/reports/raw-materials">View Report</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md border bg-background p-2">
              <BarChart3 className="size-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Production vs RM Efficiency</h2>
              <p className="text-sm text-muted-foreground">
                Compare finished goods weight vs raw materials issued and waste generated.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Button
              asChild
              className="w-full bg-black text-white hover:bg-black/90"
            >
              <Link href="/reports/production-efficiency">View Report</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

