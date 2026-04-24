import { redirect } from "next/navigation";
import {
  ClipboardList,
  History,
  Layers,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  endOfDay,
  format,
  startOfDay,
  subDays,
} from "date-fns";

import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import type { RawMaterialRow } from "@/components/dashboard/raw-materials-chart";
import type { FinishedGoodRow } from "@/components/dashboard/finished-goods-chart";
import type { WorkOrderRow } from "@/components/dashboard/work-orders-chart";
import type { ProductionTrendRow } from "@/components/dashboard/production-trend-chart";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function toNum(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.companyId) {
    redirect("/login");
  }
  const companyId = session.companyId;

  const today = new Date();
  const yesterday = subDays(today, 1);
  const last7 = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
  const trendStart = startOfDay(last7[0]);
  const trendEnd = endOfDay(today);

  const [
    activeWorkOrdersCount,
    plannedQtyAgg,
    producedTodayAgg,
    producedYesterdayAgg,
    floorStockAgg,
    rawMaterialsRaw,
    finishedProductsRaw,
    openWorkOrdersRaw,
    productionEntriesRaw,
  ] = await Promise.all([
    prisma.workOrder.count({
      where: { companyId, status: "OPEN" },
    }),
    prisma.workOrder.aggregate({
      where: { companyId, status: "OPEN" },
      _sum: { plannedQuantity: true },
    }),
    prisma.productionEntry.aggregate({
      where: {
        companyId,
        entryDate: { gte: startOfDay(today), lte: endOfDay(today) },
      },
      _sum: { quantityProduced: true },
    }),
    prisma.productionEntry.aggregate({
      where: {
        companyId,
        entryDate: { gte: startOfDay(yesterday), lte: endOfDay(yesterday) },
      },
      _sum: { quantityProduced: true },
    }),
    prisma.productionFloorStock.aggregate({
      where: { rawMaterial: { companyId } },
      _sum: { quantityInStock: true },
    }),
    prisma.rawMaterial.findMany({
      where: { companyId },
      select: {
        name: true,
        quantityInStock: true,
        productionFloorStock: { select: { quantityInStock: true } },
      },
      orderBy: { quantityInStock: "desc" },
      take: 10,
    }),
    prisma.finishedProduct.findMany({
      where: { companyId, isDeleted: false, isWaste: false },
      select: {
        id: true,
        name: true,
        unit: true,
        quantityInStock: true,
        variants: {
          where: { isDeleted: false, quantityInStock: { gt: 0 } },
          select: { name: true, quantityInStock: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.workOrder.findMany({
      where: { companyId, status: "OPEN" },
      select: {
        id: true,
        workOrderName: true,
        plannedQuantity: true,
        finishedProduct: { select: { name: true } },
        finishedProductVariant: { select: { name: true } },
        productionEntries: { select: { quantityProduced: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.productionEntry.findMany({
      where: {
        companyId,
        entryDate: { gte: trendStart, lte: trendEnd },
      },
      select: {
        entryDate: true,
        quantityProduced: true,
        workOrder: {
          select: {
            finishedProduct: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const plannedTotal = toNum(plannedQtyAgg._sum.plannedQuantity);
  const producedToday = toNum(producedTodayAgg._sum.quantityProduced);
  const producedYesterday = toNum(producedYesterdayAgg._sum.quantityProduced);
  const floorStockTotal = toNum(floorStockAgg._sum.quantityInStock);

  const rawMaterials: RawMaterialRow[] = rawMaterialsRaw.map((m) => ({
    name: m.name,
    warehouse: toNum(m.quantityInStock),
    floor: toNum(m.productionFloorStock?.quantityInStock),
  }));

  const finishedGoods: FinishedGoodRow[] = finishedProductsRaw.map((fp) => ({
    id: fp.id,
    name: fp.name,
    unit: fp.unit,
    quantityInStock: toNum(fp.quantityInStock),
    variants: fp.variants.map((v) => ({
      name: v.name,
      quantityInStock: toNum(v.quantityInStock),
    })),
  }));

  const workOrders: WorkOrderRow[] = openWorkOrdersRaw.map((wo) => {
    const planned = toNum(wo.plannedQuantity);
    const produced = wo.productionEntries.reduce(
      (sum, entry) => sum + toNum(entry.quantityProduced),
      0
    );
    const remaining = Math.max(0, planned - produced);
    const productName = wo.finishedProduct?.name ?? "—";
    const variantName = wo.finishedProductVariant?.name;
    const productLabel = variantName
      ? `${productName} · ${variantName}`
      : productName;
    return {
      id: wo.id,
      workOrderName: wo.workOrderName,
      productLabel,
      planned,
      produced,
      remaining,
    };
  });

  const dayKeys = last7.map((d) => format(startOfDay(d), "yyyy-MM-dd"));
  const productsInTrend = Array.from(
    new Set(
      productionEntriesRaw
        .map((e) => e.workOrder?.finishedProduct?.name)
        .filter((n): n is string => Boolean(n))
    )
  ).sort();

  const trendBuckets = new Map<string, Record<string, number>>();
  for (const key of dayKeys) {
    const row: Record<string, number> = {};
    for (const p of productsInTrend) row[p] = 0;
    trendBuckets.set(key, row);
  }

  for (const entry of productionEntriesRaw) {
    const key = format(startOfDay(entry.entryDate), "yyyy-MM-dd");
    const bucket = trendBuckets.get(key);
    if (!bucket) continue;
    const productName = entry.workOrder?.finishedProduct?.name;
    if (!productName) continue;
    bucket[productName] =
      (bucket[productName] ?? 0) + toNum(entry.quantityProduced);
  }

  const productionTrendData: ProductionTrendRow[] = dayKeys.map((key) => {
    const bucket = trendBuckets.get(key) ?? {};
    const row: ProductionTrendRow = { dateISO: key };
    for (const p of productsInTrend) {
      row[p] = Number((bucket[p] ?? 0).toFixed(2));
    }
    return row;
  });

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Operations Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {session.email}
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Active Work Orders"
          value={formatNumber(activeWorkOrdersCount, 0)}
          icon={ClipboardList}
          iconClassName="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Total Planned Qty"
          value={formatNumber(plannedTotal)}
          unit="kg"
          icon={Target}
          iconClassName="bg-violet-50 text-violet-600"
        />
        <KpiCard
          title="Produced Today"
          value={formatNumber(producedToday)}
          unit="kg"
          icon={TrendingUp}
          iconClassName="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Produced Yesterday"
          value={formatNumber(producedYesterday)}
          unit="kg"
          icon={History}
          iconClassName="bg-amber-50 text-amber-600"
        />
        <KpiCard
          title="Floor Stock"
          value={formatNumber(floorStockTotal)}
          unit="kg"
          icon={Layers}
          iconClassName="bg-rose-50 text-rose-600"
        />
      </div>

      <DashboardCharts
        rawMaterials={rawMaterials}
        finishedGoods={finishedGoods}
        workOrders={workOrders}
        productionTrend={{
          data: productionTrendData,
          products: productsInTrend,
        }}
      />
    </section>
  );
}

function KpiCard({
  title,
  value,
  unit,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-3 shadow-sm">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          iconClassName ?? "bg-zinc-100 text-zinc-600"
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
          {title}
        </p>
        <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums text-foreground">
          {value}
          {unit ? (
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
