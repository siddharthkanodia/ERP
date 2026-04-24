"use server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKgWeight } from "@/lib/production-utils";
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
  weightPerPieceKg: number | null;
}) {
  if (input.unit === "PIECE" && !Number.isFinite(input.weightPerPieceKg ?? Number.NaN)) {
    throw Object.assign(new Error("Weight per piece missing"), {
      code: "WEIGHT_PER_PIECE_REQUIRED",
    });
  }
  return round2(
    calculateKgWeight(input.totalProduced, input.unit, input.weightPerPieceKg ?? 0)
  );
}

async function readWorkOrderCompletionState(
  workOrderId: string,
  companyId: string
) {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: {
      status: true,
      plannedQuantity: true,
      productionEntries: { select: { quantityProduced: true } },
    },
  });
  if (!wo) return null;
  const updatedTotalProduced = round2(
    wo.productionEntries.reduce(
      (sum, entry) => sum + Number(entry.quantityProduced),
      0
    )
  );
  return {
    status: wo.status,
    plannedQuantity: Number(wo.plannedQuantity),
    updatedTotalProduced,
  };
}

async function validateProductForWorkOrder(input: {
  companyId: string;
  finishedProductId: string;
  finishedProductVariantId: string | null;
  plannedQuantity: number;
}) {
  const finishedProduct = await prisma.finishedProduct.findFirst({
    where: {
      id: input.finishedProductId,
      companyId: input.companyId,
      isDeleted: false,
      isWaste: false,
    },
    select: {
      id: true,
      unit: true,
      weightPerPiece: true,
      variants: {
        where: { isDeleted: false },
        select: { id: true, weightPerPiece: true },
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

  const weightPerPieceKg = selectedVariant
    ? Number(selectedVariant.weightPerPiece)
    : finishedProduct.weightPerPiece != null
      ? Number(finishedProduct.weightPerPiece)
      : null;

  if (finishedProduct.unit === "PIECE" && !Number.isFinite(weightPerPieceKg ?? Number.NaN)) {
    throw Object.assign(new Error("Weight required"), {
      code: "WEIGHT_PER_PIECE_REQUIRED",
    });
  }

  return {
    id: finishedProduct.id,
    unit: finishedProduct.unit,
    weightPerPieceKg,
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
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const workOrders = await prisma.workOrder.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: {
      finishedProduct: {
        select: { id: true, name: true, unit: true, weightPerPiece: true },
      },
      finishedProductVariant: {
        select: { id: true, name: true, weightPerPiece: true },
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

    const weightPerPieceKg = wo.finishedProductVariant
      ? Number(wo.finishedProductVariant.weightPerPiece)
      : wo.finishedProduct?.weightPerPiece != null
        ? Number(wo.finishedProduct.weightPerPiece)
        : null;

    const totalConsumptionKg = wo.finishedProduct
      ? computeConsumptionKg({
          unit: wo.finishedProduct.unit,
          totalProduced,
          weightPerPieceKg,
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
            weightPerPiece: Number(wo.finishedProductVariant.weightPerPiece),
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
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const workOrder = await prisma.workOrder.findFirst({
    where: { id, companyId },
    include: {
      finishedProduct: {
        select: { id: true, name: true, unit: true, weightPerPiece: true },
      },
      finishedProductVariant: {
        select: { id: true, name: true, weightPerPiece: true },
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

  const weightPerPieceKg = workOrder.finishedProductVariant
    ? Number(workOrder.finishedProductVariant.weightPerPiece)
    : workOrder.finishedProduct?.weightPerPiece != null
      ? Number(workOrder.finishedProduct.weightPerPiece)
      : null;

  const totalConsumptionKg = workOrder.finishedProduct
    ? computeConsumptionKg({
        unit: workOrder.finishedProduct.unit,
        totalProduced,
        weightPerPieceKg,
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
          weightPerPiece: Number(workOrder.finishedProductVariant.weightPerPiece),
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
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

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

  try {
    const rawMaterialIds = validateRawMaterialTypes(rawMaterialsInput);
    const product = await validateProductForWorkOrder({
      companyId,
      finishedProductId,
      finishedProductVariantId,
      plannedQuantity,
    });

    const rawMaterials = await prisma.rawMaterial.findMany({
      where: { id: { in: rawMaterialIds }, companyId },
      select: { id: true },
    });
    if (rawMaterials.length !== rawMaterialIds.length) {
      return { error: "One or more raw materials are invalid." };
    }

    await prisma.workOrder.create({
      data: {
        companyId,
        workOrderName,
        finishedProductId: product.id,
        finishedProductVariantId,
        plannedQuantity,
        rawMaterials: {
          create: rawMaterialIds.map((rawMaterialId) => ({
            companyId,
            rawMaterialId,
          })),
        },
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      const code = (error as { code: string }).code;
      switch (code) {
        case "RAW_MATERIALS_REQUIRED":
          return { error: "At least one raw material type is required." };
        case "RAW_MATERIAL_REQUIRED":
          return { error: "Please select a raw material in every row." };
        case "RAW_MATERIAL_DUPLICATE":
          return { error: "Same raw material cannot be selected twice." };
        case "PLANNED_INTEGER_REQUIRED":
          return { error: "Planned quantity must be a whole number for pieces." };
        case "WEIGHT_PER_PIECE_REQUIRED":
          return { error: "Weight per piece is required for piece-based products." };
        case "FINISHED_PRODUCT_NOT_FOUND":
          return { error: "Finished product not found." };
        case "VARIANT_REQUIRED":
          return { error: "Variant is required for this finished product." };
        case "VARIANT_NOT_ALLOWED":
          return { error: "Variant must be empty for this finished product." };
        case "VARIANT_INVALID":
          return { error: "Selected variant does not belong to this finished product." };
      }
    }
    return { error: "Failed to create work order." };
  }

  revalidatePath("/production");
  redirect("/production");
}

export async function addProductionEntry(workOrderId: string, formData: FormData) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

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
      const workOrder = await tx.workOrder.findFirst({
        where: { id: workOrderId, companyId },
        include: {
          finishedProduct: {
            select: { id: true, unit: true, quantityInStock: true, weightPerPiece: true },
          },
          finishedProductVariant: {
            select: { id: true, quantityInStock: true, weightPerPiece: true },
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

      const weightPerPieceKg = workOrder.finishedProductVariant
        ? Number(workOrder.finishedProductVariant.weightPerPiece)
        : workOrder.finishedProduct.weightPerPiece != null
          ? Number(workOrder.finishedProduct.weightPerPiece)
          : null;

      if (workOrder.finishedProduct.unit === "PIECE") {
        if (!Number.isInteger(quantityProduced)) {
          throw Object.assign(new Error("Invalid integer"), {
            code: "PIECE_INTEGER_REQUIRED",
          });
        }
        if (!Number.isFinite(weightPerPieceKg ?? Number.NaN)) {
          throw Object.assign(new Error("Missing weight"), {
            code: "WEIGHT_PER_PIECE_REQUIRED",
          });
        }
      }

      const productionEntry = await tx.productionEntry.create({
        data: {
          companyId,
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
          where: { id: workOrder.finishedProductVariant.id, companyId },
          data: {
            quantityInStock: { increment: quantityProduced },
          },
        });
      } else {
        await tx.finishedProduct.update({
          where: { id: workOrder.finishedProductId, companyId },
          data: {
            quantityInStock: { increment: quantityProduced },
          },
        });
      }

      await tx.finishedProductLedger.create({
        data: {
          companyId,
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
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      const code = (error as { code: string }).code;
      switch (code) {
        case "WORK_ORDER_NOT_FOUND":
          return { error: "Work order not found." };
        case "PIECE_INTEGER_REQUIRED":
          return { error: "Production quantity must be a whole number for pieces." };
        case "WEIGHT_PER_PIECE_REQUIRED":
          return { error: "Weight per piece is required for piece-based products." };
        case "FINISHED_PRODUCT_DELETED":
          return { error: "Finished product is deleted for this work order." };
      }
    }
    return { error: "Failed to add production entry." };
  }

  revalidatePath(`/production/${workOrderId}`);

  const postAddWorkOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: {
      status: true,
      plannedQuantity: true,
      productionEntries: { select: { quantityProduced: true } },
    },
  });

  if (!postAddWorkOrder) {
    return { success: true as const };
  }

  const updatedTotalProduced = round2(
    postAddWorkOrder.productionEntries.reduce(
      (sum, entry) => sum + Number(entry.quantityProduced),
      0
    )
  );
  const plannedQuantityNum = Number(postAddWorkOrder.plannedQuantity);

  return {
    success: true as const,
    status: postAddWorkOrder.status,
    updatedTotalProduced,
    plannedQuantity: plannedQuantityNum,
  };
}

export async function updateProductionEntry(entryId: string, formData: FormData) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

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
      const oldEntry = await tx.productionEntry.findFirst({
        where: { id: entryId, companyId },
        include: {
          workOrder: {
            include: {
              finishedProduct: {
                select: { id: true, unit: true, quantityInStock: true, weightPerPiece: true },
              },
              finishedProductVariant: {
                select: { id: true, quantityInStock: true, weightPerPiece: true },
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
        const weightPerPieceKg = oldEntry.workOrder.finishedProductVariant
          ? Number(oldEntry.workOrder.finishedProductVariant.weightPerPiece)
          : oldEntry.workOrder.finishedProduct.weightPerPiece != null
            ? Number(oldEntry.workOrder.finishedProduct.weightPerPiece)
            : Number.NaN;
        if (!Number.isFinite(weightPerPieceKg)) {
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
        where: { id: entryId, companyId },
        data: {
          quantityProduced: newQuantityProduced,
          entryDate: newEntryDate,
        },
      });

      if (finishedProductVariantId) {
        await tx.finishedProductVariant.update({
          where: { id: finishedProductVariantId, companyId },
          data: {
            quantityInStock: { increment: delta },
          },
        });
      } else {
        await tx.finishedProduct.update({
          where: { id: finishedProductId, companyId },
          data: {
            quantityInStock: { increment: delta },
          },
        });
      }

      const linkedLedger = await tx.finishedProductLedger.findFirst({
        where: {
          companyId,
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
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      const code = (error as { code: string }).code;
      switch (code) {
        case "ENTRY_NOT_FOUND":
          return { error: "Production entry not found." };
        case "PIECE_INTEGER_REQUIRED":
          return { error: "Production quantity must be a whole number for pieces." };
        case "WEIGHT_PER_PIECE_REQUIRED":
          return { error: "Weight per piece is required for piece-based products." };
        case "INSUFFICIENT_FINISHED_STOCK":
          return { error: "Cannot reduce entry below dispatch-adjusted stock." };
        case "FINISHED_PRODUCT_DELETED":
          return { error: "Finished product is deleted for this work order." };
      }
    }
    return { error: "Failed to update production entry." };
  }

  if (!workOrderIdForRevalidate) {
    return { success: true as const };
  }

  revalidatePath(`/production/${workOrderIdForRevalidate}`);

  const state = await readWorkOrderCompletionState(
    workOrderIdForRevalidate,
    companyId
  );

  if (!state) {
    return { success: true as const };
  }

  return {
    success: true as const,
    status: state.status,
    updatedTotalProduced: state.updatedTotalProduced,
    plannedQuantity: state.plannedQuantity,
  };
}

export async function updateWorkOrder(id: string, formData: FormData) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const plannedQuantity = parseNumber(formData.get("plannedQuantity"));
  const rawMaterialsInput = parseJsonArray<UpdateWorkOrderRawMaterialInput>(
    formData.get("rawMaterials")
  );

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
      const workOrder = await tx.workOrder.findFirst({
        where: { id, companyId },
        include: {
          finishedProduct: {
            select: { id: true, unit: true, weightPerPiece: true },
          },
          finishedProductVariant: {
            select: { id: true, weightPerPiece: true },
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

      const weightPerPieceKg = workOrder.finishedProductVariant
        ? Number(workOrder.finishedProductVariant.weightPerPiece)
        : workOrder.finishedProduct.weightPerPiece != null
          ? Number(workOrder.finishedProduct.weightPerPiece)
          : null;

      if (workOrder.finishedProduct.unit === "PIECE" && !Number.isFinite(weightPerPieceKg ?? Number.NaN)) {
        throw Object.assign(new Error("Missing weight"), {
          code: "WEIGHT_PER_PIECE_REQUIRED",
        });
      }

      const validRawMaterials = await tx.rawMaterial.findMany({
        where: { id: { in: rawMaterialIds }, companyId },
        select: { id: true },
      });
      if (validRawMaterials.length !== rawMaterialIds.length) {
        throw Object.assign(new Error("Invalid raw materials"), {
          code: "RAW_MATERIAL_NOT_FOUND",
        });
      }

      await tx.workOrder.update({
        where: { id, companyId },
        data: {
          plannedQuantity,
          rawMaterials: {
            deleteMany: {},
            create: rawMaterialIds.map((rawMaterialId) => ({
              companyId,
              rawMaterialId,
            })),
          },
        },
      });
    }, { timeout: 20000, maxWait: 10000 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      const code = (error as { code: string }).code;
      switch (code) {
        case "WORK_ORDER_NOT_FOUND":
          return { error: "Work order not found." };
        case "PLANNED_INTEGER_REQUIRED":
          return { error: "Planned quantity must be a whole number for pieces." };
        case "WEIGHT_PER_PIECE_REQUIRED":
          return { error: "Weight per piece is required for piece-based products." };
        case "FINISHED_PRODUCT_DELETED":
          return { error: "Finished product is deleted for this work order." };
        case "RAW_MATERIALS_REQUIRED":
          return { error: "At least one raw material type is required." };
        case "RAW_MATERIAL_REQUIRED":
          return { error: "Please select a raw material in every row." };
        case "RAW_MATERIAL_DUPLICATE":
          return { error: "Same raw material cannot be selected twice." };
        case "RAW_MATERIAL_NOT_FOUND":
          return { error: "One or more raw materials are invalid." };
      }
    }

    return { error: "Failed to update work order." };
  }

  revalidatePath(`/production/${id}`);

  const state = await readWorkOrderCompletionState(id, companyId);

  if (!state) {
    return { success: true as const };
  }

  return {
    success: true as const,
    status: state.status,
    updatedTotalProduced: state.updatedTotalProduced,
    plannedQuantity: state.plannedQuantity,
  };
}

export async function completeWorkOrder(id: string) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  try {
    await prisma.$transaction(
      async (tx) => {
        const workOrder = await tx.workOrder.findFirst({
          where: { id, companyId },
          select: {
            id: true,
            status: true,
            plannedQuantity: true,
            productionEntries: { select: { quantityProduced: true } },
          },
        });

        if (!workOrder) {
          throw Object.assign(new Error("Not found"), {
            code: "WORK_ORDER_NOT_FOUND",
          });
        }

        if (workOrder.status === "COMPLETED") {
          throw Object.assign(new Error("Already completed"), {
            code: "ALREADY_COMPLETED",
          });
        }

        if (workOrder.status === "CANCELLED") {
          throw Object.assign(new Error("Cancelled"), {
            code: "WORK_ORDER_CANCELLED",
          });
        }

        const totalProduced = workOrder.productionEntries.reduce(
          (sum, entry) => sum + Number(entry.quantityProduced),
          0
        );
        if (totalProduced <= 0) {
          throw Object.assign(new Error("Zero production"), {
            code: "ZERO_PRODUCTION",
          });
        }

        await tx.workOrder.update({
          where: { id, companyId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      },
      { timeout: 20000, maxWait: 10000 }
    );
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      const code = (error as { code: string }).code;
      switch (code) {
        case "WORK_ORDER_NOT_FOUND":
          return { error: "Work order not found." };
        case "ALREADY_COMPLETED":
          return { error: "Work order is already completed." };
        case "WORK_ORDER_CANCELLED":
          return { error: "Cancelled work orders cannot be completed." };
        case "ZERO_PRODUCTION":
          return { error: "Cannot complete a work order with 0 production." };
      }
    }
    return { error: "Failed to complete work order." };
  }

  revalidatePath("/production");
  revalidatePath(`/production/${id}`);
  return { success: true };
}

export async function reopenWorkOrder(id: string) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const isAdmin =
    session.globalRole === "SUPER_ADMIN" || session.companyRole === "ADMIN";
  if (!isAdmin) {
    return { error: "Only admins can reopen work orders." };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const workOrder = await tx.workOrder.findFirst({
          where: { id, companyId },
          select: { id: true, status: true },
        });

        if (!workOrder) {
          throw Object.assign(new Error("Not found"), {
            code: "WORK_ORDER_NOT_FOUND",
          });
        }

        if (workOrder.status !== "COMPLETED") {
          throw Object.assign(new Error("Not completed"), {
            code: "NOT_COMPLETED",
          });
        }

        await tx.workOrder.update({
          where: { id, companyId },
          data: {
            status: "OPEN",
            completedAt: null,
          },
        });
      },
      { timeout: 20000, maxWait: 10000 }
    );
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      const code = (error as { code: string }).code;
      switch (code) {
        case "WORK_ORDER_NOT_FOUND":
          return { error: "Work order not found." };
        case "NOT_COMPLETED":
          return { error: "Only completed work orders can be reopened." };
      }
    }
    return { error: "Failed to reopen work order." };
  }

  revalidatePath("/production");
  revalidatePath(`/production/${id}`);
  return { success: true };
}
