import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.companyId) {
    redirect("/login");
  }
  const companyId = session.companyId;

  const [totalMaterials, totalEmployees, activeWorkOrders] = await Promise.all([
    prisma.rawMaterial.count({
      where: { companyId },
    }),
    prisma.employee.count({
      where: {
        companyId,
        isDeleted: false,
      },
    }),
    prisma.workOrder.count({
      where: {
        companyId,
        status: "OPEN",
      },
    }),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Operations Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {session.email}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Materials"
          value={totalMaterials}
          description="Raw materials in inventory"
        />
        <MetricCard
          title="Total Employees"
          value={totalEmployees}
          description="Active employee headcount"
        />
        <MetricCard
          title="Active Work Orders"
          value={activeWorkOrders}
          description="Currently open on the shop floor"
        />
      </div>
    </section>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
