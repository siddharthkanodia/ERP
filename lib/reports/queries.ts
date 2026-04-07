import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns";

import { prisma } from "@/lib/prisma";

export type FinishedGoodsInventoryReportRow = {
  dateISO: string; // YYYY-MM-DD (local)
  dateLabel: string; // e.g. 03 Mar
  opening: number;
  production: number;
  dispatched: number;
  closing: number;
};

function toISODateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function add2(n: number, delta: number) {
  return round2(n + delta);
}

const IST_OFFSET_MS = 330 * 60 * 1000;

function toISTDateKey(utcDate: Date) {
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getISTRange(fromMonth: number, fromYear: number, toMonth: number, toYear: number) {
  // DB query boundaries in UTC that represent IST day boundaries.
  const dbStart = new Date(Date.UTC(fromYear, fromMonth - 1, 1) - IST_OFFSET_MS);
  const dbEnd = new Date(Date.UTC(toYear, toMonth, 1) - IST_OFFSET_MS - 1);

  // UI day generation uses clean local month dates.
  const uiStart = new Date(fromYear, fromMonth - 1, 1);
  const uiEnd = endOfMonth(new Date(toYear, toMonth - 1, 1));

  return { dbStart, dbEnd, uiStart, uiEnd };
}

function formatDateLabelFromISO(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)), "dd MMM");
}

export async function getFinishedGoodsReport(
  month: number,
  year: number,
  productId?: string
): Promise<FinishedGoodsInventoryReportRow[]> {
  if (!productId) return [];
  return getFinishedGoodsReportRange({
    fromMonth: month,
    fromYear: year,
    toMonth: month,
    toYear: year,
    productId,
  });
}

export type FinishedGoodsReportRangeInput = {
  fromMonth: number; // 1-12
  fromYear: number;
  toMonth: number; // 1-12
  toYear: number;
  productId: string;
};

export async function getFinishedGoodsReportRange(
  input: FinishedGoodsReportRangeInput
): Promise<FinishedGoodsInventoryReportRow[]> {
  const fromMonth = Number(input.fromMonth);
  const fromYear = Number(input.fromYear);
  const toMonth = Number(input.toMonth);
  const toYear = Number(input.toYear);
  const productId = input.productId;

  const { dbStart, dbEnd, uiStart, uiEnd } = getISTRange(
    fromMonth,
    fromYear,
    toMonth,
    toYear
  );
  const now = new Date();

  if (!productId) return [];
  if (dbEnd.getTime() < dbStart.getTime()) return [];

  const product = await prisma.finishedProduct.findFirst({
    where: { id: productId, isDeleted: false },
    select: {
      id: true,
      quantityInStock: true,
      variants: {
        where: { isDeleted: false },
        select: { quantityInStock: true },
      },
    },
  });

  if (!product) return [];

  const currentStock = round2(
    product.variants.length > 0
      ? round2(product.variants.reduce((s, v) => s + Number(v.quantityInStock), 0))
      : round2(Number(product.quantityInStock))
  );

  const [prodInRange, dispInRange, prodAfter, dispAfter] = await Promise.all([
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: productId,
        eventType: "PRODUCTION",
        date: { gte: dbStart, lte: dbEnd },
      },
      select: { date: true, quantityProduced: true },
    }),
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: productId,
        eventType: "DISPATCH",
        date: { gte: dbStart, lte: dbEnd },
      },
      select: { date: true, quantityDispatched: true },
    }),
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: productId,
        eventType: "PRODUCTION",
        date: { gt: dbEnd, lte: now },
      },
      select: { quantityProduced: true },
    }),
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: productId,
        eventType: "DISPATCH",
        date: { gt: dbEnd, lte: now },
      },
      select: { quantityDispatched: true },
    }),
  ]);

  const dailyProduction: Record<string, number> = {};
  const dailyDispatch: Record<string, number> = {};

  for (const p of prodInRange) {
    const key = toISTDateKey(p.date);
    dailyProduction[key] = round2(
      (dailyProduction[key] ?? 0) + Number(p.quantityProduced)
    );
  }
  for (const d of dispInRange) {
    const key = toISTDateKey(d.date);
    dailyDispatch[key] = round2(
      (dailyDispatch[key] ?? 0) + Number(d.quantityDispatched)
    );
  }

  const prodInRangeTotal = round2(
    prodInRange.reduce((sum, p) => sum + Number(p.quantityProduced), 0)
  );
  const dispInRangeTotal = round2(
    dispInRange.reduce((sum, p) => sum + Number(p.quantityDispatched), 0)
  );
  const prodAfterTotal = round2(
    prodAfter.reduce((sum, p) => sum + Number(p.quantityProduced), 0)
  );
  const dispAfterTotal = round2(
    dispAfter.reduce((sum, p) => sum + Number(p.quantityDispatched), 0)
  );

  const stockAtEnd = round2(currentStock - prodAfterTotal + dispAfterTotal);
  let opening = round2(stockAtEnd - prodInRangeTotal + dispInRangeTotal);

  const days = eachDayOfInterval({ start: uiStart, end: uiEnd });
  const rows: FinishedGoodsInventoryReportRow[] = [];

  for (const date of days) {
    const dateKey = format(date, "yyyy-MM-dd");
    const dateLabel = formatDateLabelFromISO(dateKey);

    const production = dailyProduction[dateKey] ?? 0;
    const dispatched = dailyDispatch[dateKey] ?? 0;
    const closing = round2(opening + production - dispatched);

    rows.push({
      dateISO: dateKey,
      dateLabel,
      opening,
      production,
      dispatched,
      closing,
    });

    opening = closing;
  }

  return rows;
}

export type RawMaterialInventoryReportRow = {
  dateISO: string; // YYYY-MM-DD (local)
  dateLabel: string; // e.g. 03 Mar
  opening: number;
  received: number;
  issued: number;
  closing: number;
};

export async function getRawMaterialReport(
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number,
  materialId: string
): Promise<RawMaterialInventoryReportRow[]> {
  const { dbStart, dbEnd, uiStart, uiEnd } = getISTRange(
    fromMonth,
    fromYear,
    toMonth,
    toYear
  );

  if (!materialId) return [];
  if (dbEnd.getTime() < dbStart.getTime()) return [];

  const [latestBeforeRange, ledgerInRange] = await Promise.all([
    prisma.rawMaterialLedger.findFirst({
      where: {
        rawMaterialId: materialId,
        createdAt: { lt: dbStart },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { closingBalance: true },
    }),
    prisma.rawMaterialLedger.findMany({
      where: {
        rawMaterialId: materialId,
        createdAt: { gte: dbStart, lte: dbEnd },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        createdAt: true,
        quantityIn: true,
        quantityOut: true,
        closingBalance: true,
      },
    }),
  ]);

  const dailyTotals: Record<string, { received: number; issued: number }> = {};
  for (const entry of ledgerInRange) {
    const key = toISTDateKey(entry.createdAt);
    if (!dailyTotals[key]) {
      dailyTotals[key] = { received: 0, issued: 0 };
    }
    dailyTotals[key].received = round2(
      dailyTotals[key].received + Number(entry.quantityIn)
    );
    dailyTotals[key].issued = round2(
      dailyTotals[key].issued + Number(entry.quantityOut)
    );
  }

  let opening = latestBeforeRange
    ? round2(Number(latestBeforeRange.closingBalance))
    : 0;

  const rows: RawMaterialInventoryReportRow[] = [];
  const days = eachDayOfInterval({ start: uiStart, end: uiEnd });

  for (const date of days) {
    const dateKey = format(date, "yyyy-MM-dd");
    const dateLabel = formatDateLabelFromISO(dateKey);

    const received = round2(dailyTotals[dateKey]?.received ?? 0);
    const issued = round2(dailyTotals[dateKey]?.issued ?? 0);
    const closing = round2(opening + received - issued);

    rows.push({
      dateISO: dateKey,
      dateLabel,
      opening,
      received,
      issued,
      closing,
    });

    opening = closing;
  }

  return rows;
}

export type RawMaterialReportRangeInput = {
  fromMonth: number; // 1-12
  fromYear: number;
  toMonth: number; // 1-12
  toYear: number;
  materialId: string;
};

export async function getRawMaterialReportRange(
  input: RawMaterialReportRangeInput
): Promise<RawMaterialInventoryReportRow[]> {
  return getRawMaterialReport(
    Number(input.fromMonth),
    Number(input.fromYear),
    Number(input.toMonth),
    Number(input.toYear),
    input.materialId
  );
}

export type ProductionEfficiencyRow = {
  monthIndex: number; // 0-11
  monthLabel: string; // e.g. Jan
  fgPieces: number;
  fgWeightKg: number;
  totalWasteKg: number;
  totalRmRequiredKg: number;
  rmAllocatedByMaterialId: Record<string, number>;
  totalRmIssuedKg: number;
  excessKg: number;
  excessPct: number;
};

export type ProductionEfficiencyReport = {
  rawMaterials: Array<{ id: string; name: string }>;
  rows: ProductionEfficiencyRow[];
};

function round2FromNumber(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getProductionEfficiencyReport(
  year: number
): Promise<ProductionEfficiencyReport> {
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const rawMaterials = await prisma.rawMaterial.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rawMaterialIdSet = new Set(rawMaterials.map((m) => m.id));

  // Initialize months with zero values.
  const rows: ProductionEfficiencyRow[] = Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    monthLabel: format(new Date(year, i, 1), "MMM"),
    fgPieces: 0,
    fgWeightKg: 0,
    totalWasteKg: 0,
    totalRmRequiredKg: 0,
    rmAllocatedByMaterialId: {},
    totalRmIssuedKg: 0,
    excessKg: 0,
    excessPct: 0,
  }));

  for (const r of rows) {
    for (const m of rawMaterials) {
      r.rmAllocatedByMaterialId[m.id] = 0;
    }
  }

  const workOrders = await prisma.workOrder.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: start, lte: end },
    },
    select: {
      completedAt: true,
      finishedProduct: {
        select: { unit: true, weightPerPiece: true, id: true },
      },
      finishedProductVariant: {
        select: { weightInGrams: true },
      },
      productionEntries: {
        select: { quantityProduced: true, wasteGenerated: true },
      },
      rawMaterials: {
        select: {
          rawMaterialId: true,
          quantityIssued: true,
        },
      },
    },
  });

  for (const wo of workOrders) {
    const completedAt = wo.completedAt;
    if (!completedAt) continue;

    const monthIndex = completedAt.getMonth(); // 0-11
    const row = rows[monthIndex];

    const unit = wo.finishedProduct?.unit ?? "KG";
    const variantWeightInGrams =
      wo.finishedProductVariant?.weightInGrams ?? null;
    const baseWeightPerPieceGrams = wo.finishedProduct?.weightPerPiece ?? null;

    let piecesProduced = 0;
    let producedKg = 0;
    let wasteKg = 0;

    for (const entry of wo.productionEntries) {
      const produced = Number(entry.quantityProduced);
      if (!Number.isFinite(produced)) continue;

      if (unit === "KG") {
        producedKg = round2FromNumber(producedKg + produced);
      } else {
        piecesProduced += produced;
      }
      const wastePart = Number(entry.wasteGenerated);
      if (Number.isFinite(wastePart)) {
        wasteKg = round2FromNumber(wasteKg + wastePart);
      }
    }

    if (unit === "PIECE") {
      const weightPerPieceGrams =
        variantWeightInGrams != null
          ? Number(variantWeightInGrams)
          : baseWeightPerPieceGrams != null
            ? Number(baseWeightPerPieceGrams)
            : 0;
      const weightPerPieceKg = weightPerPieceGrams / 1000;
      producedKg = round2FromNumber(piecesProduced * weightPerPieceKg);
    }

    row.fgPieces = round2FromNumber(row.fgPieces + piecesProduced);
    row.fgWeightKg = round2FromNumber(row.fgWeightKg + producedKg);
    row.totalWasteKg = round2FromNumber(row.totalWasteKg + wasteKg);

    for (const rm of wo.rawMaterials) {
      if (!rm.rawMaterialId || !rawMaterialIdSet.has(rm.rawMaterialId)) continue;
      const qty = Number(rm.quantityIssued);
      if (!Number.isFinite(qty)) continue;
      row.rmAllocatedByMaterialId[rm.rawMaterialId] = round2FromNumber(
        row.rmAllocatedByMaterialId[rm.rawMaterialId] + qty
      );
    }
  }

  for (const row of rows) {
    row.totalRmRequiredKg = round2FromNumber(
      row.fgWeightKg + row.totalWasteKg
    );
    const totalIssued = Object.values(row.rmAllocatedByMaterialId).reduce(
      (sum, v) => sum + (Number.isFinite(v) ? v : 0),
      0
    );
    row.totalRmIssuedKg = round2FromNumber(totalIssued);
    row.excessKg = round2FromNumber(row.totalRmIssuedKg - row.totalRmRequiredKg);
    row.excessPct =
      row.totalRmRequiredKg > 0
        ? round2FromNumber((row.excessKg / row.totalRmRequiredKg) * 100)
        : 0;
  }

  return { rawMaterials, rows };
}

