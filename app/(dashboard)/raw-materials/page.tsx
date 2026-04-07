import Link from "next/link";
import { format } from "date-fns";
import { Pencil, Plus, PackagePlus } from "lucide-react";

import { getAllRawMaterials } from "@/actions/raw-materials";
import { Button } from "@/components/ui/button";

export default async function RawMaterialsPage() {
  const rawMaterials = await getAllRawMaterials();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Raw Materials</h1>
          <p className="text-sm text-muted-foreground">
            Track stock levels and latest receiving activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="h-8 px-3">
            <Link href="/raw-materials/new">
              <Plus className="size-4" />
              Add Raw Material
            </Link>
          </Button>
          <Button asChild size="sm" className="h-8 px-3">
            <Link href="/raw-materials/receive">
              <PackagePlus className="size-4" />
              Receive Stock
            </Link>
          </Button>
        </div>
      </header>

      {rawMaterials.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No raw materials found. Add your first raw material to start
            tracking inventory.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium text-foreground">Name</th>
                <th className="px-3 py-2 font-medium text-foreground">
                  Quantity In Stock (kg)
                </th>
                <th className="px-3 py-2 font-medium text-foreground">
                  Last Received
                </th>
                <th className="px-3 py-2 text-right font-medium text-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rawMaterials.map((material) => (
                <tr
                  key={material.id}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/raw-materials/${material.id}/ledger`}
                      className="cursor-pointer hover:underline"
                    >
                      {material.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {material.quantityInStock.toString()}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {material.lastReceivedAt
                      ? `${format(material.lastReceivedAt, "dd MMM yyyy")} (${
                          material.lastReceivedQuantity?.toString() ?? "-"
                        } kg)`
                      : "Never"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild size="sm" variant="outline" className="h-8 px-2">
                      <Link href={`/raw-materials/${material.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
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
