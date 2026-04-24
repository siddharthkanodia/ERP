import { redirect } from "next/navigation";

import { getMonthlyRMEfficiencyReport } from "@/actions/reports";
import { getAuthSession } from "@/lib/auth";
import { RMEfficiencyReport } from "@/components/reports/rm-efficiency-report";

export default async function ProductionEfficiencyReportPage() {
  const session = await getAuthSession();
  if (!session?.companyId) redirect("/login");

  const data = await getMonthlyRMEfficiencyReport(session.companyId);

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const fyStartYear = curMonth >= 3 ? curYear : curYear - 1;
  const fyEndYear = fyStartYear + 1;
  const financialYear = `${fyStartYear}-${String(fyEndYear).slice(2)}`;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Raw Material Issued vs Consumed
        </h1>
        <p className="text-sm text-muted-foreground">
          Financial Year April – March · All quantities in kg
        </p>
      </header>

      <RMEfficiencyReport data={data} financialYear={financialYear} />
    </section>
  );
}
