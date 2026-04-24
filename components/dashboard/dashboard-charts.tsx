"use client";

import {
  RawMaterialsChart,
  type RawMaterialRow,
} from "@/components/dashboard/raw-materials-chart";
import {
  FinishedGoodsChart,
  type FinishedGoodRow,
} from "@/components/dashboard/finished-goods-chart";
import {
  WorkOrdersChart,
  type WorkOrderRow,
} from "@/components/dashboard/work-orders-chart";
import {
  ProductionTrendChart,
  type ProductionTrendRow,
} from "@/components/dashboard/production-trend-chart";

export type DashboardChartsProps = {
  rawMaterials: RawMaterialRow[];
  finishedGoods: FinishedGoodRow[];
  workOrders: WorkOrderRow[];
  productionTrend: {
    data: ProductionTrendRow[];
    products: string[];
  };
};

export function DashboardCharts({
  rawMaterials,
  finishedGoods,
  workOrders,
  productionTrend,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <RawMaterialsChart data={rawMaterials} />
      <FinishedGoodsChart data={finishedGoods} />
      <WorkOrdersChart data={workOrders} />
      <ProductionTrendChart
        data={productionTrend.data}
        products={productionTrend.products}
      />
    </div>
  );
}
