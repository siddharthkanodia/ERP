"use client";

import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RMEfficiencyMonth } from "@/actions/reports";

function n2(value: number) {
  return value.toFixed(2);
}

export function RMEfficiencyReport({
  data,
  financialYear,
}: {
  data: RMEfficiencyMonth[];
  financialYear: string;
}) {
  function downloadExcel() {
    import("xlsx").then((XLSX) => {
      const rows = data.map((row) => ({
        Month: row.month,
        "RM Issued (kg)": row.rmIssued,
        "Total Production (kg)": row.totalProduction,
        "Total Waste (kg)": row.totalWaste,
        "RM Consumed (kg)": row.rmConsumed,
        "Difference (kg)": row.differenceQty,
        "Difference (%)": row.differencePercent,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "RM Efficiency");
      XLSX.writeFile(wb, `rm-efficiency-${financialYear}.xlsx`);
    });
  }

  const chartData = data.map((row) => ({
    name: row.month.split(" ")[0], // short month "Apr", "May", …
    fullMonth: row.month,
    "RM Issued": row.rmIssued,
    "Total Production": row.totalProduction,
    "Total Waste": row.totalWaste,
  }));

  return (
    <div className="space-y-6">
      {/* Download button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={downloadExcel}
          className="inline-flex items-center gap-2 rounded-md border border-black bg-black px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black/90"
        >
          <Download className="size-4" />
          Download Excel
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">
                RM Issued (kg)
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Total Production (kg)
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Total Waste (kg)
              </th>
              <th className="px-3 py-2 text-right font-medium">
                RM Consumed (kg)
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Difference (kg)
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Difference (%)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const diffColor =
                row.differenceQty > 0
                  ? "text-emerald-700"
                  : row.differenceQty < 0
                    ? "text-red-600"
                    : "";
              const diffPctColor =
                row.differencePercent > 0
                  ? "text-emerald-700"
                  : row.differencePercent < 0
                    ? "text-red-600"
                    : "";
              return (
                <tr
                  key={row.monthIndex}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <span>{row.month}</span>
                    {row.isCurrentMonth ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        In Progress
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n2(row.rmIssued)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n2(row.totalProduction)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n2(row.totalWaste)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n2(row.rmConsumed)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${diffColor}`}
                  >
                    {n2(row.differenceQty)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${diffPctColor}`}
                  >
                    {n2(row.differencePercent)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chart */}
      <div className="rounded-md border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold">Monthly Overview</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={chartData}
            barCategoryGap="20%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat("en", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(v)
              }
            />
            <Tooltip
              formatter={(value) => [
                `${Number(value ?? 0).toFixed(2)} kg`,
              ]}
              labelFormatter={(_label, payload) => {
                return payload?.[0]?.payload?.fullMonth ?? _label;
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Bar dataKey="RM Issued" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Bar
              dataKey="Total Production"
              fill="#22c55e"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="Total Waste"
              fill="#f59e0b"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
