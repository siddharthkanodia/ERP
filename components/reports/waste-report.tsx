"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";

import {
  getWasteReport,
  type WasteReportResponse,
  type WasteReportRow,
} from "@/actions/waste-reports";
import { Button } from "@/components/ui/button";

type WasteTypeOption = {
  id: string;
  name: string;
};

function monthYearKey(month: number, year: number) {
  return year * 100 + month;
}

function monthLabel(month: number, year: number) {
  return format(new Date(year, month - 1, 1), "MMM yyyy");
}

function monthFileLabel(month: number, year: number) {
  return format(new Date(year, month - 1, 1), "MMMyyyy");
}

function safeSheetName(name: string) {
  const trimmed = name.trim().slice(0, 31);
  return trimmed.replace(/[\[\]*\/\\?:]/g, "-") || "Waste Report";
}

function WasteXLSXButton({
  rows,
  wasteTypeName,
  fromLabel,
  toLabel,
}: {
  rows: WasteReportRow[];
  wasteTypeName: string;
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 px-3"
      onClick={() => {
        if (rows.length === 0) return;

        const data = rows.map((row) => ({
          Date: row.date,
          "Opening Balance": Number(row.openingBalance.toFixed(2)),
          "Waste Generated": Number(row.wasteGenerated.toFixed(2)),
          "Waste Dispatched": Number(row.wasteDispatched.toFixed(2)),
          "Closing Balance": Number(row.closingBalance.toFixed(2)),
        }));

        const ws = XLSX.utils.json_to_sheet(data, {
          header: [
            "Date",
            "Opening Balance",
            "Waste Generated",
            "Waste Dispatched",
            "Closing Balance",
          ],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Waste Report"));

        const safeName = wasteTypeName.trim().replace(/\s+/g, "_").slice(0, 40) || "Waste";
        XLSX.writeFile(wb, `Waste_Report_${safeName}_${fromLabel}-${toLabel}.xlsx`, {
          bookType: "xlsx",
        });
      }}
    >
      <Download className="mr-1 size-4" />
      Download XLSX
    </Button>
  );
}

export function WasteReport({
  companyId,
  wasteTypes,
  initialWasteTypeId,
  initialFromMonth,
  initialFromYear,
  initialToMonth,
  initialToYear,
  initialData,
}: {
  companyId: string;
  wasteTypes: WasteTypeOption[];
  initialWasteTypeId: string;
  initialFromMonth: number;
  initialFromYear: number;
  initialToMonth: number;
  initialToYear: number;
  initialData: WasteReportResponse;
}) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const [fromMonth, setFromMonth] = useState(initialFromMonth);
  const [fromYear, setFromYear] = useState(initialFromYear);
  const [toMonth, setToMonth] = useState(initialToMonth);
  const [toYear, setToYear] = useState(initialToYear);
  const [wasteTypeId, setWasteTypeId] = useState(initialWasteTypeId);
  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromKey = monthYearKey(fromMonth, fromYear);
  const toKey = monthYearKey(toMonth, toYear);
  const rangeError = toKey < fromKey ? "To Month cannot be before From Month." : null;

  function isFutureMonth(month: number, year: number) {
    return year > currentYear || (year === currentYear && month > currentMonth);
  }

  function toDateRange(month: number, year: number, isStart: boolean) {
    const firstDate = `${year}-${String(month).padStart(2, "0")}-01`;
    if (isStart) return firstDate;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  useEffect(() => {
    if (rangeError) {
      setData({ rows: [], totals: { totalGenerated: 0, totalDispatched: 0 } });
      return;
    }

    const fromDate = toDateRange(fromMonth, fromYear, true);
    const toDate = toDateRange(toMonth, toYear, false);

    setError(null);
    let active = true;

    const run = async () => {
      setIsLoading(true);
      try {
        const response = await getWasteReport({
          fromDate,
          toDate,
          companyId,
          ...(wasteTypeId ? { finishedProductId: wasteTypeId } : {}),
        });
        if (active) setData(response);
      } catch {
        if (active) setError("Failed to load waste report.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [companyId, fromMonth, fromYear, rangeError, toMonth, toYear, wasteTypeId]);

  const fromFile = monthFileLabel(fromMonth, fromYear);
  const toFile = monthFileLabel(toMonth, toYear);
  const wasteTypeName =
    wasteTypes.find((wasteType) => wasteType.id === wasteTypeId)?.name ??
    "All Waste Types";

  const tableTotals = useMemo(
    () => ({
      totalGenerated: data.totals.totalGenerated.toFixed(2),
      totalDispatched: data.totals.totalDispatched.toFixed(2),
    }),
    [data.totals.totalDispatched, data.totals.totalGenerated]
  );

  return (
    <div className="space-y-4">
      <form className="rounded-md border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="wasteTypeId">
              Waste Type
            </label>
            <select
              id="wasteTypeId"
              value={wasteTypeId}
              onChange={(e) => setWasteTypeId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
            >
              <option value="">All Waste Types</option>
              {wasteTypes.map((wasteType) => (
                <option key={wasteType.id} value={wasteType.id}>
                  {wasteType.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">From Month</div>
            <div className="flex gap-2">
              <select
                value={fromMonth}
                onChange={(e) => setFromMonth(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
              >
                {monthOptions.map((m) => (
                  <option
                    key={`from-m-${m}`}
                    value={m}
                    disabled={isFutureMonth(m, fromYear)}
                  >
                    {format(new Date(fromYear, m - 1, 1), "MMM")}
                  </option>
                ))}
              </select>
              <select
                value={fromYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setFromYear(y);
                  if (isFutureMonth(fromMonth, y)) setFromMonth(currentMonth);
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={`from-y-${y}`} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">To Month</div>
            <div className="flex gap-2">
              <select
                value={toMonth}
                onChange={(e) => setToMonth(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
              >
                {monthOptions.map((m) => (
                  <option key={`to-m-${m}`} value={m} disabled={isFutureMonth(m, toYear)}>
                    {format(new Date(toYear, m - 1, 1), "MMM")}
                  </option>
                ))}
              </select>
              <select
                value={toYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setToYear(y);
                  if (isFutureMonth(toMonth, y)) setToMonth(currentMonth);
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={`to-y-${y}`} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {rangeError ? (
          <p className="mt-2 text-sm font-medium text-destructive">{rangeError}</p>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {wasteTypeName} · {monthLabel(fromMonth, fromYear)} → {monthLabel(toMonth, toYear)}
        </div>
        <WasteXLSXButton
          rows={data.rows}
          wasteTypeName={wasteTypeName}
          fromLabel={fromFile}
          toLabel={toFile}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center gap-2 rounded-md border bg-card px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading report data...
        </div>
      ) : data.rows.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No waste activity found for the selected range.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Opening Balance</th>
                <th className="px-4 py-3 text-right font-medium">Waste Generated</th>
                <th className="px-4 py-3 text-right font-medium">Waste Dispatched</th>
                <th className="px-4 py-3 text-right font-medium">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.date} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.openingBalance.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.wasteGenerated === 0 ? "—" : row.wasteGenerated.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.wasteDispatched === 0 ? "—" : row.wasteDispatched.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.closingBalance.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">—</td>
                <td className="px-4 py-3 text-right tabular-nums">{tableTotals.totalGenerated}</td>
                <td className="px-4 py-3 text-right tabular-nums">{tableTotals.totalDispatched}</td>
                <td className="px-4 py-3 text-right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
