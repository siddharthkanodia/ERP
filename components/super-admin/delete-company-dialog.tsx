"use client";

import { useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { Loader2 } from "lucide-react";

import { deleteCompany } from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeleteCompanyDialog({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteCompany(companyId);
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
        setError("Failed to delete company. Please try again.");
      }
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setConfirmText("");
          setError(null);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="destructive">Delete Company</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-white p-5 shadow-lg">
          <Dialog.Title className="text-base font-semibold text-slate-900">
            Are you absolutely sure?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-600">
            This will permanently delete {companyName} and ALL associated data including
            users, inventory, work orders, production records, and audit logs. Type DELETE
            to confirm.
          </Dialog.Description>

          <div className="mt-4 space-y-2">
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder='Type "DELETE"'
              disabled={isPending}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={confirmText !== "DELETE" || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Permanently Delete
                </>
              ) : (
                "Permanently Delete"
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
