import { redirect } from "next/navigation";

import { getSuperAdmins } from "@/actions/super-admin";
import { CreateSuperAdminDialog } from "@/components/super-admin/create-super-admin-dialog";
import { getAuthSession } from "@/lib/auth";

export default async function SuperAdminUsersPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const superAdmins = await getSuperAdmins();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Super Admins</h1>
          <p className="text-sm text-slate-600">
            Manage global administrator accounts for the platform.
          </p>
        </div>
        <CreateSuperAdminDialog />
      </header>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Joined At</th>
            </tr>
          </thead>
          <tbody>
            {superAdmins.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  No super admins found.
                </td>
              </tr>
            ) : (
              superAdmins.map((user) => (
                <tr key={user.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    {new Date(user.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
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
