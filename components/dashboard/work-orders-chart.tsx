"use client";

import * as Recharts from "recharts";
import { useState } from "react";
import { Tooltip } from "radix-ui";
import { BarChart2, Table as TableIcon } from "lucide-react";

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

export type WorkOrderRow = {
  id: string;
  workOrderName: string;
  productLabel: string;
  planned: number;
  produced: number;
  remaining: number;
};

type Mode = "table" | "chart";

function truncate(name: string, length: number) {
  if (!name) return "";
  if (name.length <= length) return name;
  return `${name.slice(0, length - 1)}…`;
}

type TooltipPayloadItem = {
  payload?: WorkOrderRow;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">
      <div className="max-w-[16rem] truncate font-semibold text-foreground" title={row.workOrderName}>
        {row.workOrderName}
      </div>
      {row.productLabel ? (
        <div className="text-[11px] text-muted-foreground">{row.productLabel}</div>
      ) : null}
      <div className="mt-1 flex items-center gap-2 text-zinc-700">
        <span className="inline-block size-2 rounded-sm bg-blue-500" />
        Planned: {row.planned.toFixed(2)}
      </div>
      <div className="flex items-center gap-2 text-zinc-700">
        <span className="inline-block size-2 rounded-sm bg-emerald-500" />
        Produced: {row.produced.toFixed(2)}
      </div>
      <div className="flex items-center gap-2 text-zinc-700">
        <span className="inline-block size-2 rounded-sm bg-rose-500" />
        Remaining: {row.remaining.toFixed(2)}
      </div>
    </div>
  );
}

export function WorkOrdersChart({ data }: { data: WorkOrderRow[] }) {
  const [mode, setMode] = useState<Mode>("table");

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
        onClick={() => setMode("chart")}
        aria-label="Chart view"
        aria-pressed={mode === "chart"}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-[5px] text-zinc-600 transition-colors hover:bg-zinc-100",
          mode === "chart" && "bg-zinc-900 text-white hover:bg-zinc-900"
        )}
      >
        <BarChart2 className="size-4" />
      </button>
    </div>
  );

  if (data.length === 0) {
    return (
      <ChartCard title="Open Work Orders" action={action}>
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No open work orders.
        </div>
      </ChartCard>
    );
  }

  if (mode === "chart") {
    const chartData = data.map((row) => ({
      ...row,
      shortName: truncate(row.workOrderName, 14),
    }));
    return (
      <ChartCard title="Open Work Orders" action={action}>
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
              <Bar dataKey="planned" name="Planned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="produced" name="Produced" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="remaining" name="Remaining" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Open Work Orders" action={action}>
      <div className="max-h-72 overflow-auto">
        <Tooltip.Provider delayDuration={150}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">Work Order</th>
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 text-right font-medium">Planned</th>
                <th className="px-2 py-2 text-right font-medium">Produced</th>
                <th className="px-2 py-2 text-right font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-2 text-foreground">
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <span className="cursor-default">
                          {truncate(row.workOrderName, 20)}
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="top"
                          sideOffset={4}
                          className="z-50 max-w-sm rounded-md border bg-white px-2 py-1 text-xs text-zinc-700 shadow-md"
                        >
                          {row.workOrderName}
                          <Tooltip.Arrow className="fill-white" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </td>
                  <td className="px-2 py-2 text-zinc-700">{row.productLabel}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                    {row.planned.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-emerald-600">
                    {row.produced.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-rose-600">
                    {row.remaining.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tooltip.Provider>
      </div>
    </ChartCard>
  );
}
