import { redirect } from "next/navigation";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SuperAdminDashboardPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const [totalCompanies, activeCompanies, totalUsers] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { isActive: true } }),
    prisma.user.count(),
  ]);

  const cards = [
    { label: "Total Companies", value: totalCompanies },
    { label: "Active Companies", value: activeCompanies },
    { label: "Total Users", value: totalUsers },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Super Admin Dashboard
        </h1>
        <p className="text-sm text-slate-600">
          Monitor global platform health and tenant growth.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
