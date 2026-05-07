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
  Settings,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "OPERATOR";

type NavItem = {
  label: string;
  href: string;
  Icon: LucideIcon;
  allowedRoles: SidebarRole[];
  children?: { label: string; href: string; allowedRoles: SidebarRole[] }[];
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    Icon: LayoutDashboard,
    allowedRoles: ["ADMIN", "MANAGER", "OPERATOR"],
  },
  {
    label: "Raw Materials",
    href: "/raw-materials",
    Icon: Database,
    allowedRoles: ["ADMIN", "MANAGER", "OPERATOR"],
  },
  {
    label: "Production Floor",
    href: "/production-floor",
    Icon: Boxes,
    allowedRoles: ["ADMIN", "MANAGER", "OPERATOR"],
  },
  {
    label: "Work Orders",
    href: "/production",
    Icon: Factory,
    allowedRoles: ["ADMIN", "MANAGER", "OPERATOR"],
  },
  {
    label: "Finished Goods",
    href: "/finished-products",
    Icon: PackageCheck,
    allowedRoles: ["ADMIN", "MANAGER"],
    children: [
      {
        label: "Waste",
        href: "/finished-products/waste",
        allowedRoles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    label: "Employees",
    href: "/employees",
    Icon: Users,
    allowedRoles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Attendance",
    href: "/attendance",
    Icon: ClipboardList,
    allowedRoles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Reports",
    href: "/reports",
    Icon: BarChart3,
    allowedRoles: ["ADMIN"],
  },
  {
    label: "Settings",
    href: "/settings/users",
    Icon: Settings,
    allowedRoles: ["ADMIN"],
  },
];

function isAllowed(role: SidebarRole, allowedRoles: SidebarRole[]) {
  if (role === "SUPER_ADMIN") return true;
  return allowedRoles.includes(role);
}

export function SidebarNav({ role = "OPERATOR" }: { role?: SidebarRole }) {
  const pathname = usePathname();
  const items = navItems
    .filter((item) => isAllowed(role, item.allowedRoles))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => isAllowed(role, child.allowedRoles)),
    }));

  return (
    <nav className="flex-1 space-y-1 px-2 py-2">
      {items.map(({ label, href, Icon, children }) => {
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
