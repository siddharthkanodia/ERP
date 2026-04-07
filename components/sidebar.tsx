"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Factory,
  PackageCheck,
  Users,
  ClipboardList,
  BarChart3,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Raw Materials",
    href: "/raw-materials",
    Icon: Database,
  },
  {
    label: "Finished Products",
    href: "/finished-products",
    Icon: PackageCheck,
  },
  {
    label: "Production",
    href: "/production",
    Icon: Factory,
  },
  {
    label: "Employees",
    href: "/employees",
    Icon: Users,
  },
  {
    label: "Attendance",
    href: "/attendance",
    Icon: ClipboardList,
  },
  {
    label: "Reports",
    href: "/reports",
    Icon: BarChart3,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-60 shrink-0 border-r bg-zinc-50 md:block">
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Factory className="size-4 text-foreground" />
            <span className="text-sm font-semibold tracking-tight">SME ERP</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-2">
          {navItems.map(({ label, href, Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-transparent px-2 py-2 text-sm text-zinc-700 transition-colors",
                  "hover:bg-white hover:text-foreground",
                  isActive && "border-border bg-white text-foreground"
                )}
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

