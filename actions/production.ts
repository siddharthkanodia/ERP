"use server";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type RawMaterialInput = {
  rawMaterialId: string;
  quantityIssued: number;
};

type UpdateWorkOrderRawMaterialInput = {
  id: string;
  quantityIssued: number;
};

function parseNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") return Number.NaN;
  return Number.parseFloat(value);
}

function parseJsonArray<T>(value: FormDataEntryValue | null): T[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

async function refreshWorkOrderStatus(
  workOrderId: string,
  tx: Prisma.TransactionClient
) {
  const workOrder = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      plannedQuantity: true,
      completedAt: true,
      productionEntries: { select: { quantityProduced: true } },
    },
  });

  if (!workOrder) return;

  const totalProduced = workOrder.productionEntries.reduce(
    (sum, entry) => sum + Number(entry.quantityProduced),
    0
  );
  const plannedQuantity = Number(workOrder.plannedQuantity);

  if (totalProduced >= plannedQuantity) {
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "COMPLETED",
        completedAt: workOrder.completedAt ?? new Date(),
      },
    });
  } else {
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "OPEN",
        completedAt: null,
      },
    });
  }
}

async function rebuildRawMaterialLedgerBalances(
  rawMaterialId: string,
  tx: Omit<PrismaClient, ITXClientDenyList>
) {
  const ledgers = await tx.rawMaterialLedger.findMany({
    where: { rawMaterialId },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  let runningBalance = 0;
  const updates = ledgers.map((ledger) => {
    const quantityIn = Number(ledger.quantityIn);
    const quantityOut = Number(ledger.quantityOut);
    const openingBalance = runningBalance;
    const closingBalance = openingBalance + quantityIn - quantityOut;
    runningBalance = closingBalance;

    return tx.rawMaterialLedger.update({
      where: { id: ledger.id },
      data: {
        openingBalance,
        closingBalance,
      },
    });
  });

  await Promise.all(updates);
}

async function rebuildFinishedProductLedgerBalances(
  finishedProductId: string,
  finishedProductVariantId: string | null,
  tx: Omit<PrismaClient, ITXClientDenyList>
) {
  const ledgers = await tx.finishedProductLedger.findMany({
    where: {
      finishedProductId,
      finishedProductVariantId: finishedProductVariantId ?? null,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  let runningBalance = 0;
  const updates = ledgers.map((ledger) => {
    const quantityProduced = Number(ledger.quantityProduced);
    const quantityDispatched = Number(ledger.quantityDispatched);
    const openingBalance = runningBalance;
    const closingBalance = openingBalance + quantityProduced - quantityDispatched;
    runningBalance = closingBalance;

    return tx.finishedProductLedger.update({
      where: { id: ledger.id },
      data: {
        openingBalance,
        closingBalance,
      },
    });
  });

  await Promise.all(updates);
}

export async function getAllWorkOrders() {
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      finishedProduct: {
        select: { id: true, name: true, unit: true },
      },
      finishedProductVariant: {
        select: { id: true, name: true, weightInGrams: true },
      },
      rawMaterials: {
        include: {
          rawMaterial: { select: { id: true, name: true } },
        },
      },
      productionEntries: {
        select: { id: true, quantityProduced: true },
      },
    },
  });

  return workOrders.map((wo) => {
    const totalProduced = wo.productionEntries.reduce(
      (sum, entry) => sum + Number(entry.quantityProduced),
      0
    );

    return {
      id: wo.id,
      workOrderName: wo.workOrderName,
      plannedQuantity: Number(wo.plannedQuantity),
      status: wo.status,
      createdAt: wo.createdAt,
      completedAt: wo.completedAt,
      finishedProductName: wo.finishedProduct?.name ?? "<Deleted Product>",
      finishedProductUnit: wo.finishedProduct?.unit ?? null,
      finishedProductVariantName: wo.finishedProductVariant?.name ?? null,
      finishedProduct: wo.finishedProduct
        ? {
            id: wo.finishedProduct.id,
            name: wo.finishedProduct.name,
            unit: wo.finishedProduct.unit,
          }
        : null,
      finishedProductVariant: wo.finishedProductVariant
        ? {
            id: wo.finishedProductVariant.id,
            name: wo.finishedProductVariant.name,
            weightInGrams: Number(wo.finishedProductVariant.weightInGrams),
          }
        : null,
      rawMaterials: wo.rawMaterials.map((rm) => ({
        id: rm.id,
        rawMaterialId: rm.rawMaterialId,
        name: rm.rawMaterial.name,
        quantityIssued: Number(rm.quantityIssued),
      })),
      totalProduced,
    };
  });
}

export async function getWorkOrderById(id: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      finishedProduct: {
        select: { id: true, name: true, unit: true },
      },
      finishedProductVariant: {
        select: { id: true, name: true, weightInGrams: true },
      },
      rawMaterials: {
        include: {
          rawMaterial: { select: { id: true, name: true } },
        },
      },
      productionEntries: {
        select: {
          id: true,
          entryDate: true,
          quantityProduced: true,
          wasteGenerated: true,
          createdAt: true,
        },
      },
    },
  });

  if (!workOrder) return null;

  const totalProduced = workOrder.productionEntries.reduce(
    (sum, entry) => sum + Number(entry.quantityProduced),
    0
  );

  return {
    id: workOrder.id,
    workOrderName: workOrder.workOrderName,
    plannedQuantity: Number(workOrder.plannedQuantity),
    status: workOrder.status,
    createdAt: workOrder.createdAt,
    completedAt: workOrder.completedAt,
    finishedProductName: workOrder.finishedProduct?.name ?? "<Deleted Product>",
    finishedProductUnit: workOrder.finishedProduct?.unit ?? null,
    finishedProductVariantName: workOrder.finishedProductVariant?.name ?? null,
    finishedProduct: workOrder.finishedProduct
      ? {
          id: workOrder.finishedProduct.id,
          name: workOrder.finishedProduct.name,
          unit: workOrder.finishedProduct.unit,
        }
      : null,
    finishedProductVariant: workOrder.finishedProductVariant
      ? {
          id: workOrder.finishedProductVariant.id,
          name: workOrder.finishedProductVariant.name,
          weightInGrams: Number(workOrder.finishedProductVariant.weightInGrams),
        }
      : null,
    rawMaterials: workOrder.rawMaterials.map((rm) => ({
      id: rm.id,
      rawMaterialId: rm.rawMaterialId,
      name: rm.rawMaterial.name,
      quantityIssued: Number(rm.quantityIssued),
    })),
    productionEntries: workOrder.productionEntries.map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate,
      quantityProduced: Number(entry.quantityProduced),
      wasteGenerated: Number(entry.wasteGenerated),
      createdAt: entry.createdAt,
    })),
    totalProduced,
  };
}

export async function createWorkOrder(formData: FormData) {
  const workOrderName = (formData.get("workOrderName") as string | null)?.trim() ?? "";
  const finishedProductId = (formData.get("finishedProductId") as string | null) ?? "";
  const finishedProductVariantId =
    (formData.get("finishedProductVariantId") as string | null)?.trim() || null;
  const plannedQuantity = parseNumber(formData.get("plannedQuantity"));
  const rawMaterialsInput = parseJsonArray<RawMaterialInput>(
    formData.get("rawMaterials")
  );

  if (!workOrderName) return { error: "Work order name is required." };
  if (workOrderName.length < 3) {
    return { error: "Work order name must be at least 3 characters." };
  }
  if (!finishedProductId) return { error: "Finished product is required." };
  if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
    return { error: "Planned quantity must be greater than 0." };
  }
  if (!rawMaterialsInput || rawMaterialsInput.length === 0) {
    return { error: "At least one raw material is required." };
  }

  for (const item of rawMaterialsInput) {
    if (!item.rawMaterialId) return { error: "Raw material is required." };
    if (!Number.isFinite(item.quantityIssued) || item.quantityIssued <= 0) {
      return { error: "Issued quantity must be greater than 0." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const finishedProduct = await tx.finishedProduct.findUnique({
        where: { id: finishedProductId },
        select: { unit: true, variants: { select: { id: true } } },
      });
      if (!finishedProduct) {
        throw Object.assign(new Error("Not found"), {
          code: "FINISHED_PRODUCT_NOT_FOUND",
        });
      }

      const hasVariants = finishedProduct.variants.length > 0;
      if (hasVariants && !finishedProductVariantId) {
        throw Object.assign(new Error("Variant required"), {
          code: "VARIANT_REQUIRED",
        });
      }
      if (!hasVariants && finishedProductVariantId) {
        throw Object.assign(new Error("Variant not allowed"), {
          code: "VARIANT_NOT_ALLOWED",
        });
      }
      if (
        hasVariants &&
        !finishedProduct.variants.some((v) => v.id === finishedProductVariantId)
      ) {
        throw Object.assign(new Error("Variant invalid"), {
          code: "VARIANT_INVALID",
        });
      }

      if (
        finishedProduct.unit === "PIECE" &&
        !Number.isInteger(plannedQuantity)
      ) {
        throw Object.assign(new Error("Invalid quantity"), {
          code: "PLANNED_INTEGER_REQUIRED",
        });
      }

      const materialIds = rawMaterialsInput.map((rm) => rm.rawMaterialId);
      const materials = await tx.rawMaterial.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, quantityInStock: true },
      });
      const materialMap = new Map(materials.map((m) => [m.id, m]));

      for (const item of rawMaterialsInput) {
        const material = materialMap.get(item.rawMaterialId);
        if (!material) {
          throw Object.assign(new Error("Raw material not found"), {
            code: "RAW_MATERIAL_NOT_FOUND",
          });
        }
        if (item.quantityIssued > Number(material.quantityInStock)) {
          throw Object.assign(new Error("Insufficient stock"), {
            code: "INSUFFICIENT_RAW_STOCK",
          });
        }
      }

      const workOrder = await tx.workOrder.create({
        data: {
          workOrderName,
          finishedProductId,
          finishedProductVariantId,
          plannedQuantity,
          rawMaterials: {
            create: rawMaterialsInput.map((rm) => ({
              rawMaterialId: rm.rawMaterialId,
              quantityIssued: rm.quantityIssued,
            })),
          },
        },
      });

      for (const item of rawMaterialsInput) {
        const current = await tx.rawMaterial.findUnique({
          where: { id: item.rawMaterialId },
          select: { quantityInStock: true },
        });
        if (!current) {
          throw Object.assign(new Error("Raw material not found"), {
            code: "RAW_MATERIAL_NOT_FOUND",
          });
        }

        const openingBalance = Number(current.quantityInStock);
        const closingBalance = openingBalance - item.quantityIssued;

        if (closingBalance < 0) {
          throw Object.assign(new Error("Insufficient stock"), {
            code: "INSUFFICIENT_RAW_STOCK",
          });
        }

        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: {
            quantityInStock: { decrement: item.quantityIssued },
          },
        });

        await tx.rawMaterialLedger.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            openingBalance,
            quantityIn: 0,
            quantityOut: item.quantityIssued,
            closingBalance,
            notes: `Issued to Work Order ${workOrder.workOrderName}`,
            workOrderId: workOrder.id,
          },
        });
      }
    }, { timeout: 20000, maxWait: 10000 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "PLANNED_INTEGER_REQUIRED"
    ) {
      return { error: "Planned quantity must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_RAW_STOCK"
    ) {
      return { error: "Issued quantity cannot exceed current raw material stock." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "FINISHED_PRODUCT_NOT_FOUND"
    ) {
      return { error: "Finished product not found." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "RAW_MATERIAL_NOT_FOUND"
    ) {
      return { error: "Raw material not found." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "VARIANT_REQUIRED"
    ) {
      return { error: "Variant is required for this finished product." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "VARIANT_NOT_ALLOWED"
    ) {
      return { error: "Variant must be empty for this finished product." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "VARIANT_INVALID"
    ) {
      return { error: "Selected variant does not belong to this finished product." };
    }
    return { error: "Failed to create work order." };
  }

  revalidatePath("/production");
  redirect("/production");
}

export async function addProductionEntry(workOrderId: string, formData: FormData) {
  const quantityProduced = parseNumber(formData.get("quantityProduced"));
  const wasteGenerated = parseNumber(formData.get("wasteGenerated") ?? "0");

  if (!Number.isFinite(quantityProduced) || quantityProduced <= 0) {
    return { error: "Quantity produced must be greater than 0." };
  }
  if (!Number.isFinite(wasteGenerated) || wasteGenerated < 0) {
    return { error: "Waste generated cannot be negative." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          finishedProduct: { select: { id: true, unit: true, quantityInStock: true } },
          finishedProductVariant: {
            select: { id: true, quantityInStock: true },
          },
        },
      });

      if (!workOrder) {
        throw Object.assign(new Error("Not found"), { code: "WORK_ORDER_NOT_FOUND" });
      }
      if (!workOrder.finishedProduct || !workOrder.finishedProductId) {
        throw Object.assign(new Error("Deleted product"), {
          code: "FINISHED_PRODUCT_DELETED",
        });
      }

      if (
        workOrder.finishedProduct.unit === "PIECE" &&
        !Number.isInteger(quantityProduced)
      ) {
        throw Object.assign(new Error("Invalid integer"), {
          code: "PIECE_INTEGER_REQUIRED",
        });
      }

      const productionEntry = await tx.productionEntry.create({
        data: {
          workOrderId,
          quantityProduced,
          wasteGenerated,
        },
      });

      const openingBalance = workOrder.finishedProductVariant
        ? Number(workOrder.finishedProductVariant.quantityInStock)
        : Number(workOrder.finishedProduct.quantityInStock);
      const closingBalance = openingBalance + quantityProduced;

      if (workOrder.finishedProductVariant) {
        await tx.finishedProductVariant.update({
          where: { id: workOrder.finishedProductVariant.id },
          data: {
            quantityInStock: { increment: quantityProduced },
          },
        });
      } else {
        await tx.finishedProduct.update({
          where: { id: workOrder.finishedProductId },
          data: {
            quantityInStock: { increment: quantityProduced },
          },
        });
      }

      await tx.finishedProductLedger.create({
        data: {
          finishedProductId: workOrder.finishedProductId,
          eventType: "PRODUCTION",
          openingBalance,
          quantityProduced,
          quantityDispatched: 0,
          closingBalance,
          notes: `Produced via Work Order ${workOrder.workOrderName}`,
          workOrderId,
          productionEntryId: productionEntry.id,
          finishedProductVariantId: workOrder.finishedProductVariant?.id ?? null,
        },
      });

      await refreshWorkOrderStatus(workOrderId, tx);
    }, { timeout: 20000, maxWait: 10000 });
  } catch (error: unknown) {
    console.error("updateWorkOrder error:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "WORK_ORDER_NOT_FOUND"
    ) {
      return { error: "Work order not found." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "PIECE_INTEGER_REQUIRED"
    ) {
      return { error: "Quantity produced must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "FINISHED_PRODUCT_DELETED"
    ) {
      return { error: "Finished product is deleted for this work order." };
    }
    return { error: "Failed to add production entry." };
  }

  revalidatePath(`/production/${workOrderId}`);
}

export async function updateProductionEntry(entryId: string, formData: FormData) {
  const newQuantityProduced = parseNumber(formData.get("quantityProduced"));
  const newWasteGenerated = parseNumber(formData.get("wasteGenerated") ?? "0");

  if (!Number.isFinite(newQuantityProduced) || newQuantityProduced <= 0) {
    return { error: "Quantity produced must be greater than 0." };
  }
  if (!Number.isFinite(newWasteGenerated) || newWasteGenerated < 0) {
    return { error: "Waste generated cannot be negative." };
  }

  let workOrderIdForRevalidate: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const oldEntry = await tx.productionEntry.findUnique({
        where: { id: entryId },
        include: {
          workOrder: {
            include: {
              finishedProduct: { select: { id: true, unit: true, quantityInStock: true } },
              finishedProductVariant: {
                select: { id: true, quantityInStock: true },
              },
            },
          },
        },
      });

      if (!oldEntry) {
        throw Object.assign(new Error("Not found"), { code: "ENTRY_NOT_FOUND" });
      }

      const workOrderId = oldEntry.workOrderId;
      workOrderIdForRevalidate = workOrderId;
      const finishedProductId = oldEntry.workOrder.finishedProductId;
      if (!oldEntry.workOrder.finishedProduct || !finishedProductId) {
        throw Object.assign(new Error("Deleted product"), {
          code: "FINISHED_PRODUCT_DELETED",
        });
      }
      const finishedProductVariantId =
        oldEntry.workOrder.finishedProductVariant?.id ?? null;

      if (
        oldEntry.workOrder.finishedProduct.unit === "PIECE" &&
        !Number.isInteger(newQuantityProduced)
      ) {
        throw Object.assign(new Error("Invalid integer"), {
          code: "PIECE_INTEGER_REQUIRED",
        });
      }

      const oldQuantityProduced = Number(oldEntry.quantityProduced);
      const delta = newQuantityProduced - oldQuantityProduced;

      const currentStock = oldEntry.workOrder.finishedProductVariant
        ? Number(oldEntry.workOrder.finishedProductVariant.quantityInStock)
        : Number(oldEntry.workOrder.finishedProduct.quantityInStock);
      if (currentStock + delta < 0) {
        throw Object.assign(new Error("Insufficient stock"), {
          code: "INSUFFICIENT_FINISHED_STOCK",
        });
      }

      await tx.productionEntry.update({
        where: { id: entryId },
        data: {
          quantityProduced: newQuantityProduced,
          wasteGenerated: newWasteGenerated,
        },
      });

      if (finishedProductVariantId) {
        await tx.finishedProductVariant.update({
          where: { id: finishedProductVariantId },
          data: {
            quantityInStock: { increment: delta },
          },
        });
      } else {
        await tx.finishedProduct.update({
          where: { id: finishedProductId },
          data: {
            quantityInStock: { increment: delta },
          },
        });
      }

      const linkedLedger = await tx.finishedProductLedger.findFirst({
        where: {
          finishedProductId,
          finishedProductVariantId,
          productionEntryId: entryId,
        },
      });

      if (linkedLedger) {
        await tx.finishedProductLedger.update({
          where: { id: linkedLedger.id },
          data: {
            quantityProduced: newQuantityProduced,
          },
        });
      }

      await rebuildFinishedProductLedgerBalances(
        finishedProductId,
        finishedProductVariantId,
        tx
      );
      await refreshWorkOrderStatus(workOrderId, tx);
    }, { timeout: 20000, maxWait: 10000 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "ENTRY_NOT_FOUND"
    ) {
      return { error: "Production entry not found." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "PIECE_INTEGER_REQUIRED"
    ) {
      return { error: "Quantity produced must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_FINISHED_STOCK"
    ) {
      return { error: "Cannot reduce entry below dispatched stock-adjusted balance." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "FINISHED_PRODUCT_DELETED"
    ) {
      return { error: "Finished product is deleted for this work order." };
    }
    return { error: "Failed to update production entry." };
  }

  if (workOrderIdForRevalidate) {
    revalidatePath(`/production/${workOrderIdForRevalidate}`);
  }
}

export async function updateWorkOrder(id: string, formData: FormData) {
  const plannedQuantity = parseNumber(formData.get("plannedQuantity"));
  const rawMaterialsInput = parseJsonArray<UpdateWorkOrderRawMaterialInput>(
    formData.get("rawMaterials")
  );

  if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
    return { error: "Planned quantity must be greater than 0." };
  }
  if (!rawMaterialsInput || rawMaterialsInput.length === 0) {
    return { error: "At least one raw material row is required." };
  }
  for (const item of rawMaterialsInput) {
    if (!item.id) return { error: "Raw material row id is required." };
    if (!Number.isFinite(item.quantityIssued) || item.quantityIssued <= 0) {
      return { error: "Issued quantity must be greater than 0." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: { id },
        include: {
          finishedProduct: { select: { unit: true } },
          rawMaterials: true,
          productionEntries: { select: { quantityProduced: true } },
        },
      });

      if (!workOrder) {
        throw Object.assign(new Error("Not found"), { code: "WORK_ORDER_NOT_FOUND" });
      }
      if (!workOrder.finishedProduct) {
        throw Object.assign(new Error("Deleted product"), {
          code: "FINISHED_PRODUCT_DELETED",
        });
      }

      const totalProduced = workOrder.productionEntries.reduce(
        (sum, entry) => sum + Number(entry.quantityProduced),
        0
      );
      if (plannedQuantity < totalProduced) {
        throw Object.assign(new Error("Planned too low"), {
          code: "PLANNED_LESS_THAN_PRODUCED",
        });
      }
      if (
        workOrder.finishedProduct.unit === "PIECE" &&
        !Number.isInteger(plannedQuantity)
      ) {
        throw Object.assign(new Error("Invalid integer"), {
          code: "PLANNED_INTEGER_REQUIRED",
        });
      }

      await tx.workOrder.update({
        where: { id },
        data: { plannedQuantity },
      });

      const existingById = new Map(workOrder.rawMaterials.map((rm) => [rm.id, rm]));
      const affectedRawMaterialIds = new Set<string>();

      for (const item of rawMaterialsInput) {
        const existing = existingById.get(item.id);
        if (!existing) {
          throw Object.assign(new Error("Invalid row"), {
            code: "WORK_ORDER_RM_NOT_FOUND",
          });
        }

        const oldQty = Number(existing.quantityIssued);
        const newQty = item.quantityIssued;
        const diff = newQty - oldQty;

        if (diff === 0) continue;

        const rawMaterial = await tx.rawMaterial.findUnique({
          where: { id: existing.rawMaterialId },
          select: { quantityInStock: true },
        });
        if (!rawMaterial) {
          throw Object.assign(new Error("Raw material missing"), {
            code: "RAW_MATERIAL_NOT_FOUND",
          });
        }

        const openingBalance = Number(rawMaterial.quantityInStock);

        if (diff > 0) {
          if (diff > openingBalance) {
            throw Object.assign(new Error("Insufficient stock"), {
              code: "INSUFFICIENT_RAW_STOCK",
            });
          }

          const closingBalance = openingBalance - diff;

          await tx.rawMaterial.update({
            where: { id: existing.rawMaterialId },
            data: { quantityInStock: { decrement: diff } },
          });

          await tx.rawMaterialLedger.create({
            data: {
              rawMaterialId: existing.rawMaterialId,
              openingBalance,
              quantityIn: 0,
              quantityOut: diff,
              closingBalance,
              notes: `Additional issue to Work Order ${workOrder.workOrderName}`,
              workOrderId: id,
            },
          });
        } else {
          const returned = Math.abs(diff);
          const closingBalance = openingBalance + returned;

          await tx.rawMaterial.update({
            where: { id: existing.rawMaterialId },
            data: { quantityInStock: { increment: returned } },
          });

          await tx.rawMaterialLedger.create({
            data: {
              rawMaterialId: existing.rawMaterialId,
              openingBalance,
              quantityIn: returned,
              quantityOut: 0,
              closingBalance,
              notes: `Returned from Work Order ${workOrder.workOrderName}`,
              workOrderId: id,
            },
          });
        }

        await tx.workOrderRawMaterial.update({
          where: { id: existing.id },
          data: { quantityIssued: newQty },
        });

        affectedRawMaterialIds.add(existing.rawMaterialId);
      }

      for (const rawMaterialId of affectedRawMaterialIds) {
        await rebuildRawMaterialLedgerBalances(rawMaterialId, tx);
      }

      await refreshWorkOrderStatus(id, tx);
    }, { timeout: 20000, maxWait: 10000 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "WORK_ORDER_NOT_FOUND"
    ) {
      return { error: "Work order not found." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "PLANNED_LESS_THAN_PRODUCED"
    ) {
      return { error: "Planned quantity cannot be less than total produced." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "PLANNED_INTEGER_REQUIRED"
    ) {
      return { error: "Planned quantity must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "FINISHED_PRODUCT_DELETED"
    ) {
      return { error: "Finished product is deleted for this work order." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "WORK_ORDER_RM_NOT_FOUND"
    ) {
      return { error: "Invalid work order raw material row." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "RAW_MATERIAL_NOT_FOUND"
    ) {
      return { error: "Raw material not found." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_RAW_STOCK"
    ) {
      return { error: "Issued quantity cannot exceed current stock." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2021"
    ) {
      return {
        error:
          "Database table is missing. Please run the latest Prisma migration.",
      };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2022"
    ) {
      return {
        error:
          "Database column is missing. Please run the latest Prisma migration.",
      };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return { error: (error as { message: string }).message };
    }
    return { error: "Failed to update work order due to an unknown error." };
  }

  revalidatePath(`/production/${id}`);
}

