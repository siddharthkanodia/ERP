"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  checkActiveWorkOrders,
  deleteFinishedProduct,
} from "@/actions/finished-products";

type Props = {
  productId: string;
  productName: string;
  aggregateStock: number;
  unit: string;
};

export function DeleteProductButton({
  productId,
  productName,
  aggregateStock,
  unit,
}: Props) {
  const router = useRouter();
  const [isCheckingWorkOrders, setIsCheckingWorkOrders] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [blockingWorkOrders, setBlockingWorkOrders] = useState<
    { id: string; workOrderName: string }[]
  >([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onClickDelete() {
    setErrorMessage(null);
    setIsCheckingWorkOrders(true);
    const active = await checkActiveWorkOrders(productId);
    setIsCheckingWorkOrders(false);

    if (active.length > 0) {
      setBlockingWorkOrders(active);
      setShowBlockedModal(true);
      return;
    }

    setShowConfirmModal(true);
  }

  async function onConfirmDelete() {
    setErrorMessage(null);
    setIsDeleting(true);
    const result = await deleteFinishedProduct(productId);
    setIsDeleting(false);

    if (result && "success" in result && result.success) {
      setShowConfirmModal(false);
      router.push("/finished-products");
      router.refresh();
      return;
    }

    setErrorMessage(
      (result && "message" in result && typeof result.message === "string"
        ? result.message
        : null) ?? "Failed to delete product."
    );
  }

  return (
    <>
      <button
        type="button"
        title="Delete Product"
        onClick={onClickDelete}
        className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-red-500 transition-colors hover:bg-muted hover:text-red-700"
      >
        {isCheckingWorkOrders ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </button>

      <Dialog.Root open={showBlockedModal} onOpenChange={setShowBlockedModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Cannot Delete Product
            </Dialog.Title>
            <p className="mt-2 text-sm text-muted-foreground">
              The following active work orders must be completed or deleted first:
            </p>
            <ul className="mt-3 space-y-1 rounded-md border bg-background p-3 text-sm">
              {blockingWorkOrders.map((wo) => (
                <li key={wo.id}>{wo.workOrderName || "Untitled Work Order"}</li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBlockedModal(false)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Delete {productName}?
            </Dialog.Title>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>This action is permanent and cannot be undone.</p>
              <p>• All variants will be archived.</p>
              <p>• All stock data and ledger history will be deleted.</p>
              <p>
                • Completed work orders will show this product as {"<Deleted Product>"}.
              </p>
              <p className="pt-1">
                Current stock: {aggregateStock} {unit}
              </p>
            </div>
            {errorMessage ? (
              <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={isDeleting}
                className="inline-flex h-8 items-center justify-center rounded-md border border-red-700 bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete Product"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
