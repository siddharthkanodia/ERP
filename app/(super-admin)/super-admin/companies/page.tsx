import Link from "next/link";
import { redirect } from "next/navigation";

import { getCompanies, impersonateCompany } from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { getAuthSession } from "@/lib/auth";

export default async function SuperAdminCompaniesPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const companies = await getCompanies();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Companies</h1>
          <p className="text-sm text-slate-600">
            Manage tenant companies and access into each organization.
          </p>
        </div>
        <Button asChild>
          <Link href="/super-admin/companies/new">+ New Company</Link>
        </Button>
      </header>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Users Count</th>
              <th className="px-4 py-3 font-medium">Active Status</th>
              <th className="px-4 py-3 font-medium">Created At</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3">{company.name}</td>
                  <td className="px-4 py-3">{company.industry || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{company._count.users}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        company.isActive
                          ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          : "inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                      }
                    >
                      {company.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(company.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/super-admin/companies/${company.id}/edit`}>Edit</Link>
                      </Button>
                      <form action={impersonateCompany.bind(null, company.companyId)}>
                        <Button type="submit" size="sm">
                          Enter
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
