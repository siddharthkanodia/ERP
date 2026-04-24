import { redirect } from "next/navigation";

import { getWasteReport } from "@/actions/waste-reports";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WasteReport } from "@/components/reports/waste-report";

export default async function WasteReportPage() {
  const session = await getAuthSession();
  if (!session?.companyId) redirect("/login");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate()
  ).padStart(2, "0")}`;

  const wasteTypes = await prisma.finishedProduct.findMany({
    where: {
      companyId: session.companyId,
      isWaste: true,
      isDeleted: false,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const initialData = await getWasteReport({
    fromDate,
    toDate,
    companyId: session.companyId,
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Waste Report</h1>
        <p className="text-sm text-muted-foreground">
          Track daily waste generation and dispatch from waste ledger activity.
        </p>
      </header>

      <WasteReport
        companyId={session.companyId}
        wasteTypes={wasteTypes}
        initialWasteTypeId=""
        initialFromMonth={month}
        initialFromYear={year}
        initialToMonth={month}
        initialToYear={year}
        initialData={initialData}
      />
    </section>
  );
}
