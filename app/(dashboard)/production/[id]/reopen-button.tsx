"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { reopenWorkOrder } from "@/actions/production";

const outlinedButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60";

export function ReopenButton({
  workOrderId,
  workOrderName,
}: {
  workOrderId: string;
  workOrderName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await reopenWorkOrder(workOrderId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Work order reopened.");
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={outlinedButtonClass}
      >
        <RotateCcw className="mr-1.5 size-3.5" />
        Reopen
      </button>

      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-5 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Reopen work order?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {workOrderName}
            </Dialog.Description>
            <p className="mt-3 text-sm">
              This will set the status back to{" "}
              <span className="font-medium">OPEN</span> and clear the completion
              timestamp. You&apos;ll be able to edit details and add production
              entries again.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={outlinedButtonClass}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isPending}
                className={primaryButtonClass}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Reopening...
                  </>
                ) : (
                  "Reopen"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
