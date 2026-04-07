import Link from "next/link";
import { redirect } from "next/navigation";

import { getWorkOrderById } from "@/actions/production";
import { getAllRawMaterials } from "@/actions/raw-materials";

import { AddProductionEntryForm } from "./add-production-entry-form";
import { EditWorkOrderForm } from "./edit-work-order-form";
import { ProductionEntriesTable } from "./production-entries-table";

function statusBadgeClass(status: string) {
  if (status === "OPEN") return "bg-amber-100 text-amber-800";
  if (status === "COMPLETED") return "bg-green-100 text-green-800";
  return "bg-zinc-200 text-zinc-700";
}

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workOrder = await getWorkOrderById(id);

  if (!workOrder) redirect("/production");

  const rawMaterials = await getAllRawMaterials();
  const unitLabel = workOrder.finishedProductUnit === "PIECE" ? "pcs" : "kg";
  const totalProduced = workOrder.totalProduced;
  const totalWaste = workOrder.productionEntries.reduce(
    (sum, e) => sum + e.wasteGenerated,
    0
  );
  const remaining = workOrder.plannedQuantity - totalProduced;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {workOrder.workOrderName || "Untitled Work Order"}
          </h1>
          <p
            className={`text-sm ${
              workOrder.finishedProductName === "<Deleted Product>"
                ? "italic text-muted-foreground"
                : "text-muted-foreground"
            }`}
          >
            {workOrder.finishedProductName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
              workOrder.status
            )}`}
          >
            {workOrder.status}
          </span>
          <Link
            href="/production"
            className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
          >
            Exit
          </Link>
        </div>
      </header>

      <EditWorkOrderForm
        workOrder={{
          id: workOrder.id,
          plannedQuantity: workOrder.plannedQuantity,
          totalProduced: workOrder.totalProduced,
          unit: workOrder.finishedProductUnit ?? "KG",
          finishedProductName: workOrder.finishedProductName,
          finishedProductVariantName: workOrder.finishedProductVariantName,
          rawMaterials: workOrder.rawMaterials.map((rm) => ({
            id: rm.id,
            rawMaterialId: rm.rawMaterialId,
            name: rm.name,
            quantityIssued: rm.quantityIssued,
          })),
        }}
        availableStocks={rawMaterials.map((m) => ({
          rawMaterialId: m.id,
          quantityInStock: m.quantityInStock,
        }))}
      />

      <div className="grid gap-2 rounded-md border bg-card p-3 text-sm md:grid-cols-3">
        <div>
          <p className="text-muted-foreground">Total Produced</p>
          <p className="font-medium">
            {totalProduced} {unitLabel}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Total Waste (kg)</p>
          <p className="font-medium">
            {totalWaste} kg
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Remaining vs Plan</p>
          <p className={`font-medium ${remaining < 0 ? "text-red-600" : ""}`}>
            {remaining} {unitLabel}
          </p>
        </div>
      </div>

      <AddProductionEntryForm
        workOrderId={workOrder.id}
        unit={workOrder.finishedProductUnit ?? "KG"}
      />

      <ProductionEntriesTable
        workOrderId={workOrder.id}
        unit={workOrder.finishedProductUnit ?? "KG"}
        entries={workOrder.productionEntries}
      />
    </section>
  );
}

