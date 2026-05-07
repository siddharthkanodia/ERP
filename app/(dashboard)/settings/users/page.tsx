import { redirect } from "next/navigation";

import { getUsers } from "@/actions/users";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import { UserListTable } from "@/components/users/user-list-table";
import { getAuthSession } from "@/lib/auth";

export default async function UsersSettingsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.companyId || session.role !== "ADMIN") redirect("/dashboard");

  const users = await getUsers();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage staff access, roles, and account status.
          </p>
        </div>
        <InviteUserDialog />
      </header>

      <UserListTable users={users} />
    </section>
  );
}
