"use client";

import * as Recharts from "recharts";
import { useState } from "react";
import { Layers, Table as TableIcon } from "lucide-react";

import { ChartCard } from "@/components/dashboard/chart-card";
import { cn } from "@/lib/utils";

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

export type RawMaterialRow = {
  name: string;
  warehouse: number;
  floor: number;
};

type Mode = "table" | "stacked";

function truncate(name: string, length = 12) {
  if (name.length <= length) return name;
  return `${name.slice(0, length - 1)}…`;
}

type TooltipPayloadItem = {
  payload?: RawMaterialRow;
  value?: number;
  dataKey?: string | number;
  color?: string;
  name?: string;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as RawMaterialRow | undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-foreground">{row.name}</div>
      <div className="mt-1 flex items-center gap-2 text-zinc-700">
        <span className="inline-block size-2 rounded-sm bg-blue-500" />
        Warehouse: {row.warehouse.toFixed(2)} kg
      </div>
      <div className="flex items-center gap-2 text-zinc-700">
        <span className="inline-block size-2 rounded-sm bg-amber-500" />
        Floor: {row.floor.toFixed(2)} kg
      </div>
    </div>
  );
}

export function RawMaterialsChart({ data }: { data: RawMaterialRow[] }) {
  const [mode, setMode] = useState<Mode>("table");

  const chartData = data.map((d) => ({
    ...d,
    shortName: truncate(d.name, 12),
  }));

  const action = (
    <div className="flex items-center gap-1 rounded-md border bg-white p-0.5">
      <button
        type="button"
        onClick={() => setMode("table")}
        aria-label="Table view"
        aria-pressed={mode === "table"}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-[5px] text-zinc-600 transition-colors hover:bg-zinc-100",
          mode === "table" && "bg-zinc-900 text-white hover:bg-zinc-900"
        )}
      >
        <TableIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setMode("stacked")}
        aria-label="Stacked bar view"
        aria-pressed={mode === "stacked"}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-[5px] text-zinc-600 transition-colors hover:bg-zinc-100",
          mode === "stacked" && "bg-zinc-900 text-white hover:bg-zinc-900"
        )}
      >
        <Layers className="size-4" />
      </button>
    </div>
  );

  return (
    <ChartCard title="Raw Materials" action={action}>
      {chartData.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No raw materials yet.
        </div>
      ) : mode === "table" ? (
        <div className="h-72 w-full overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="border-b px-2 py-2 font-medium">Material Name</th>
                <th className="border-b px-2 py-2 text-right font-medium">
                  Warehouse Stock (kg)
                </th>
                <th className="border-b px-2 py-2 text-right font-medium">
                  Floor Stock (kg)
                </th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.name} className="border-b last:border-b-0">
                  <td className="px-2 py-2 text-foreground" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                    {row.warehouse.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                    {row.floor.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fontSize: 11, fill: "#52525b" }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 11, fill: "#52525b" }} width={48} />
              <RechartsTooltip
                cursor={{ fill: "rgba(244,244,245,0.6)" }}
                content={<CustomTooltip />}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="warehouse"
                name="Warehouse"
                fill="#3b82f6"
                stackId="stock"
              />
              <Bar
                dataKey="floor"
                name="Floor"
                fill="#f59e0b"
                stackId="stock"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
