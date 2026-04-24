"use client";

import * as Recharts from "recharts";
import { parseISO, format } from "date-fns";

import { ChartCard } from "@/components/dashboard/chart-card";

const {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip: RechartsTooltip,
  Legend,
  ResponsiveContainer,
} = Recharts;

const PALETTE = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#f43f5e", // rose
  "#06b6d4", // cyan
  "#f97316", // orange
];

export type ProductionTrendRow = {
  dateISO: string;
} & Record<string, string | number>;

type TrendPayloadItem = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TrendPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const fullDate = format(parseISO(label), "MMMM d, yyyy");
  const items = payload.filter((p) => typeof p.value === "number" && (p.value ?? 0) > 0);
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-foreground">{fullDate}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-zinc-500">No production</div>
      ) : (
        <div className="mt-1 space-y-0.5">
          {items.map((p) => (
            <div key={String(p.dataKey)} className="flex items-center gap-2 text-zinc-700">
              <span
                className="inline-block size-2 rounded-sm"
                style={{ backgroundColor: p.color }}
              />
              <span className="truncate">{p.name}:</span>
              <span className="ml-auto tabular-nums">
                {(p.value as number).toFixed(2)} kg
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductionTrendChart({
  data,
  products,
}: {
  data: ProductionTrendRow[];
  products: string[];
}) {
  const hasAnyValue = data.some((row) =>
    products.some((p) => Number(row[p] ?? 0) > 0)
  );

  const xTickFormatter = (iso: string) => {
    try {
      return format(parseISO(iso), "MMM d");
    } catch {
      return iso;
    }
  };

  return (
    <ChartCard title="Production Trend — Last 7 Days">
      {!hasAnyValue ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No production recorded in the last 7 days.
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="dateISO"
                tick={{ fontSize: 11, fill: "#52525b" }}
                tickFormatter={xTickFormatter}
              />
              <YAxis tick={{ fontSize: 11, fill: "#52525b" }} width={48} />
              <RechartsTooltip
                cursor={{ fill: "rgba(244,244,245,0.6)" }}
                content={<CustomTooltip />}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {products.map((product, index) => (
                <Bar
                  key={product}
                  dataKey={product}
                  name={product}
                  stackId="production"
                  fill={PALETTE[index % PALETTE.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
