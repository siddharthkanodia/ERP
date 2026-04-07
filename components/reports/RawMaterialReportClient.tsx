"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  format,
  isAfter,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { Loader2 } from "lucide-react";

import { fetchRawMaterialInventoryReport } from "@/actions/reports";
import type { RawMaterialInventoryReportRow } from "@/lib/reports/queries";
import { Button } from "@/components/ui/button";
import { RawMaterialInventoryXLSXButton } from "@/components/reports/RawMaterialInventoryXLSXButton";

type MaterialOption = { id: string; name: string };

function monthYearKey(month: number, year: number) {
  return year * 100 + month;
}

function monthLabel(month: number, year: number) {
  return format(new Date(year, month - 1, 1), "MMM yyyy");
}

function monthFileLabel(month: number, year: number) {
  return format(new Date(year, month - 1, 1), "MMMyyyy");
}

function parseISODateKeyToDate(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function RawMaterialReportClient({
  materials,
  defaultMaterialId,
}: {
  materials: MaterialOption[];
  defaultMaterialId: string;
}) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [materialId, setMaterialId] = useState(defaultMaterialId);
  const [fromMonth, setFromMonth] = useState(currentMonth);
  const [fromYear, setFromYear] = useState(currentYear);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [toYear, setToYear] = useState(currentYear);
  const [reportData, setReportData] = useState<RawMaterialInventoryReportRow[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);

  const fromKey = monthYearKey(fromMonth, fromYear);
  const toKey = monthYearKey(toMonth, toYear);
  const rangeError =
    toKey < fromKey ? "End month cannot be before start month." : null;

  const materialName =
    materials.find((m) => m.id === materialId)?.name ??
    materials[0]?.name ??
    "Material";

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  function isFutureMonth(month: number, year: number) {
    return year > currentYear || (year === currentYear && month > currentMonth);
  }

  const loadReport = useCallback(async () => {
    if (!materialId || rangeError) return;
    setIsLoading(true);
    try {
      const data = await fetchRawMaterialInventoryReport({
        materialId,
        fromMonth,
        fromYear,
        toMonth,
        toYear,
      });
      setReportData(data);
    } finally {
      setIsLoading(false);
    }
  }, [materialId, fromMonth, fromYear, toMonth, toYear, rangeError]);

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = () => {
    void loadReport();
  };

  const today = startOfDay(new Date());

  const rowsWithSeparators = useMemo(() => {
    const out: Array<
      | { kind: "separator"; label: string; key: string }
      | { kind: "row"; row: RawMaterialInventoryReportRow }
    > = [];

    let lastMonthStart: Date | null = null;
    for (const r of reportData) {
      const d = parseISODateKeyToDate(r.dateISO);
      const monthStart = startOfMonth(d);
      if (!lastMonthStart || !isSameMonth(monthStart, lastMonthStart)) {
        out.push({
          kind: "separator",
          label: `── ${format(monthStart, "MMMM yyyy")} ──`,
          key: `sep-${r.dateISO}`,
        });
        lastMonthStart = monthStart;
      }
      out.push({ kind: "row", row: r });
    }
    return out;
  }, [reportData]);

  const exportableRows = useMemo(() => {
    return reportData
      .filter((r) => !isAfter(parseISODateKeyToDate(r.dateISO), today))
      .map((r) => ({
        dateISO: r.dateISO,
        opening: r.opening,
        received: r.received,
        issued: r.issued,
        closing: r.closing,
      }));
  }, [reportData, today]);

  const fromFile = monthFileLabel(fromMonth, fromYear);
  const toFile = monthFileLabel(toMonth, toYear);

  return (
    <>
      <form
        className="mb-4 rounded-md border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleUpdate();
        }}
      >
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-4">
            <label className="text-sm font-medium" htmlFor="materialId">
              Raw Material
            </label>
            <select
              id="materialId"
              name="materialId"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
              required
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
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
                  <option
                    key={`to-m-${m}`}
                    value={m}
                    disabled={isFutureMonth(m, toYear)}
                  >
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

          <div className="flex items-end">
            <Button
              type="submit"
              className="h-9 w-full px-4"
              disabled={isLoading || !materialId || Boolean(rangeError)}
            >
              {isLoading ? "Updating..." : "Update"}
            </Button>
          </div>
        </div>

        {rangeError ? (
          <p className="mt-2 text-sm font-medium text-destructive">{rangeError}</p>
        ) : null}
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {monthLabel(fromMonth, fromYear)} → {monthLabel(toMonth, toYear)}
        </div>
        <RawMaterialInventoryXLSXButton
          rows={exportableRows}
          materialName={materialName}
          fromLabel={fromFile}
          toLabel={toFile}
        />
      </div>

      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center gap-2 rounded-md border bg-card px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading report data...
        </div>
      ) : reportData.length === 0 ? (
        <div className="rounded-md border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No ledger activity found for the selected range.
          </p>
        </div>
      ) : (
        <div
          className="rounded-md border bg-card"
          style={{ height: "calc(100vh - 320px)", overflow: "hidden" }}
        >
          <div style={{ height: "100%", overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "hsl(var(--card))" }}>
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      backgroundColor: "white",
                      boxShadow: "0 1px 0 hsl(var(--border))",
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      backgroundColor: "white",
                      boxShadow: "0 1px 0 hsl(var(--border))",
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    Opening
                  </th>
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      backgroundColor: "white",
                      boxShadow: "0 1px 0 hsl(var(--border))",
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    Received
                  </th>
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      backgroundColor: "white",
                      boxShadow: "0 1px 0 hsl(var(--border))",
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    Issued
                  </th>
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      backgroundColor: "white",
                      boxShadow: "0 1px 0 hsl(var(--border))",
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    Closing
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowsWithSeparators.map((item) => {
                  if (item.kind === "separator") {
                    return (
                      <tr
                        key={item.key}
                        style={{ backgroundColor: "hsl(var(--muted) / 0.2)" }}
                      >
                        <td
                          colSpan={5}
                          style={{
                            padding: "8px 16px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            color: "hsl(var(--muted-foreground))",
                          }}
                        >
                          {item.label}
                        </td>
                      </tr>
                    );
                  }

                  const r = item.row
                  const dateObj = parseISODateKeyToDate(r.dateISO)
                  const isFuture = isAfter(dateObj, today)
                  const cellStyle = {
                    padding: "12px 16px",
                    borderBottom: "1px solid hsl(var(--border))",
                    fontSize: "0.875rem",
                    opacity: isFuture ? 0.4 : 1,
                  }

                  return (
                    <tr key={r.dateISO}>
                      <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums" }}>
                        {r.dateLabel}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {isFuture ? "-" : r.opening.toFixed(2)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {isFuture ? "-" : r.received.toFixed(2)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {isFuture ? "-" : r.issued.toFixed(2)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {isFuture ? "-" : r.closing.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
