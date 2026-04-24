"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { completeWorkOrder } from "@/actions/production";

import {
  WorkOrderContext,
  useWorkOrder,
  type CompletionSnapshot,
  type WorkOrderContextValue,
  type WorkOrderStatus,
} from "./work-order-context";

const primaryButtonClass =
  "h-9 inline-flex items-center justify-center rounded-md border border-black bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60";
const outlinedButtonClass =
  "h-9 inline-flex items-center justify-center rounded-md border border-black bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClass =
  "h-9 inline-flex items-center justify-center rounded-md border border-red-700 bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

type ShellProps = {
  workOrderId: string;
  workOrderName: string;
  status: WorkOrderStatus;
  plannedQuantity: number;
  totalProduced: number;
  unit: "KG" | "PIECE";
  editFormId: string;
  children: React.ReactNode;
};

export function WorkOrderShell({
  workOrderId,
  workOrderName,
  status,
  plannedQuantity,
  totalProduced,
  unit,
  editFormId,
  children,
}: ShellProps) {
  const router = useRouter();
  const [isCompleting, startTransition] = useTransition();
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalSnapshot, setModalSnapshot] =
    useState<CompletionSnapshot | null>(null);

  const unitLabel = unit === "PIECE" ? "pcs" : "kg";
  const isReadOnly = status === "COMPLETED";
  const variance = Math.round((totalProduced - plannedQuantity) * 100) / 100;
  const hasNegativeVariance = variance < 0;

  const openCompletionModal = useCallback((snapshot?: CompletionSnapshot) => {
    setModalSnapshot(snapshot ?? null);
    setModalOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setModalSnapshot(null);
    }
  }, []);

  const ctxValue = useMemo<WorkOrderContextValue>(
    () => ({
      workOrderId,
      status,
      isReadOnly,
      plannedQuantity,
      totalProduced,
      unit,
      openCompletionModal,
    }),
    [
      isReadOnly,
      openCompletionModal,
      plannedQuantity,
      status,
      totalProduced,
      unit,
      workOrderId,
    ]
  );

  const modalPlanned = modalSnapshot?.plannedQuantity ?? plannedQuantity;
  const modalTotal = modalSnapshot?.totalProduced ?? totalProduced;
  const modalVariance = Math.round((modalTotal - modalPlanned) * 100) / 100;
  const modalHasNegativeVariance = modalVariance < 0;

  function onMarkCompleteClick() {
    if (totalProduced <= 0) {
      toast.error("Cannot complete a work order with 0 production.");
      return;
    }
    setModalSnapshot({ totalProduced, plannedQuantity });
    setModalOpen(true);
  }

  function onConfirmComplete() {
    startTransition(async () => {
      const result = await completeWorkOrder(workOrderId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Work order marked as complete.");
      setModalOpen(false);
      setModalSnapshot(null);
      router.refresh();
    });
  }

  return (
    <WorkOrderContext.Provider value={ctxValue}>
      <section className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 pb-24 pt-6 sm:px-6">
        {children}
      </section>

      <div className="sticky bottom-0 z-30 w-full border-t bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/production" className={outlinedButtonClass}>
            Exit
          </Link>
          {!isReadOnly ? (
            <div className="flex items-center gap-2">
              <button
                type="submit"
                form={editFormId}
                className={outlinedButtonClass}
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={onMarkCompleteClick}
                className={primaryButtonClass}
              >
                {hasNegativeVariance ? (
                  <AlertTriangle className="mr-1.5 size-4 text-red-400" />
                ) : (
                  <CheckCircle2 className="mr-1.5 size-4 text-emerald-300" />
                )}
                Mark as Complete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog.Root open={isModalOpen} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-5 shadow-lg">
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              {modalHasNegativeVariance ? (
                <AlertTriangle className="size-5 text-red-600" />
              ) : (
                <CheckCircle2 className="size-5 text-emerald-600" />
              )}
              {modalHasNegativeVariance
                ? "Complete with negative variance?"
                : "Mark work order as complete?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {workOrderName}
            </Dialog.Description>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-md border bg-background p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Planned</p>
                <p className="font-medium tabular-nums">
                  {modalPlanned} {unitLabel}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="font-medium tabular-nums">
                  {modalTotal} {unitLabel}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Variance</p>
                <p
                  className={`font-medium tabular-nums ${
                    modalHasNegativeVariance ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {modalVariance} {unitLabel}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-1 text-sm">
              {modalHasNegativeVariance ? (
                <>
                  <p>
                    Actual production is{" "}
                    <span className="font-medium text-red-600">
                      less than planned
                    </span>
                    . Completing now will close this work order with a negative
                    variance of{" "}
                    <span className="font-medium">
                      {modalVariance} {unitLabel}
                    </span>
                    .
                  </p>
                  <p className="text-muted-foreground">
                    You can continue adding production entries instead, or
                    confirm to close the work order as-is.
                  </p>
                </>
              ) : (
                <p>
                  You&apos;re about to mark this work order as complete. After
                  completion, entries cannot be edited unless an admin reopens
                  the work order.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className={outlinedButtonClass}
                disabled={isCompleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmComplete}
                disabled={isCompleting}
                className={
                  modalHasNegativeVariance ? dangerButtonClass : primaryButtonClass
                }
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Completing...
                  </>
                ) : modalHasNegativeVariance ? (
                  "Complete anyway"
                ) : (
                  "Confirm Complete"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </WorkOrderContext.Provider>
  );
}

export function WorkOrderReadyBanner() {
  const { status, totalProduced, plannedQuantity } = useWorkOrder();
  if (status !== "OPEN" || totalProduced < plannedQuantity) return null;
  return (
    <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <Info className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-medium">Planned quantity reached.</span>{" "}
        Work order ready to be completed.
      </p>
    </div>
  );
}
