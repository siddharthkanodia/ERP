"use client";

import { useState, useTransition } from "react";
import { Dialog, Select } from "radix-ui";
import { Check, ChevronDown, Plus } from "lucide-react";

import { createUser } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "OPERATOR">("OPERATOR");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setName("");
    setEmail("");
    setRole("OPERATOR");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createUser({ name, email, role });
      if (!result.success) {
        setError(result.error);
        return;
      }

      resetForm();
      setOpen(false);
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <Dialog.Trigger asChild>
        <Button className="h-9 px-4">
          <Plus className="mr-2 size-4" />
          Invite
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-5 shadow-lg">
          <Dialog.Title className="text-base font-semibold">Invite User</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            New staff users get a default password: Welcome123!
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. John Doe"
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select.Root value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <Select.Trigger
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50",
                    "focus-visible:ring-2 data-placeholder:text-muted-foreground"
                  )}
                >
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </Select.Icon>
                </Select.Trigger>

                <Select.Portal>
                  <Select.Content
                    position="popper"
                    className="z-50 min-w-(--radix-select-trigger-width) rounded-md border bg-popover shadow-md"
                  >
                    <Select.Viewport className="p-1">
                      {(["ADMIN", "MANAGER", "OPERATOR"] as const).map((option) => (
                        <Select.Item
                          key={option}
                          value={option}
                          className="relative flex cursor-default items-center rounded-sm py-2 pr-8 pl-2 text-sm outline-none select-none hover:bg-muted data-highlighted:bg-muted"
                        >
                          <Select.ItemText>{option}</Select.ItemText>
                          <Select.ItemIndicator className="absolute right-2 inline-flex items-center">
                            <Check className="size-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Inviting..." : "Invite User"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
