"use server";

import { LedgerEventType, ProductionFloorEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type LineInput = { materialId: string; quantity: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function mergeLines(items: LineInput[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.materialId) continue;
    const prev = map.get(item.materialId) ?? 0;
    map.set(item.materialId, round2(prev + (Number.isFinite(item.quantity) ? item.quantity : 0)));
  }
  return Array.from(map.entries()).map(([materialId, quantity]) => ({
    materialId,
    quantity,
  }));
}

export async function getProductionFloorStocks() {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const materials = await prisma.rawMaterial.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: {
      productionFloorStock: true,
    },
  });

  return materials.map((m) => ({
    rawMaterialId: m.id,
    name: m.name,
    inventoryStock: Number(m.quantityInStock),
    floorStock: m.productionFloorStock
      ? Number(m.productionFloorStock.quantityInStock)
      : 0,
    lastIssuedAt: m.productionFloorStock?.lastIssuedAt ?? null,
    lastConsumedAt: m.productionFloorStock?.lastConsumedAt ?? null,
  }));
}

export async function getFloorStockForRawMaterials(rawMaterialIds: string[]) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  if (rawMaterialIds.length === 0) return [];
  const rows = await prisma.productionFloorStock.findMany({
    where: { companyId, rawMaterialId: { in: rawMaterialIds } },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.rawMaterialId, Number(row.quantityInStock));
  }
  return rawMaterialIds.map((id) => ({
    rawMaterialId: id,
    floorStock: map.get(id) ?? 0,
  }));
}

type IssueToFloorInput = {
  date: string;
  notes?: string;
  items: LineInput[];
};

export async function issueToFloorBatch(
  input: IssueToFloorInput
): Promise<{ error: string } | void> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const date = new Date(input.date);

  if (!input.items?.length) {
    return { error: "Add at least one material line." };
  }
  if (!input.date || Number.isNaN(date.getTime())) {
    return { error: "Date is required." };
  }
  if (date.getTime() > Date.now()) {
    return { error: "Date cannot be in the future." };
  }
  if (input.notes !== undefined && input.notes.length > 500) {
    return { error: "Notes must be at most 500 characters." };
  }

  const merged = mergeLines(input.items);
  if (merged.length === 0) {
    return { error: "Add at least one material line." };
  }
  for (const item of merged) {
    if (!item.materialId.trim()) {
      return { error: "Each item must have a valid raw material." };
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: "Quantity must be greater than 0 for all items." };
    }
  }

  const trimmedNotes = input.notes?.trim() ? input.notes.trim() : undefined;
  const ledgerNotes = trimmedNotes
    ? `Issued to production floor — ${trimmedNotes}`
    : "Issued to production floor";

  const ZERO = new Prisma.Decimal(0);

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of merged) {
        const qty = new Prisma.Decimal(item.quantity);

        const material = await tx.rawMaterial.findFirst({
          where: { id: item.materialId, companyId },
          select: { id: true, name: true, quantityInStock: true },
        });
        if (!material) {
          throw Object.assign(new Error("Raw material not found"), {
            code: "MATERIAL_NOT_FOUND",
            materialId: item.materialId,
          });
        }

        const warehouseOpening = material.quantityInStock;
        if (qty.greaterThan(warehouseOpening)) {
          throw Object.assign(new Error("Insufficient warehouse stock"), {
            code: "INSUFFICIENT_INVENTORY_STOCK",
            materialName: material.name,
            requested: qty.toString(),
            available: warehouseOpening.toString(),
          });
        }
        const warehouseClosing = warehouseOpening.sub(qty);

        await tx.rawMaterial.update({
          where: { id: material.id },
          data: { quantityInStock: { decrement: qty } },
        });

        await tx.rawMaterialLedger.create({
          data: {
            companyId,
            rawMaterialId: material.id,
            date,
            eventType: LedgerEventType.ADJUSTMENT,
            openingBalance: warehouseOpening,
            quantityIn: ZERO,
            quantityOut: qty,
            closingBalance: warehouseClosing,
            notes: ledgerNotes,
          },
        });

        const existingFloor = await tx.productionFloorStock.findUnique({
          where: { rawMaterialId: material.id },
          select: { quantityInStock: true },
        });
        const floorOpening = existingFloor
          ? existingFloor.quantityInStock
          : ZERO;
        const floorClosing = floorOpening.add(qty);

        await tx.productionFloorStock.upsert({
          where: { rawMaterialId: material.id },
          create: {
            companyId,
            rawMaterialId: material.id,
            quantityInStock: qty,
            lastIssuedAt: date,
          },
          update: {
            quantityInStock: { increment: qty },
            lastIssuedAt: date,
          },
        });

        await tx.productionFloorLedger.create({
          data: {
            companyId,
            rawMaterialId: material.id,
            date,
            eventType: ProductionFloorEventType.ISSUE,
            openingBalance: floorOpening,
            quantityIn: qty,
            quantityOut: ZERO,
            closingBalance: floorClosing,
            notes: ledgerNotes,
          },
        });
      }
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: string }).code
        : undefined;

    console.error("[issueToFloorBatch] transaction failed", {
      code,
      itemCount: merged.length,
      dateISO: date.toISOString(),
      items: merged.map((m) => ({
        materialId: m.materialId,
        quantity: m.quantity,
      })),
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    switch (code) {
      case "MATERIAL_NOT_FOUND":
        return { error: "One or more raw materials no longer exist." };
      case "INSUFFICIENT_INVENTORY_STOCK": {
        const name =
          typeof error === "object" && error !== null && "materialName" in error
            ? (error as { materialName?: string }).materialName ?? "material"
            : "material";
        return { error: `Issue quantity exceeds inventory stock for ${name}.` };
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        error:
          process.env.NODE_ENV === "production"
            ? "Failed to issue stock to production floor."
            : `DB error ${error.code}: ${error.message.split("\n").pop()?.trim() ?? error.message}`,
      };
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      return {
        error:
          process.env.NODE_ENV === "production"
            ? "Failed to issue stock to production floor."
            : `Validation error: ${error.message.split("\n").pop()?.trim() ?? error.message}`,
      };
    }

    return {
      error:
        process.env.NODE_ENV === "production"
          ? "Failed to issue stock to production floor."
          : error instanceof Error
          ? `Failed to issue stock: ${error.message}`
          : "Failed to issue stock to production floor.",
    };
  }

  revalidatePath("/production-floor");
  revalidatePath("/raw-materials");
  redirect("/production-floor");
}

type ConsumeFromFloorInput = {
  date: string;
  notes?: string;
  items: LineInput[];
};

export async function consumeFromFloorBatch(
  input: ConsumeFromFloorInput
): Promise<{ error: string } | void> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const date = new Date(input.date);

  if (!input.items?.length) {
    return { error: "Add at least one material line." };
  }
  if (!input.date || Number.isNaN(date.getTime())) {
    return { error: "Date is required." };
  }
  if (date.getTime() > Date.now()) {
    return { error: "Date cannot be in the future." };
  }
  if (input.notes !== undefined && input.notes.length > 500) {
    return { error: "Notes must be at most 500 characters." };
  }

  const seenIds = new Set<string>();
  for (const item of input.items) {
    if (!item.materialId?.trim()) {
      return { error: "Each item must have a valid raw material." };
    }
    if (seenIds.has(item.materialId)) {
      return { error: "Duplicate raw materials are not allowed." };
    }
    seenIds.add(item.materialId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: "Quantity must be greater than 0 for all items." };
    }
  }

  const ledgerNotes = input.notes?.trim() ? input.notes.trim() : "Consumed from production floor";

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        const floor = await tx.productionFloorStock.findFirst({
          where: { rawMaterialId: item.materialId, companyId },
          include: { rawMaterial: { select: { name: true } } },
        });

        const floorOpening = floor ? Number(floor.quantityInStock) : 0;
        if (!floor) {
          throw Object.assign(new Error("Material not on floor"), {
            code: "MATERIAL_NOT_ON_FLOOR",
          });
        }
        if (item.quantity > floorOpening) {
          throw Object.assign(new Error("Insufficient floor stock"), {
            code: "INSUFFICIENT_FLOOR_STOCK",
            materialName: floor?.rawMaterial?.name ?? "material",
          });
        }

        const floorClosing = round2(floorOpening - item.quantity);

        await tx.productionFloorStock.update({
          where: { rawMaterialId: item.materialId },
          data: {
            quantityInStock: floorClosing,
            lastConsumedAt: date,
          },
        });

        await tx.productionFloorLedger.create({
          data: {
            companyId,
            rawMaterialId: item.materialId,
            date,
            eventType: ProductionFloorEventType.CONSUME,
            openingBalance: floorOpening,
            quantityIn: 0,
            quantityOut: item.quantity,
            closingBalance: floorClosing,
            notes: ledgerNotes,
          },
        });
      }
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_FLOOR_STOCK"
    ) {
      const name = (error as { materialName?: string }).materialName ?? "material";
      return { error: `Consume quantity exceeds floor stock for ${name}.` };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "MATERIAL_NOT_ON_FLOOR"
    ) {
      return { error: "Selected material is not currently on the production floor." };
    }
    return { error: "Failed to consume from production floor." };
  }

  revalidatePath("/production-floor");
  redirect("/production-floor");
}

type FloorReportRangeInput = {
  rawMaterialId: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
};

export type FloorReportRow = {
  dateISO: string;
  dateLabel: string;
  opening: number;
  issued: number;
  consumed: number;
  adjusted: number;
  closing: number;
};

function toLocalDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const day = `${local.getDate()}`.padStart(2, "0");
  const mon = local.toLocaleString("en-US", { month: "short" });
  const year = local.getFullYear();
  return `${day} ${mon} ${year}`;
}

export async function getFloorReportRange(
  input: FloorReportRangeInput
): Promise<FloorReportRow[]> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const { rawMaterialId } = input;
  if (!rawMaterialId) return [];

  const fromDate = new Date(input.fromYear, input.fromMonth - 1, 1, 0, 0, 0, 0);
  const toDate = new Date(input.toYear, input.toMonth, 0, 23, 59, 59, 999);

  if (toDate.getTime() < fromDate.getTime()) return [];

  const openingAggregate = await prisma.productionFloorLedger.aggregate({
    where: {
      companyId,
      rawMaterialId,
      date: { lt: fromDate },
    },
    _sum: {
      quantityIn: true,
      quantityOut: true,
    },
  });

  let runningBalance = round2(
    Number(openingAggregate._sum.quantityIn ?? 0) -
      Number(openingAggregate._sum.quantityOut ?? 0)
  );

  const ledgerInRange = await prisma.productionFloorLedger.findMany({
    where: {
      companyId,
      rawMaterialId,
      date: { gte: fromDate, lte: toDate },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  type DayBucket = {
    issued: number;
    consumed: number;
    adjusted: number;
  };
  const perDay = new Map<string, DayBucket>();

  for (const entry of ledgerInRange) {
    const key = toLocalDateKey(entry.date);
    const bucket = perDay.get(key) ?? { issued: 0, consumed: 0, adjusted: 0 };
    const qtyIn = Number(entry.quantityIn);
    const qtyOut = Number(entry.quantityOut);
    if (entry.eventType === "ISSUE") {
      bucket.issued = round2(bucket.issued + qtyIn);
    } else if (entry.eventType === "CONSUME") {
      bucket.consumed = round2(bucket.consumed + qtyOut);
    } else {
      bucket.adjusted = round2(bucket.adjusted + (qtyIn - qtyOut));
    }
    perDay.set(key, bucket);
  }

  const rows: FloorReportRow[] = [];
  const cursor = new Date(fromDate);
  while (cursor.getTime() <= toDate.getTime()) {
    const key = toLocalDateKey(cursor);
    const bucket = perDay.get(key) ?? { issued: 0, consumed: 0, adjusted: 0 };

    const opening = runningBalance;
    const closing = round2(opening + bucket.issued - bucket.consumed + bucket.adjusted);

    rows.push({
      dateISO: key,
      dateLabel: formatDateLabel(key),
      opening: round2(opening),
      issued: bucket.issued,
      consumed: bucket.consumed,
      adjusted: bucket.adjusted,
      closing,
    });

    runningBalance = closing;
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
}

async function rebuildFloorBalancesForMaterial(
  tx: Prisma.TransactionClient,
  companyId: string,
  rawMaterialId: string
) {
  const entries = await tx.productionFloorLedger.findMany({
    where: { companyId, rawMaterialId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  let running = 0;
  let lastIssuedAt: Date | null = null;
  let lastConsumedAt: Date | null = null;

  for (const entry of entries) {
    const qtyIn = Number(entry.quantityIn);
    const qtyOut = Number(entry.quantityOut);
    const opening = round2(running);
    const closing = round2(opening + qtyIn - qtyOut);

    if (closing < 0) {
      throw Object.assign(new Error("Negative closing balance"), {
        code: "NEGATIVE_FLOOR_BALANCE",
        entryId: entry.id,
        closing,
      });
    }

    if (
      Number(entry.openingBalance) !== opening ||
      Number(entry.closingBalance) !== closing
    ) {
      await tx.productionFloorLedger.update({
        where: { id: entry.id },
        data: { openingBalance: opening, closingBalance: closing },
      });
    }

    if (entry.eventType === ProductionFloorEventType.ISSUE) {
      if (!lastIssuedAt || entry.date > lastIssuedAt) lastIssuedAt = entry.date;
    } else if (entry.eventType === ProductionFloorEventType.CONSUME) {
      if (!lastConsumedAt || entry.date > lastConsumedAt) lastConsumedAt = entry.date;
    }

    running = closing;
  }

  const existingStock = await tx.productionFloorStock.findUnique({
    where: { rawMaterialId },
  });

  if (existingStock) {
    await tx.productionFloorStock.update({
      where: { rawMaterialId },
      data: {
        quantityInStock: round2(running),
        lastIssuedAt,
        lastConsumedAt,
      },
    });
  } else if (running !== 0 || lastIssuedAt || lastConsumedAt) {
    await tx.productionFloorStock.create({
      data: {
        companyId,
        rawMaterialId,
        quantityInStock: round2(running),
        lastIssuedAt,
        lastConsumedAt,
      },
    });
  }
}

export type FloorLedgerEntry = {
  id: string;
  rawMaterialId: string;
  rawMaterialName: string;
  date: string;
  eventType: "ISSUE" | "CONSUME" | "ADJUSTMENT";
  quantityIn: number;
  quantityOut: number;
  openingBalance: number;
  closingBalance: number;
  notes: string | null;
};

export async function getFloorLedgerEntries(params: {
  rawMaterialId?: string;
  limit?: number;
}): Promise<FloorLedgerEntry[]> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const entries = await prisma.productionFloorLedger.findMany({
    where: {
      companyId,
      ...(params.rawMaterialId ? { rawMaterialId: params.rawMaterialId } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { rawMaterial: { select: { name: true } } },
  });

  return entries.map((e) => ({
    id: e.id,
    rawMaterialId: e.rawMaterialId,
    rawMaterialName: e.rawMaterial.name,
    date: e.date.toISOString(),
    eventType: e.eventType,
    quantityIn: Number(e.quantityIn),
    quantityOut: Number(e.quantityOut),
    openingBalance: Number(e.openingBalance),
    closingBalance: Number(e.closingBalance),
    notes: e.notes,
  }));
}

export type UpdateFloorLedgerInput = {
  date: string;
  notes?: string;
  quantityIn: number;
  quantityOut: number;
};

export async function updateFloorLedgerEntry(
  entryId: string,
  input: UpdateFloorLedgerInput
): Promise<{ error: string } | { success: true }> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const date = new Date(input.date);
  if (!input.date || Number.isNaN(date.getTime())) {
    return { error: "Date is required." };
  }
  if (date.getTime() > Date.now()) {
    return { error: "Date cannot be in the future." };
  }
  if (!Number.isFinite(input.quantityIn) || input.quantityIn < 0) {
    return { error: "Quantity In must be zero or greater." };
  }
  if (!Number.isFinite(input.quantityOut) || input.quantityOut < 0) {
    return { error: "Quantity Out must be zero or greater." };
  }
  if (input.notes !== undefined && input.notes.length > 500) {
    return { error: "Notes must be at most 500 characters." };
  }

  const newIn = round2(input.quantityIn);
  const newOut = round2(input.quantityOut);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.productionFloorLedger.findFirst({
        where: { id: entryId, companyId },
        include: { rawMaterial: { select: { id: true, name: true, quantityInStock: true } } },
      });
      if (!existing) {
        throw Object.assign(new Error("Not found"), { code: "ENTRY_NOT_FOUND" });
      }

      if (existing.eventType === ProductionFloorEventType.ISSUE) {
        if (newOut > 0) {
          throw Object.assign(new Error("Invalid"), {
            code: "ISSUE_REQUIRES_IN_ONLY",
          });
        }
        if (newIn <= 0) {
          throw Object.assign(new Error("Invalid"), {
            code: "QUANTITY_REQUIRED",
          });
        }
      } else if (existing.eventType === ProductionFloorEventType.CONSUME) {
        if (newIn > 0) {
          throw Object.assign(new Error("Invalid"), {
            code: "CONSUME_REQUIRES_OUT_ONLY",
          });
        }
        if (newOut <= 0) {
          throw Object.assign(new Error("Invalid"), {
            code: "QUANTITY_REQUIRED",
          });
        }
      } else {
        if (newIn > 0 && newOut > 0) {
          throw Object.assign(new Error("Invalid"), {
            code: "ADJUSTMENT_ONE_DIRECTION",
          });
        }
        if (newIn === 0 && newOut === 0) {
          throw Object.assign(new Error("Invalid"), {
            code: "QUANTITY_REQUIRED",
          });
        }
      }

      if (existing.eventType === ProductionFloorEventType.ISSUE) {
        const oldIn = Number(existing.quantityIn);
        const delta = round2(newIn - oldIn);
        if (delta !== 0) {
          const warehouseOpening = Number(existing.rawMaterial.quantityInStock);
          const warehouseClosing = round2(warehouseOpening - delta);
          if (warehouseClosing < 0) {
            throw Object.assign(new Error("Insufficient warehouse"), {
              code: "INSUFFICIENT_WAREHOUSE_STOCK",
              materialName: existing.rawMaterial.name,
            });
          }
          await tx.rawMaterial.update({
            where: { id: existing.rawMaterialId },
            data: { quantityInStock: warehouseClosing },
          });
          await tx.rawMaterialLedger.create({
            data: {
              companyId,
              rawMaterialId: existing.rawMaterialId,
              date,
              eventType: LedgerEventType.ADJUSTMENT,
              openingBalance: warehouseOpening,
              quantityIn: delta < 0 ? -delta : 0,
              quantityOut: delta > 0 ? delta : 0,
              closingBalance: warehouseClosing,
              notes: `Floor issue edit: adjusted by ${delta > 0 ? "+" : ""}${delta.toFixed(2)} kg`,
            },
          });
        }
      }

      await tx.productionFloorLedger.update({
        where: { id: entryId },
        data: {
          date,
          quantityIn: newIn,
          quantityOut: newOut,
          notes: input.notes?.trim() ? input.notes.trim() : existing.notes,
        },
      });

      await rebuildFloorBalancesForMaterial(tx, companyId, existing.rawMaterialId);
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: string }).code
        : undefined;
    switch (code) {
      case "ENTRY_NOT_FOUND":
        return { error: "Ledger entry no longer exists." };
      case "ISSUE_REQUIRES_IN_ONLY":
        return { error: "Issue entries must have Quantity In only." };
      case "CONSUME_REQUIRES_OUT_ONLY":
        return { error: "Consume entries must have Quantity Out only." };
      case "ADJUSTMENT_ONE_DIRECTION":
        return { error: "Adjustment entries must be either IN or OUT, not both." };
      case "QUANTITY_REQUIRED":
        return { error: "Quantity must be greater than 0." };
      case "INSUFFICIENT_WAREHOUSE_STOCK": {
        const name =
          typeof error === "object" && error !== null && "materialName" in error
            ? (error as { materialName?: string }).materialName ?? "material"
            : "material";
        return { error: `Warehouse stock is insufficient for the new quantity on ${name}.` };
      }
      case "NEGATIVE_FLOOR_BALANCE":
        return {
          error: "This change would produce a negative floor balance on a later date. Adjust or delete the affected entries first.",
        };
      default:
        return { error: "Failed to update ledger entry." };
    }
  }

  revalidatePath("/production-floor");
  revalidatePath("/production-floor/transactions");
  revalidatePath("/reports/production-floor");
  return { success: true };
}

export async function deleteFloorLedgerEntry(
  entryId: string
): Promise<{ error: string } | { success: true }> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.productionFloorLedger.findFirst({
        where: { id: entryId, companyId },
        include: { rawMaterial: { select: { id: true, name: true, quantityInStock: true } } },
      });
      if (!existing) {
        throw Object.assign(new Error("Not found"), { code: "ENTRY_NOT_FOUND" });
      }

      if (existing.eventType === ProductionFloorEventType.ISSUE) {
        const oldIn = Number(existing.quantityIn);
        if (oldIn > 0) {
          const warehouseOpening = Number(existing.rawMaterial.quantityInStock);
          const warehouseClosing = round2(warehouseOpening + oldIn);
          await tx.rawMaterial.update({
            where: { id: existing.rawMaterialId },
            data: { quantityInStock: warehouseClosing },
          });
          await tx.rawMaterialLedger.create({
            data: {
              companyId,
              rawMaterialId: existing.rawMaterialId,
              date: new Date(),
              eventType: LedgerEventType.ADJUSTMENT,
              openingBalance: warehouseOpening,
              quantityIn: oldIn,
              quantityOut: 0,
              closingBalance: warehouseClosing,
              notes: `Floor issue deleted: returned ${oldIn.toFixed(2)} kg to warehouse`,
            },
          });
        }
      }

      await tx.productionFloorLedger.delete({ where: { id: entryId } });
      await rebuildFloorBalancesForMaterial(tx, companyId, existing.rawMaterialId);
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "ENTRY_NOT_FOUND") {
      return { error: "Ledger entry no longer exists." };
    }
    if (code === "NEGATIVE_FLOOR_BALANCE") {
      return {
        error:
          "Deleting this entry would produce a negative floor balance on a later date. Adjust or delete later entries first.",
      };
    }
    return { error: "Failed to delete ledger entry." };
  }

  revalidatePath("/production-floor");
  revalidatePath("/production-floor/transactions");
  revalidatePath("/reports/production-floor");
  return { success: true };
}
