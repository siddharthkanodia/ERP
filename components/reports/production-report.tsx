"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Tabs } from "radix-ui";

import {
  getDailyProductionReport,
  getMonthlyProductionReport,
  type DailyGroup,
  type ProductGroup,
} from "@/actions/production-reports";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d), "dd MMM yyyy");
}

function n2(v: number) {
  return v.toFixed(2);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const inputClass =
  "h-9 rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2";
const outlineBtnClass =
  "inline-flex items-center gap-2 rounded-md border border-black bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed";
const ghostSmBtnClass =
  "inline-flex items-center rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

// ─── Tab trigger ─────────────────────────────────────────────────────────────

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "rounded-[5px] px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "data-[state=active]:bg-zinc-900 data-[state=active]:text-white"
      )}
    >
      {children}
    </Tabs.Trigger>
  );
}

function TableEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Daily table ─────────────────────────────────────────────────────────────

function DailyTable({
  groups,
  expandedIds,
  onToggle,
  onExpandAll,
  onCollapseAll,
}: {
  groups: DailyGroup[];
  expandedIds: Set<string>;
  onToggle: (key: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  if (groups.length === 0) {
    return <TableEmpty message="No production entries found for this date range." />;
  }

  const today = todayISO();
  const hasAnyVariants = groups.some((dg) => dg.products.some((pg) => pg.hasVariants));

  const grandTotalPcs = groups.reduce(
    (sum, day) => sum + day.products.reduce((acc, p) => acc + p.totalPcs, 0),
    0
  );
  const grandTotalKg = groups.reduce((sum, day) => {
    return sum + day.products.reduce((acc, p) => acc + p.totalKg, 0);
  }, 0);

  return (
    <div className="space-y-2">
      {hasAnyVariants && (
        <div className="flex justify-end gap-1">
          <button type="button" className={ghostSmBtnClass} onClick={onExpandAll}>
            Expand all
          </button>
          <span className="self-center text-xs text-muted-foreground/40">·</span>
          <button type="button" className={ghostSmBtnClass} onClick={onCollapseAll}>
            Collapse all
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Finished Good</th>
              <th className="px-3 py-2 text-right font-medium">Produced (pcs)</th>
              <th className="px-3 py-2 text-right font-medium">Produced (kg)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((dg) => {
              const isToday = dg.date === today;
              const dateLabel = formatDateLabel(dg.date);
              return dg.products.map((pg) => {
                const rowKey = `${dg.date}-${pg.productId}`;
                const isExpanded = expandedIds.has(rowKey);
                const totalEntries = pg.variants.reduce((s, v) => s + v.entryCount, 0);

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className={cn(
                        "border-b transition-colors",
                        pg.hasVariants
                          ? "cursor-pointer hover:bg-muted/30"
                          : "hover:bg-muted/30",
                        isToday && "bg-amber-50/60"
                      )}
                      onClick={pg.hasVariants ? () => onToggle(rowKey) : undefined}
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        <span
                          className={cn(
                            "font-medium",
                            isToday ? "text-amber-700" : "text-foreground"
                          )}
                        >
                          {dateLabel}
                        </span>
                        {isToday && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex w-4 shrink-0 items-center justify-center text-muted-foreground">
                            {pg.hasVariants ? (
                              isExpanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )
                            ) : null}
                          </span>
                          <span className="font-medium">{pg.productName}</span>
                          {pg.hasVariants && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                              {totalEntries}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pg.unit === "PIECE" ? pg.totalPcs.toFixed(0) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{n2(pg.totalKg)}</td>
                    </tr>

                    {isExpanded &&
                      pg.variants.map((vg) => (
                        <tr
                          key={`${rowKey}-${vg.variantId ?? "none"}`}
                          className="border-b bg-muted/10 hover:bg-muted/20"
                        >
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5">
                            <span className="pl-6 text-muted-foreground">
                              {vg.variantName ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {pg.unit === "PIECE" ? vg.totalPcs.toFixed(0) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {n2(vg.totalKg)}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              });
            })}
          </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/30 font-semibold">
                <td colSpan={2} className="py-3 px-4">Total</td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {grandTotalPcs > 0 ? grandTotalPcs.toLocaleString() : "—"}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {grandTotalKg.toFixed(2)}
                </td>
              </tr>
            </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Monthly table ────────────────────────────────────────────────────────────

function MonthlyTable({
  groups,
  expandedIds,
  onToggle,
  onExpandAll,
  onCollapseAll,
}: {
  groups: ProductGroup[];
  expandedIds: Set<string>;
  onToggle: (key: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  if (groups.length === 0) {
    return <TableEmpty message="No production entries found for this month." />;
  }

  const hasAnyVariants = groups.some((pg) => pg.hasVariants);

  const grandTotalPcs = groups.reduce((sum, p) => sum + p.totalPcs, 0);
  const grandTotalKg = groups.reduce((sum, p) => sum + p.totalKg, 0);

  return (
    <div className="space-y-2">
      {hasAnyVariants && (
        <div className="flex justify-end gap-1">
          <button type="button" className={ghostSmBtnClass} onClick={onExpandAll}>
            Expand all
          </button>
          <span className="self-center text-xs text-muted-foreground/40">·</span>
          <button type="button" className={ghostSmBtnClass} onClick={onCollapseAll}>
            Collapse all
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Finished Good</th>
              <th className="px-3 py-2 text-right font-medium">Total (pcs)</th>
              <th className="px-3 py-2 text-right font-medium">Total (kg)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((pg) => {
              const rowKey = pg.productId;
              const isExpanded = expandedIds.has(rowKey);
              const totalEntries = pg.variants.reduce((s, v) => s + v.entryCount, 0);

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={cn(
                      "border-b transition-colors",
                      pg.hasVariants
                        ? "cursor-pointer hover:bg-muted/30"
                        : "hover:bg-muted/30"
                    )}
                    onClick={pg.hasVariants ? () => onToggle(rowKey) : undefined}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex w-4 shrink-0 items-center justify-center text-muted-foreground">
                          {pg.hasVariants ? (
                            isExpanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )
                          ) : null}
                        </span>
                        <span className="font-medium">{pg.productName}</span>
                        {pg.hasVariants && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {totalEntries}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pg.unit === "PIECE" ? pg.totalPcs.toFixed(0) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{n2(pg.totalKg)}</td>
                  </tr>

                  {isExpanded &&
                    pg.variants.map((vg) => (
                      <tr
                        key={`${rowKey}-${vg.variantId ?? "none"}`}
                        className="border-b bg-muted/10 hover:bg-muted/20"
                      >
                        <td className="px-3 py-1.5">
                          <span className="pl-6 text-muted-foreground">
                            {vg.variantName ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {pg.unit === "PIECE" ? vg.totalPcs.toFixed(0) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {n2(vg.totalKg)}
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/30 font-semibold">
                <td className="py-3 px-4">Total</td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {grandTotalPcs > 0 ? grandTotalPcs.toLocaleString() : "—"}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {grandTotalKg.toFixed(2)}
                </td>
              </tr>
            </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProductionReport({
  initialDailyRows,
  initialMonthlyRows,
  initialFromISO,
  initialToISO,
  initialMonth,
  initialYear,
}: {
  initialDailyRows: DailyGroup[];
  initialMonthlyRows: ProductGroup[];
  initialFromISO: string;
  initialToISO: string;
  initialMonth: number;
  initialYear: number;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ─ Daily state
  const [fromISO, setFromISO] = useState(initialFromISO);
  const [toISO, setToISO] = useState(initialToISO);
  const [dailyGroups, setDailyGroups] = useState<DailyGroup[]>(initialDailyRows);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [expandedDailyIds, setExpandedDailyIds] = useState<Set<string>>(new Set());

  // ─ Monthly state
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [monthlyGroups, setMonthlyGroups] = useState<ProductGroup[]>(initialMonthlyRows);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [expandedMonthlyIds, setExpandedMonthlyIds] = useState<Set<string>>(new Set());

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // ─ Expand / collapse helpers

  function toggleDaily(key: string) {
    setExpandedDailyIds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function expandAllDaily() {
    const keys = new Set<string>();
    for (const dg of dailyGroups) {
      for (const pg of dg.products) {
        if (pg.hasVariants) keys.add(`${dg.date}-${pg.productId}`);
      }
    }
    setExpandedDailyIds(keys);
  }

  function toggleMonthly(key: string) {
    setExpandedMonthlyIds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function expandAllMonthly() {
    setExpandedMonthlyIds(
      new Set(monthlyGroups.filter((pg) => pg.hasVariants).map((pg) => pg.productId))
    );
  }

  // ─ Data fetching

  const loadDaily = useCallback(async (from: string, to: string) => {
    if (!from || !to || from > to) {
      setDailyError("End date must be on or after start date.");
      return;
    }
    setDailyError(null);
    setDailyLoading(true);
    try {
      setDailyGroups(await getDailyProductionReport(from, to));
      setExpandedDailyIds(new Set());
    } catch {
      setDailyError("Failed to load report. Please try again.");
    } finally {
      setDailyLoading(false);
    }
  }, []);

  const loadMonthly = useCallback(async (y: number, m: number) => {
    setMonthlyError(null);
    setMonthlyLoading(true);
    try {
      setMonthlyGroups(await getMonthlyProductionReport(y, m));
      setExpandedMonthlyIds(new Set());
    } catch {
      setMonthlyError("Failed to load report. Please try again.");
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  useEffect(() => { void loadDaily(fromISO, toISO); }, [fromISO, toISO]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadMonthly(year, month); }, [month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Excel export (flat: 1 row per variant)

  function downloadDailyExcel() {
    import("xlsx").then((XLSX) => {
      const rows: Record<string, string | number>[] = [];
      for (const dg of dailyGroups) {
        const dateLabel = formatDateLabel(dg.date);
        for (const pg of dg.products) {
          if (pg.hasVariants) {
            for (const vg of pg.variants) {
              rows.push({
                Date: dateLabel,
                "Finished Good": pg.productName,
                Variant: vg.variantName ?? "",
                "Produced (pcs)": pg.unit === "PIECE" ? vg.totalPcs : "",
                "Produced (kg)": vg.totalKg,
              });
            }
          } else {
            rows.push({
              Date: dateLabel,
              "Finished Good": pg.productName,
              Variant: "",
              "Produced (pcs)": pg.unit === "PIECE" ? pg.totalPcs : "",
              "Produced (kg)": pg.totalKg,
            });
          }
        }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Daily Production");
      XLSX.writeFile(wb, `production-daily-${fromISO}-to-${toISO}.xlsx`);
    });
  }

  function downloadMonthlyExcel() {
    import("xlsx").then((XLSX) => {
      const monthLabel = format(new Date(year, month - 1, 1), "MMMyyyy");
      const rows: Record<string, string | number>[] = [];
      for (const pg of monthlyGroups) {
        if (pg.hasVariants) {
          for (const vg of pg.variants) {
            rows.push({
              "Finished Good": pg.productName,
              Variant: vg.variantName ?? "",
              "Total (pcs)": pg.unit === "PIECE" ? vg.totalPcs : "",
              "Total (kg)": vg.totalKg,
            });
          }
        } else {
          rows.push({
            "Finished Good": pg.productName,
            Variant: "",
            "Total (pcs)": pg.unit === "PIECE" ? pg.totalPcs : "",
            "Total (kg)": pg.totalKg,
          });
        }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Monthly Production");
      XLSX.writeFile(wb, `production-monthly-${monthLabel}.xlsx`);
    });
  }

  const dailyEmpty = dailyGroups.length === 0;
  const monthlyEmpty = monthlyGroups.length === 0;

  return (
    <Tabs.Root defaultValue="daily" className="space-y-4">
      <Tabs.List
        className="inline-flex items-center gap-1 rounded-md border bg-card p-1"
        aria-label="Report view"
      >
        <TabTrigger value="daily">Daily</TabTrigger>
        <TabTrigger value="monthly">Monthly</TabTrigger>
      </Tabs.List>

      {/* ── Daily ── */}
      <Tabs.Content value="daily" className="space-y-4 focus:outline-none">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={fromISO}
                max={todayISO()}
                onChange={(e) => setFromISO(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={toISO}
                max={todayISO()}
                onChange={(e) => setToISO(e.target.value)}
                className={inputClass}
              />
            </div>
            {dailyError ? (
              <p className="self-center text-sm text-destructive">{dailyError}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={downloadDailyExcel}
            disabled={dailyLoading || dailyEmpty}
            className={outlineBtnClass}
          >
            <Download className="size-4" />
            Download Excel
          </button>
        </div>

        {dailyLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DailyTable
            groups={dailyGroups}
            expandedIds={expandedDailyIds}
            onToggle={toggleDaily}
            onExpandAll={expandAllDaily}
            onCollapseAll={() => setExpandedDailyIds(new Set())}
          />
        )}
      </Tabs.Content>

      {/* ── Monthly ── */}
      <Tabs.Content value="monthly" className="space-y-4 focus:outline-none">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className={inputClass}
              >
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={inputClass}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {monthlyError ? (
              <p className="self-center text-sm text-destructive">{monthlyError}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={downloadMonthlyExcel}
            disabled={monthlyLoading || monthlyEmpty}
            className={outlineBtnClass}
          >
            <Download className="size-4" />
            Download Excel
          </button>
        </div>

        {monthlyLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MonthlyTable
            groups={monthlyGroups}
            expandedIds={expandedMonthlyIds}
            onToggle={toggleMonthly}
            onExpandAll={expandAllMonthly}
            onCollapseAll={() => setExpandedMonthlyIds(new Set())}
          />
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}
