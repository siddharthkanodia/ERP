"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpDown, Search } from "lucide-react";
import { Tabs } from "radix-ui";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type WorkOrderRow = {
  id: string;
  workOrderName: string;
  plannedQuantity: number;
  totalProduced: number;
  variance: number;
  totalConsumptionKg: number;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  completedAt: Date | null;
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
  | "variance"
  | "completion"
  | "consumption"
  | "rawMaterials"
  | "createdAt"
  | "completedAt";

type SortState = { key: SortKey; dir: "asc" | "desc" };

type TabKey = "open" | "completed";

function statusBadgeClass(status: string) {
  if (status === "OPEN") return "bg-amber-100 text-amber-800";
  if (status === "COMPLETED") return "bg-green-100 text-green-800";
  return "bg-zinc-200 text-zinc-700";
}

function completionPercent(row: WorkOrderRow): number | null {
  if (!row.plannedQuantity || row.plannedQuantity <= 0) return null;
  return (row.totalProduced / row.plannedQuantity) * 100;
}

function formatCompletion(row: WorkOrderRow): string {
  const pct = completionPercent(row);
  if (pct == null) return "—";
  return `${Math.round(pct)}%`;
}

export function ProductionTable({ workOrders }: { workOrders: WorkOrderRow[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("open");
  const [openSort, setOpenSort] = useState<SortState>({
    key: "createdAt",
    dir: "desc",
  });
  const [completedSort, setCompletedSort] = useState<SortState>({
    key: "completedAt",
    dir: "desc",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workOrders;
    return workOrders.filter((wo) => {
      const name = wo.workOrderName.toLowerCase();
      const product = wo.finishedProductName.toLowerCase();
      const variant = wo.finishedProductVariant?.name.toLowerCase() ?? "";
      return name.includes(q) || product.includes(q) || variant.includes(q);
    });
  }, [query, workOrders]);

  const openRows = useMemo(
    () => filtered.filter((wo) => wo.status === "OPEN"),
    [filtered]
  );
  const completedRows = useMemo(
    () => filtered.filter((wo) => wo.status === "COMPLETED"),
    [filtered]
  );

  const openSorted = useMemo(
    () => sortRows(openRows, openSort),
    [openRows, openSort]
  );
  const completedSorted = useMemo(
    () => sortRows(completedRows, completedSort),
    [completedRows, completedSort]
  );

  function handleSort(current: SortState, next: SortKey): SortState {
    if (current.key === next) {
      return { key: next, dir: current.dir === "asc" ? "desc" : "asc" };
    }
    const defaultDesc: SortKey[] = [
      "createdAt",
      "completedAt",
      "plannedQuantity",
      "totalProduced",
      "variance",
      "completion",
      "consumption",
    ];
    return {
      key: next,
      dir: defaultDesc.includes(next) ? "desc" : "asc",
    };
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <label htmlFor="production-search" className="mb-1 block text-sm font-medium">
          Search
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="production-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by work order or product"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          />
        </div>
      </div>

      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(value as TabKey)}
        className="space-y-3"
      >
        <Tabs.List
          className="inline-flex items-center gap-1 rounded-md border bg-card p-1"
          aria-label="Work order status tabs"
        >
          <TabTrigger value="open" count={openRows.length}>
            Open
          </TabTrigger>
          <TabTrigger value="completed" count={completedRows.length}>
            Completed
          </TabTrigger>
        </Tabs.List>

        <Tabs.Content value="open" className="focus:outline-none">
          <WorkOrderTableView
            rows={openSorted}
            sort={openSort}
            onSort={(key) => setOpenSort((prev) => handleSort(prev, key))}
            emptyMessage="No open work orders"
          />
        </Tabs.Content>

        <Tabs.Content value="completed" className="focus:outline-none">
          <WorkOrderTableView
            rows={completedSorted}
            sort={completedSort}
            onSort={(key) => setCompletedSort((prev) => handleSort(prev, key))}
            emptyMessage="No completed work orders"
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function TabTrigger({
  value,
  count,
  children,
}: {
  value: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "group/tab inline-flex items-center gap-2 rounded-[5px] px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:hover:bg-zinc-900"
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          "inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-700",
          "group-data-[state=active]/tab:bg-white/20 group-data-[state=active]/tab:text-white"
        )}
      >
        {count}
      </span>
    </Tabs.Trigger>
  );
}

function sortRows(rows: WorkOrderRow[], state: SortState): WorkOrderRow[] {
  const copy = [...rows];
  const { key, dir } = state;
  copy.sort((a, b) => {
    let delta = 0;
    switch (key) {
      case "workOrderName":
        delta = a.workOrderName.localeCompare(b.workOrderName);
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
      case "variance":
        delta = a.variance - b.variance;
        break;
      case "completion": {
        const ap = completionPercent(a) ?? -1;
        const bp = completionPercent(b) ?? -1;
        delta = ap - bp;
        break;
      }
      case "consumption":
        delta = a.totalConsumptionKg - b.totalConsumptionKg;
        break;
      case "rawMaterials": {
        const aNames = a.rawMaterials.map((rm) => rm.name).join(", ");
        const bNames = b.rawMaterials.map((rm) => rm.name).join(", ");
        delta = aNames.localeCompare(bNames);
        break;
      }
      case "createdAt":
        delta =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "completedAt": {
        const ac = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bc = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        delta = ac - bc;
        break;
      }
      default:
        delta = 0;
    }
    if (delta !== 0) return dir === "asc" ? delta : -delta;
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
  return copy;
}

function WorkOrderTableView({
  rows,
  sort,
  onSort,
  emptyMessage,
}: {
  rows: WorkOrderRow[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  emptyMessage: string;
}) {
  const thButtonClass =
    "inline-flex items-center gap-1 font-medium text-foreground hover:text-foreground/80";

  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  function SortButton({ k, label }: { k: SortKey; label: string }) {
    const isActive = sort.key === k;
    return (
      <button
        type="button"
        className={cn(
          thButtonClass,
          isActive && "text-foreground"
        )}
        onClick={() => onSort(k)}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "size-3.5",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        />
      </button>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2">
              <SortButton k="workOrderName" label="Work Order Name" />
            </th>
            <th className="px-3 py-2">
              <SortButton k="finishedProduct" label="Finished Product" />
            </th>
            <th className="px-3 py-2">
              <SortButton k="variant" label="Variant" />
            </th>
            <th className="px-3 py-2 text-right">
              <SortButton k="plannedQuantity" label="Planned Qty" />
            </th>
            <th className="px-3 py-2 text-right">
              <SortButton k="totalProduced" label="Actual Qty" />
            </th>
            <th className="px-3 py-2 text-right">
              <SortButton k="variance" label="Variance" />
            </th>
            <th className="px-3 py-2 text-right">
              <SortButton k="completion" label="Completion %" />
            </th>
            <th className="px-3 py-2 text-right">
              <SortButton k="consumption" label="RM Consumption" />
            </th>
            <th className="px-3 py-2">
              <SortButton k="rawMaterials" label="Raw Material Types" />
            </th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">
              <SortButton k="createdAt" label="Created On" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((wo) => {
            const unit = wo.finishedProductUnit === "PIECE" ? "pcs" : "kg";
            const rawMaterialNames = wo.rawMaterials
              .map((rm) => rm.name)
              .join(", ");
            const completion = formatCompletion(wo);
            return (
              <tr
                key={wo.id}
                className="border-b last:border-b-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {wo.workOrderName}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
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
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {wo.finishedProductVariant?.name || "-"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {wo.plannedQuantity} {unit}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {wo.totalProduced} {unit}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {wo.variance} {unit}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {completion}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {wo.totalConsumptionKg} kg
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
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
                  <Link
                    href={`/production/${wo.id}`}
                    className="hover:underline"
                  >
                    {format(wo.createdAt, "dd MMM yyyy")}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
