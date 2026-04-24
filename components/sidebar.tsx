import { Factory } from "lucide-react";

import { getAuthSession } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";

export async function Sidebar() {
  const session = await getAuthSession();
  const email = session?.email ?? "";

  return (
    <aside className="hidden h-screen w-60 shrink-0 border-r bg-zinc-50 md:block">
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Factory className="size-4 text-foreground" />
            <span className="text-sm font-semibold tracking-tight">SME ERP</span>
          </div>
        </div>

        <SidebarNav />

        <div className="border-t px-2 py-2">
          <UserMenu email={email} />
        </div>
      </div>
    </aside>
  );
}
