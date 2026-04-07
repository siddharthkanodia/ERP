"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

type WorkOrderRow = {
  id: string;
  workOrderName?: string | null;
  plannedQuantity: number;
  totalProduced: number;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  finishedProductName: string;
  finishedProductUnit: "KG" | "PIECE" | null;
  finishedProductVariant: {
    name: string;
  } | null;
  rawMaterials: Array<{ name: string }>;
};

type SortKey =
  | "workOrderName"
  | "finishedProduct"
  | "variant"
  | "plannedQuantity"
  | "totalProduced"
  | "rawMaterials"
  | "status"
  | "createdAt";

function statusBadgeClass(status: string) {
  if (status === "OPEN") return "bg-amber-100 text-amber-800";
  if (status === "COMPLETED") return "bg-green-100 text-green-800";
  return "bg-zinc-200 text-zinc-700";
}

function statusRank(status: WorkOrderRow["status"]) {
  if (status === "OPEN") return 0;
  if (status === "COMPLETED") return 1;
  return 2;
}

export function ProductionTable({ workOrders }: { workOrders: WorkOrderRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workOrders;

    return workOrders.filter((wo) => {
      const name = (wo.workOrderName || "Untitled Work Order").toLowerCase();
      const product = wo.finishedProductName.toLowerCase();
      return name.includes(q) || product.includes(q);
    });
  }, [query, workOrders]);

  const sorted = useMemo(() => {
    const rows = [...filtered];

    rows.sort((a, b) => {
      const aStatus = statusRank(a.status);
      const bStatus = statusRank(b.status);
      if (aStatus !== bStatus) return aStatus - bStatus;

      const baseCreated =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortKey === "createdAt") {
        return sortDirection === "asc" ? -baseCreated : baseCreated;
      }

      let delta = 0;
      switch (sortKey) {
        case "workOrderName":
          delta = (a.workOrderName || "Untitled Work Order").localeCompare(
            b.workOrderName || "Untitled Work Order"
          );
          break;
        case "finishedProduct":
          delta = a.finishedProductName.localeCompare(b.finishedProductName);
          break;
        case "variant":
          delta = (a.finishedProductVariant?.name || "-").localeCompare(
            b.finishedProductVariant?.name || "-"
          );
          break;
        case "plannedQuantity":
          delta = a.plannedQuantity - b.plannedQuantity;
          break;
        case "totalProduced":
          delta = a.totalProduced - b.totalProduced;
          break;
        case "rawMaterials": {
          const aNames = a.rawMaterials.map((rm) => rm.name).join(", ");
          const bNames = b.rawMaterials.map((rm) => rm.name).join(", ");
          delta = aNames.localeCompare(bNames);
          break;
        }
        case "status":
          delta = aStatus - bStatus;
          break;
        default:
          delta = 0;
      }

      if (delta !== 0) {
        return sortDirection === "asc" ? delta : -delta;
      }
      return baseCreated;
    });

    return rows;
  }, [filtered, sortDirection, sortKey]);

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "createdAt" ? "desc" : "asc");
  }

  const thButtonClass =
    "inline-flex items-center gap-1 font-medium text-foreground hover:text-foreground/80";

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <label htmlFor="production-search" className="mb-1 block text-sm font-medium">
          Search
        </label>
        <input
          id="production-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by work order name or finished product"
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      {workOrders.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No work orders yet.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No matching work orders found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2">
                  <button type="button" className={thButtonClass} onClick={() => onSort("workOrderName")}>
                    Work Order Name
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className={thButtonClass} onClick={() => onSort("finishedProduct")}>
                    Finished Product
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className={thButtonClass} onClick={() => onSort("variant")}>
                    Variant
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" className={thButtonClass} onClick={() => onSort("plannedQuantity")}>
                    Planned Qty
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" className={thButtonClass} onClick={() => onSort("totalProduced")}>
                    Total Produced
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className={thButtonClass} onClick={() => onSort("rawMaterials")}>
                    Raw Materials
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className={thButtonClass} onClick={() => onSort("status")}>
                    Status
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className={thButtonClass} onClick={() => onSort("createdAt")}>
                    Created On
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((wo) => {
                const unit = wo.finishedProductUnit === "PIECE" ? "pcs" : "kg";
                const rawMaterialNames = wo.rawMaterials.map((rm) => rm.name).join(", ");
                return (
                  <tr key={wo.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {wo.workOrderName || "Untitled Work Order"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {wo.finishedProductName === "<Deleted Product>" ? (
                          <span className="italic text-muted-foreground">
                            {"<Deleted Product>"}
                          </span>
                        ) : (
                          wo.finishedProductName
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {wo.finishedProductVariant?.name || "-"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {wo.plannedQuantity} {unit}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {wo.totalProduced} {unit}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {rawMaterialNames || "-"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                          wo.status
                        )}`}
                      >
                        {wo.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <Link href={`/production/${wo.id}`} className="hover:underline">
                        {format(wo.createdAt, "dd MMM yyyy")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

