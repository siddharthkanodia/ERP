import { Factory } from "lucide-react";

import { stopImpersonating } from "@/actions/super-admin";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";

export async function Sidebar() {
  const session = await getAuthSession();
  const email = session?.email ?? "";
  const role = session?.role ?? "OPERATOR";
  const impersonatedCompanyId = session?.impersonatedCompanyId ?? null;
  const impersonatedCompany =
    impersonatedCompanyId
      ? await prisma.company.findUnique({
          where: { id: impersonatedCompanyId },
          select: { name: true },
        })
      : null;

  return (
    <aside className="h-screen w-60 shrink-0 border-r bg-zinc-50">
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Factory className="size-4 text-foreground" />
            <span className="text-sm font-semibold tracking-tight">SME ERP</span>
          </div>
        </div>

        <SidebarNav role={role} />

        <div className="border-t px-2 py-2">
          {impersonatedCompany ? (
            <div className="mb-2 rounded-md border border-yellow-300 bg-yellow-50 p-2">
              <p className="text-xs font-medium text-yellow-800">
                Viewing as {impersonatedCompany.name}
              </p>
              <form action={stopImpersonating} className="mt-2">
                <button
                  type="submit"
                  className="w-full rounded-md border border-yellow-300 bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-900 transition-colors hover:bg-yellow-200"
                >
                  Exit to Super Admin
                </button>
              </form>
            </div>
          ) : null}
          <UserMenu email={email} />
        </div>
      </div>
    </aside>
  );
}
