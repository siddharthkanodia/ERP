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
  Boxes,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  Icon: LucideIcon;
  children?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    Icon: LayoutDashboard,
  },
  {
    label: "Raw Materials",
    href: "/raw-materials",
    Icon: Database,
  },
  {
    label: "Production Floor",
    href: "/production-floor",
    Icon: Boxes,
  },
  {
    label: "Work Orders",
    href: "/production",
    Icon: Factory,
  },
  {
    label: "Finished Goods",
    href: "/finished-products",
    Icon: PackageCheck,
    children: [{ label: "Waste", href: "/finished-products/waste" }],
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

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-2 py-2">
      {navItems.map(({ label, href, Icon, children }) => {
        const isActive =
          pathname === href || pathname.startsWith(`${href}/`);

        return (
          <div key={href} className="space-y-1">
            <Link
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
            {children?.length ? (
              <div className="ml-6 space-y-1">
                {children.map((child) => {
                  const isChildActive =
                    pathname === child.href ||
                    pathname.startsWith(`${child.href}/`);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "block rounded-md border border-transparent px-2 py-1.5 text-sm text-zinc-700 transition-colors",
                        "hover:bg-white hover:text-foreground",
                        isChildActive && "border-border bg-white text-foreground"
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
