"use client";

import { createContext, useContext } from "react";

export type WorkOrderStatus = "OPEN" | "COMPLETED" | "CANCELLED";

export type CompletionSnapshot = {
  totalProduced: number;
  plannedQuantity: number;
};

export type WorkOrderContextValue = {
  workOrderId: string;
  status: WorkOrderStatus;
  isReadOnly: boolean;
  plannedQuantity: number;
  totalProduced: number;
  unit: "KG" | "PIECE";
  openCompletionModal: (snapshot?: CompletionSnapshot) => void;
};

export const WorkOrderContext = createContext<WorkOrderContextValue | null>(null);

export function useWorkOrder(): WorkOrderContextValue {
  const ctx = useContext(WorkOrderContext);
  if (!ctx) {
    throw new Error("useWorkOrder must be used inside <WorkOrderShell>.");
  }
  return ctx;
}
