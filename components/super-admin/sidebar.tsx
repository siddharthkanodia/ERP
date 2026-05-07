"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/super-admin/dashboard", Icon: LayoutDashboard },
  { label: "Companies", href: "/super-admin/companies", Icon: Building2 },
  { label: "Super Admins", href: "/super-admin/super-admins", Icon: ShieldCheck },
];

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-slate-100 md:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold tracking-tight text-slate-900">Super Admin</p>
          <p className="text-xs text-slate-500">Control center</p>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-2">
          {navItems.map(({ label, href, Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-transparent px-2 py-2 text-sm text-slate-700 transition-colors",
                  "hover:bg-white hover:text-slate-950",
                  isActive && "border-slate-200 bg-white text-slate-950"
                )}
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-2 py-2">
          <form action="/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-white hover:text-slate-950"
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
