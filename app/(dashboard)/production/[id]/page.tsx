import Link from "next/link";
import { redirect } from "next/navigation";

import { getWorkOrderById } from "@/actions/production";
import { getAllRawMaterials } from "@/actions/raw-materials";
import { getFloorStockForRawMaterials } from "@/actions/production-floor";

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

  const allRawMaterials = await getAllRawMaterials();
  const floorStocks = await getFloorStockForRawMaterials(
    allRawMaterials.map((m) => m.id)
  );
  const floorStockById = new Map(
    floorStocks.map((f) => [f.rawMaterialId, f.floorStock])
  );
  const unitLabel = workOrder.finishedProductUnit === "PIECE" ? "pcs" : "kg";

  const selectedFloorStock = workOrder.rawMaterials.map((rm) => ({
    rawMaterialId: rm.rawMaterialId,
    name: rm.name,
    floorStock: floorStockById.get(rm.rawMaterialId) ?? 0,
  }));
  const zeroStockMaterials = selectedFloorStock.filter((m) => m.floorStock <= 0);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{workOrder.workOrderName}</h1>
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
            rawMaterialId: rm.rawMaterialId,
            name: rm.name,
          })),
        }}
        rawMaterials={allRawMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          floorStock: floorStockById.get(m.id) ?? 0,
        }))}
      />

      <div className="grid gap-2 rounded-md border bg-card p-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Planned Qty</p>
          <p className="font-medium">
            {workOrder.plannedQuantity} {unitLabel}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Actual Qty</p>
          <p className="font-medium">
            {workOrder.totalProduced} {unitLabel}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Variance</p>
          <p className={`font-medium ${workOrder.variance < 0 ? "text-red-600" : "text-emerald-700"}`}>
            {workOrder.variance} {unitLabel}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Total RM Consumed</p>
          <p className="font-medium">{workOrder.totalConsumptionKg} kg</p>
        </div>
      </div>

      <div className="rounded-md border bg-card p-3 text-sm">
        <p className="mb-1 text-muted-foreground">Raw Material Types Used</p>
        <p className="font-medium">
          {workOrder.rawMaterials.map((m) => m.name).join(", ") || "-"}
        </p>
      </div>

      {selectedFloorStock.length > 0 ? (
        <div className="rounded-md border bg-card p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-muted-foreground">Floor Stock (selected materials)</p>
            <Link
              href="/production-floor/issue"
              className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
            >
              Issue to floor
            </Link>
          </div>
          <ul className="grid gap-1 md:grid-cols-2">
            {selectedFloorStock.map((m) => (
              <li key={m.rawMaterialId} className="flex items-center justify-between gap-2">
                <span>{m.name}</span>
                <span
                  className={`tabular-nums ${
                    m.floorStock <= 0 ? "font-medium text-amber-600" : "font-medium"
                  }`}
                >
                  {m.floorStock.toFixed(2)} kg
                </span>
              </li>
            ))}
          </ul>
          {zeroStockMaterials.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-amber-600">
              Warning: {zeroStockMaterials.map((m) => m.name).join(", ")} has 0 floor stock.
              Issue stock to the production floor before producing.
            </p>
          ) : null}
        </div>
      ) : null}

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
