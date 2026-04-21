"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type RawMaterialTypeInput = {
  rawMaterialId: string;
};

type UpdateWorkOrderRawMaterialInput = {
  rawMaterialId: string;
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function computeConsumptionKg(input: {
  unit: "KG" | "PIECE";
  totalProduced: number;
  weightPerPieceGrams: number | null;
}) {
  if (input.unit === "KG") return round2(input.totalProduced);
  if (!Number.isFinite(input.weightPerPieceGrams ?? Number.NaN)) {
    throw Object.assign(new Error("Weight per piece missing"), {
      code: "WEIGHT_PER_PIECE_REQUIRED",
    });
  }
  return round2(input.totalProduced * (input.weightPerPieceGrams as number) / 1000);
}

async function refreshWorkOrderStatus(
  workOrderId: string,
  forceComplete: boolean
) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      plannedQuantity: true,
      productionEntries: { select: { quantityProduced: true } },
      completedAt: true,
    },
  });

  if (!workOrder) return;

  const totalProduced = workOrder.productionEntries.reduce(
    (sum, entry) => sum + Number(entry.quantityProduced),
    0
  );
  const plannedQuantity = Number(workOrder.plannedQuantity);

  const shouldComplete = forceComplete || totalProduced >= plannedQuantity;

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: shouldComplete
      ? { status: "COMPLETED", completedAt: workOrder.completedAt ?? new Date() }
      : { status: "OPEN", completedAt: null },
  });
}

async function validateProductForWorkOrder(input: {
  finishedProductId: string;
  finishedProductVariantId: string | null;
  plannedQuantity: number;
}) {
  const finishedProduct = await prisma.finishedProduct.findFirst({
    where: { id: input.finishedProductId, isDeleted: false, isWaste: false },
    select: {
      id: true,
      unit: true,
      weightPerPiece: true,
      variants: {
        where: { isDeleted: false },
        select: { id: true, weightInGrams: true },
      },
    },
  });

  if (!finishedProduct) {
    throw Object.assign(new Error("Not found"), {
      code: "FINISHED_PRODUCT_NOT_FOUND",
    });
  }

  const hasVariants = finishedProduct.variants.length > 0;
  if (hasVariants && !input.finishedProductVariantId) {
    throw Object.assign(new Error("Variant required"), {
      code: "VARIANT_REQUIRED",
    });
  }
  if (!hasVariants && input.finishedProductVariantId) {
    throw Object.assign(new Error("Variant not allowed"), {
      code: "VARIANT_NOT_ALLOWED",
    });
  }

  const selectedVariant = input.finishedProductVariantId
    ? finishedProduct.variants.find((v) => v.id === input.finishedProductVariantId)
    : null;

  if (input.finishedProductVariantId && !selectedVariant) {
    throw Object.assign(new Error("Variant invalid"), {
      code: "VARIANT_INVALID",
    });
  }

  if (
    finishedProduct.unit === "PIECE" &&
    !Number.isInteger(input.plannedQuantity)
  ) {
    throw Object.assign(new Error("Invalid quantity"), {
      code: "PLANNED_INTEGER_REQUIRED",
    });
  }

  const weightPerPieceGrams = selectedVariant
    ? Number(selectedVariant.weightInGrams)
    : finishedProduct.weightPerPiece != null
      ? Number(finishedProduct.weightPerPiece)
      : null;

  if (finishedProduct.unit === "PIECE" && !Number.isFinite(weightPerPieceGrams ?? Number.NaN)) {
    throw Object.assign(new Error("Weight required"), {
      code: "WEIGHT_PER_PIECE_REQUIRED",
    });
  }

  return {
    id: finishedProduct.id,
    unit: finishedProduct.unit,
    weightPerPieceGrams,
  };
}

function validateRawMaterialTypes(rawMaterialsInput: RawMaterialTypeInput[]) {
  if (!rawMaterialsInput || rawMaterialsInput.length === 0) {
    throw Object.assign(new Error("At least one raw material is required."), {
      code: "RAW_MATERIALS_REQUIRED",
    });
  }

  const ids = rawMaterialsInput.map((rm) => rm.rawMaterialId?.trim()).filter(Boolean) as string[];
  if (ids.length !== rawMaterialsInput.length) {
    throw Object.assign(new Error("Raw material is required in all rows."), {
      code: "RAW_MATERIAL_REQUIRED",
    });
  }

  if (new Set(ids).size !== ids.length) {
    throw Object.assign(new Error("Duplicate raw materials are not allowed."), {
      code: "RAW_MATERIAL_DUPLICATE",
    });
  }

  return ids;
}

export async function getAllWorkOrders() {
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      finishedProduct: {
        select: { id: true, name: true, unit: true, weightPerPiece: true },
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
        select: { id: true, quantityProduced: true, entryDate: true },
      },
    },
  });

  return workOrders.map((wo) => {
    const totalProduced = wo.productionEntries.reduce(
      (sum, entry) => sum + Number(entry.quantityProduced),
      0
    );
    const variance = round2(totalProduced - Number(wo.plannedQuantity));

    const weightPerPieceGrams = wo.finishedProductVariant
      ? Number(wo.finishedProductVariant.weightInGrams)
      : wo.finishedProduct?.weightPerPiece != null
        ? Number(wo.finishedProduct.weightPerPiece)
        : null;

    const totalConsumptionKg = wo.finishedProduct
      ? computeConsumptionKg({
          unit: wo.finishedProduct.unit,
          totalProduced,
          weightPerPieceGrams,
        })
      : 0;

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
      })),
      totalProduced,
      variance,
      totalConsumptionKg,
    };
  });
}

export async function getWorkOrderById(id: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      finishedProduct: {
        select: { id: true, name: true, unit: true, weightPerPiece: true },
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
          createdAt: true,
        },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!workOrder) return null;

  const totalProduced = workOrder.productionEntries.reduce(
    (sum, entry) => sum + Number(entry.quantityProduced),
    0
  );
  const plannedQuantity = Number(workOrder.plannedQuantity);
  const variance = round2(totalProduced - plannedQuantity);

  const weightPerPieceGrams = workOrder.finishedProductVariant
    ? Number(workOrder.finishedProductVariant.weightInGrams)
    : workOrder.finishedProduct?.weightPerPiece != null
      ? Number(workOrder.finishedProduct.weightPerPiece)
      : null;

  const totalConsumptionKg = workOrder.finishedProduct
    ? computeConsumptionKg({
        unit: workOrder.finishedProduct.unit,
        totalProduced,
        weightPerPieceGrams,
      })
    : 0;

  return {
    id: workOrder.id,
    workOrderName: workOrder.workOrderName,
    plannedQuantity,
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
    })),
    productionEntries: workOrder.productionEntries.map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate,
      quantityProduced: Number(entry.quantityProduced),
      createdAt: entry.createdAt,
    })),
    totalProduced,
    variance,
    totalConsumptionKg,
  };
}

export async function createWorkOrder(formData: FormData) {
  const workOrderName = (formData.get("workOrderName") as string | null)?.trim() ?? "";
  const finishedProductId = (formData.get("finishedProductId") as string | null) ?? "";
  const finishedProductVariantId =
    (formData.get("finishedProductVariantId") as string | null)?.trim() || null;
  const plannedQuantity = parseNumber(formData.get("plannedQuantity"));
  const rawMaterialsInput = parseJsonArray<RawMaterialTypeInput>(
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
  if (!rawMaterialsInput) {
    return { error: "At least one raw material type is required." };
  }

  let rawMaterialIds: string[] = [];
  try {
    rawMaterialIds = validateRawMaterialTypes(rawMaterialsInput);
    const product = await validateProductForWorkOrder({
      finishedProductId,
      finishedProductVariantId,
      plannedQuantity,
    });

    const rawMaterials = await prisma.rawMaterial.findMany({
      where: { id: { in: rawMaterialIds } },
      select: { id: true },
    });
    if (rawMaterials.length !== rawMaterialIds.length) {
      return { error: "One or more raw materials are invalid." };
    }

    await prisma.workOrder.create({
      data: {
        workOrderName,
        finishedProductId: product.id,
        finishedProductVariantId,
        plannedQuantity,
        rawMaterials: {
          create: rawMaterialIds.map((rawMaterialId) => ({ rawMaterialId })),
        },
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "RAW_MATERIALS_REQUIRED"
    ) {
      return { error: "At least one raw material type is required." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "RAW_MATERIAL_DUPLICATE"
    ) {
      return { error: "Same raw material cannot be selected twice." };
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
      (error as { code: string }).code === "WEIGHT_PER_PIECE_REQUIRED"
    ) {
      return { error: "Weight per piece is required for piece-based products." };
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
  const entryDateRaw = (formData.get("entryDate") as string | null) ?? "";
  const entryDate = new Date(entryDateRaw);

  if (!Number.isFinite(quantityProduced) || quantityProduced <= 0) {
    return { error: "Production quantity must be greater than 0." };
  }
  if (!entryDateRaw || Number.isNaN(entryDate.getTime())) {
    return { error: "Entry date is required." };
  }
  if (entryDate.getTime() > Date.now()) {
    return { error: "Entry date cannot be in the future." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          finishedProduct: {
            select: { id: true, unit: true, quantityInStock: true, weightPerPiece: true },
          },
          finishedProductVariant: {
            select: { id: true, quantityInStock: true, weightInGrams: true },
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

      const weightPerPieceGrams = workOrder.finishedProductVariant
        ? Number(workOrder.finishedProductVariant.weightInGrams)
        : workOrder.finishedProduct.weightPerPiece != null
          ? Number(workOrder.finishedProduct.weightPerPiece)
          : null;

      if (workOrder.finishedProduct.unit === "PIECE") {
        if (!Number.isInteger(quantityProduced)) {
          throw Object.assign(new Error("Invalid integer"), {
            code: "PIECE_INTEGER_REQUIRED",
          });
        }
        if (!Number.isFinite(weightPerPieceGrams ?? Number.NaN)) {
          throw Object.assign(new Error("Missing weight"), {
            code: "WEIGHT_PER_PIECE_REQUIRED",
          });
        }
      }

      const productionEntry = await tx.productionEntry.create({
        data: {
          workOrderId,
          quantityProduced,
          entryDate,
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
          date: entryDate,
          finishedProductVariantId: workOrder.finishedProductVariant?.id ?? null,
        },
      });
    }, { timeout: 20000, maxWait: 10000 });

    await refreshWorkOrderStatus(workOrderId, false);
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
      (error as { code: string }).code === "PIECE_INTEGER_REQUIRED"
    ) {
      return { error: "Production quantity must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "WEIGHT_PER_PIECE_REQUIRED"
    ) {
      return { error: "Weight per piece is required for piece-based products." };
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
  const entryDateRaw = (formData.get("entryDate") as string | null) ?? "";
  const newEntryDate = new Date(entryDateRaw);

  if (!Number.isFinite(newQuantityProduced) || newQuantityProduced <= 0) {
    return { error: "Production quantity must be greater than 0." };
  }
  if (!entryDateRaw || Number.isNaN(newEntryDate.getTime())) {
    return { error: "Entry date is required." };
  }
  if (newEntryDate.getTime() > Date.now()) {
    return { error: "Entry date cannot be in the future." };
  }

  let workOrderIdForRevalidate: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const oldEntry = await tx.productionEntry.findUnique({
        where: { id: entryId },
        include: {
          workOrder: {
            include: {
              finishedProduct: {
                select: { id: true, unit: true, quantityInStock: true, weightPerPiece: true },
              },
              finishedProductVariant: {
                select: { id: true, quantityInStock: true, weightInGrams: true },
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

      if (oldEntry.workOrder.finishedProduct.unit === "PIECE") {
        if (!Number.isInteger(newQuantityProduced)) {
          throw Object.assign(new Error("Invalid integer"), {
            code: "PIECE_INTEGER_REQUIRED",
          });
        }
        const weightPerPieceGrams = oldEntry.workOrder.finishedProductVariant
          ? Number(oldEntry.workOrder.finishedProductVariant.weightInGrams)
          : oldEntry.workOrder.finishedProduct.weightPerPiece != null
            ? Number(oldEntry.workOrder.finishedProduct.weightPerPiece)
            : Number.NaN;
        if (!Number.isFinite(weightPerPieceGrams)) {
          throw Object.assign(new Error("Missing weight"), {
            code: "WEIGHT_PER_PIECE_REQUIRED",
          });
        }
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
          entryDate: newEntryDate,
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
            date: newEntryDate,
          },
        });
      }
    }, { timeout: 20000, maxWait: 10000 });

    if (workOrderIdForRevalidate) {
      await refreshWorkOrderStatus(workOrderIdForRevalidate, false);
    }
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
      return { error: "Production quantity must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "WEIGHT_PER_PIECE_REQUIRED"
    ) {
      return { error: "Weight per piece is required for piece-based products." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_FINISHED_STOCK"
    ) {
      return { error: "Cannot reduce entry below dispatch-adjusted stock." };
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
  const forceComplete = (formData.get("forceComplete") as string | null) === "1";

  if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
    return { error: "Planned quantity must be greater than 0." };
  }
  if (!rawMaterialsInput) {
    return { error: "At least one raw material type is required." };
  }

  try {
    const rawMaterialIds = validateRawMaterialTypes(
      rawMaterialsInput.map((rm) => ({ rawMaterialId: rm.rawMaterialId }))
    );

    await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: { id },
        include: {
          finishedProduct: {
            select: { id: true, unit: true, weightPerPiece: true },
          },
          finishedProductVariant: {
            select: { id: true, weightInGrams: true },
          },
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

      if (
        workOrder.finishedProduct.unit === "PIECE" &&
        !Number.isInteger(plannedQuantity)
      ) {
        throw Object.assign(new Error("Invalid integer"), {
          code: "PLANNED_INTEGER_REQUIRED",
        });
      }

      const weightPerPieceGrams = workOrder.finishedProductVariant
        ? Number(workOrder.finishedProductVariant.weightInGrams)
        : workOrder.finishedProduct.weightPerPiece != null
          ? Number(workOrder.finishedProduct.weightPerPiece)
          : null;

      if (workOrder.finishedProduct.unit === "PIECE" && !Number.isFinite(weightPerPieceGrams ?? Number.NaN)) {
        throw Object.assign(new Error("Missing weight"), {
          code: "WEIGHT_PER_PIECE_REQUIRED",
        });
      }

      const validRawMaterials = await tx.rawMaterial.findMany({
        where: { id: { in: rawMaterialIds } },
        select: { id: true },
      });
      if (validRawMaterials.length !== rawMaterialIds.length) {
        throw Object.assign(new Error("Invalid raw materials"), {
          code: "RAW_MATERIAL_NOT_FOUND",
        });
      }

      await tx.workOrder.update({
        where: { id },
        data: {
          plannedQuantity,
          rawMaterials: {
            deleteMany: {},
            create: rawMaterialIds.map((rawMaterialId) => ({ rawMaterialId })),
          },
        },
      });
    }, { timeout: 20000, maxWait: 10000 });

    await refreshWorkOrderStatus(id, forceComplete);
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
      (error as { code: string }).code === "PLANNED_INTEGER_REQUIRED"
    ) {
      return { error: "Planned quantity must be a whole number for pieces." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "WEIGHT_PER_PIECE_REQUIRED"
    ) {
      return { error: "Weight per piece is required for piece-based products." };
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
      (error as { code: string }).code === "RAW_MATERIALS_REQUIRED"
    ) {
      return { error: "At least one raw material type is required." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "RAW_MATERIAL_DUPLICATE"
    ) {
      return { error: "Same raw material cannot be selected twice." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "RAW_MATERIAL_NOT_FOUND"
    ) {
      return { error: "One or more raw materials are invalid." };
    }

    return { error: "Failed to update work order." };
  }

  revalidatePath(`/production/${id}`);
}
