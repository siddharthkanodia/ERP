import { redirect } from "next/navigation";

import {
  getDailyProductionReport,
  getMonthlyProductionReport,
} from "@/actions/production-reports";
import { getAuthSession } from "@/lib/auth";
import { ProductionReport } from "@/components/reports/production-report";

export default async function ProductionReportPage() {
  const session = await getAuthSession();
  if (!session?.companyId) redirect("/login");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  // Daily defaults: first of current month → today (IST)
  const mm = String(currentMonth).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const fromISO = `${currentYear}-${mm}-01`;
  const toISO = `${currentYear}-${mm}-${dd}`;

  // Pre-fetch both views in parallel for instant first render
  const [initialDailyRows, initialMonthlyRows] = await Promise.all([
    getDailyProductionReport(fromISO, toISO),
    getMonthlyProductionReport(currentYear, currentMonth),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Production Report
        </h1>
        <p className="text-sm text-muted-foreground">
          Daily entries and monthly aggregates for finished goods production.
        </p>
      </header>

      <ProductionReport
        initialDailyRows={initialDailyRows}
        initialMonthlyRows={initialMonthlyRows}
        initialFromISO={fromISO}
        initialToISO={toISO}
        initialMonth={currentMonth}
        initialYear={currentYear}
      />
    </section>
  );
}
