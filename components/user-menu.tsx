"use client";

import Link from "next/link";
import { useRef } from "react";
import { DropdownMenu } from "radix-ui";
import { KeyRound, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";

type UserMenuProps = {
  email: string;
};

function getInitial(email: string) {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return "?";
  return trimmed[0]!.toUpperCase();
}

export function UserMenu({ email }: UserMenuProps) {
  const initial = getInitial(email);
  const displayEmail = email || "Signed in";
  const logoutFormRef = useRef<HTMLFormElement>(null);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm text-zinc-700 transition-colors",
            "hover:bg-white hover:text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "data-[state=open]:border-border data-[state=open]:bg-white data-[state=open]:text-foreground"
          )}
          aria-label="Open user menu"
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-zinc-50"
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate" title={displayEmail}>
            {displayEmail}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className={cn(
            "z-50 min-w-56 overflow-hidden rounded-md border bg-white p-1 text-sm text-zinc-700 shadow-md",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          )}
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted-foreground">
            <span className="block truncate" title={displayEmail}>
              {displayEmail}
            </span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item asChild>
            <Link
              href="/account/change-password"
              className={cn(
                "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 outline-none",
                "hover:bg-zinc-100 focus:bg-zinc-100"
              )}
            >
              <KeyRound className="size-4" />
              <span>Change Password</span>
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            onSelect={(event) => {
              event.preventDefault();
              logoutFormRef.current?.submit();
            }}
            className={cn(
              "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 outline-none",
              "hover:bg-zinc-100 focus:bg-zinc-100"
            )}
          >
            <LogOut className="size-4" />
            <span>Logout</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>

      <form
        ref={logoutFormRef}
        action="/auth/logout"
        method="POST"
        className="hidden"
        aria-hidden
      />
    </DropdownMenu.Root>
  );
}
