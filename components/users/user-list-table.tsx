"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { MoreHorizontal } from "lucide-react";

import { toggleUserStatus, updateUserRole } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "OPERATOR";
  isActive: boolean;
  createdAt: Date;
};

function roleBadgeClass(role: UserRow["role"]) {
  if (role === "ADMIN") return "bg-blue-100 text-blue-700";
  if (role === "MANAGER") return "bg-violet-100 text-violet-700";
  if (role === "OPERATOR") return "bg-zinc-100 text-zinc-700";
  return "bg-amber-100 text-amber-700";
}

export function UserListTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refreshAfter(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <div className="rounded-md border bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">No users found for this company.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Joined</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-muted/30">
              <td className="px-4 py-3">{user.name}</td>
              <td className="px-4 py-3">{user.email}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    roleBadgeClass(user.role)
                  )}
                >
                  {user.role}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    user.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  )}
                >
                  {user.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-3">
                {new Date(user.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3 text-right">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="outline" size="sm" disabled={isPending}>
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Open actions</span>
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      sideOffset={6}
                      align="end"
                      className="z-50 min-w-44 rounded-md border bg-card p-1 shadow-md"
                    >
                      <DropdownMenu.Item
                        className="cursor-pointer rounded-sm px-2 py-2 outline-none hover:bg-muted focus:bg-muted"
                        onSelect={() =>
                          refreshAfter(async () => toggleUserStatus(user.id, !user.isActive))
                        }
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="my-1 h-px bg-border" />
                      <DropdownMenu.Item
                        className="cursor-pointer rounded-sm px-2 py-2 outline-none hover:bg-muted focus:bg-muted"
                        onSelect={() => refreshAfter(async () => updateUserRole(user.id, "ADMIN"))}
                      >
                        Change role to ADMIN
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="cursor-pointer rounded-sm px-2 py-2 outline-none hover:bg-muted focus:bg-muted"
                        onSelect={() =>
                          refreshAfter(async () => updateUserRole(user.id, "MANAGER"))
                        }
                      >
                        Change role to MANAGER
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="cursor-pointer rounded-sm px-2 py-2 outline-none hover:bg-muted focus:bg-muted"
                        onSelect={() =>
                          refreshAfter(async () => updateUserRole(user.id, "OPERATOR"))
                        }
                      >
                        Change role to OPERATOR
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
