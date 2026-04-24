"use server";

import { format, getMonth, getYear } from "date-fns";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKgWeight } from "@/lib/production-utils";
import {
  getFinishedGoodsReportRange,
  getRawMaterialReport,
  type FinishedGoodsReportRangeInput,
  type RawMaterialReportRangeInput,
} from "@/lib/reports/queries";

// IST is UTC+5:30 = 330 minutes ahead
const IST_OFFSET_MS = 330 * 60 * 1000;

function toISTMonthKey(utcDate: Date): string {
  const ist = new Date(utcDate.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export type RMEfficiencyMonth = {
  month: string;
  monthIndex: number;
  isCurrentMonth: boolean;
  rmIssued: number;
  totalProduction: number;
  totalWaste: number;
  rmConsumed: number;
  differenceQty: number;
  differencePercent: number;
};

export async function getMonthlyRMEfficiencyReport(
  companyId: string
): Promise<RMEfficiencyMonth[]> {
  const now = new Date();
  const curMonth = getMonth(now); // 0-based, April = 3
  const curYear = getYear(now);

  // Financial year: starts April 1 of fyStartYear, ends March 31 of fyEndYear
  const fyStartYear = curMonth >= 3 ? curYear : curYear - 1;
  const fyEndYear = fyStartYear + 1;

  // UTC bounds for the full financial year (IST-aware)
  // April 1 00:00 IST = March 31 18:30 UTC
  const fyStartUTC = new Date(
    Date.UTC(fyStartYear, 3, 1) - IST_OFFSET_MS
  );
  // April 1 00:00 IST of next year
  const fyEndUTC = new Date(
    Date.UTC(fyEndYear, 3, 1) - IST_OFFSET_MS
  );

  // Fetch all FY data in 3 parallel queries
  const [floorLedgers, productionEntries, wasteLedgers] = await Promise.all([
    // RM Issued: warehouse → floor ISSUE events
    prisma.productionFloorLedger.findMany({
      where: {
        companyId,
        eventType: "ISSUE",
        date: { gte: fyStartUTC, lt: fyEndUTC },
      },
      select: { date: true, quantityIn: true },
    }),

    // Production entries for the FY
    prisma.productionEntry.findMany({
      where: {
        companyId,
        entryDate: { gte: fyStartUTC, lt: fyEndUTC },
      },
      select: {
        entryDate: true,
        quantityProduced: true,
        workOrder: {
          select: {
            finishedProduct: {
              select: { unit: true, weightPerPiece: true },
            },
            finishedProductVariant: {
              select: { weightPerPiece: true },
            },
          },
        },
      },
    }),

    // Waste: FinishedProductLedger entries for isWaste products
    prisma.finishedProductLedger.findMany({
      where: {
        companyId,
        date: { gte: fyStartUTC, lt: fyEndUTC },
        finishedProduct: { isWaste: true },
        quantityProduced: { gt: 0 },
      },
      select: { date: true, quantityProduced: true },
    }),
  ]);

  // Aggregate into month-keyed maps
  const rmIssuedMap = new Map<string, number>();
  for (const row of floorLedgers) {
    const key = toISTMonthKey(row.date);
    rmIssuedMap.set(key, (rmIssuedMap.get(key) ?? 0) + Number(row.quantityIn));
  }

  const productionMap = new Map<string, number>();
  for (const entry of productionEntries) {
    const key = toISTMonthKey(entry.entryDate);
    const qty = Number(entry.quantityProduced || 0);
    const unit = entry.workOrder?.finishedProduct?.unit;

    const contribution = calculateKgWeight(
      qty,
      unit ?? "",
      Number(
        entry.workOrder?.finishedProductVariant?.weightPerPiece
          ?? entry.workOrder?.finishedProduct?.weightPerPiece
          ?? 0
      )
    );

    productionMap.set(key, (productionMap.get(key) ?? 0) + contribution);
  }

  const wasteMap = new Map<string, number>();
  for (const row of wasteLedgers) {
    const key = toISTMonthKey(row.date);
    wasteMap.set(
      key,
      (wasteMap.get(key) ?? 0) + Number(row.quantityProduced)
    );
  }

  // Build 12-month result array (April of fyStartYear → March of fyEndYear)
  const currentMonthKey = toISTMonthKey(now);
  const months: RMEfficiencyMonth[] = [];

  for (let i = 0; i < 12; i++) {
    // month offset from April: 0=Apr, 1=May, … 11=Mar
    const calMonth = (3 + i) % 12; // 0-based calendar month
    const calYear = calMonth >= 3 ? fyStartYear : fyEndYear;
    const monthDate = new Date(calYear, calMonth, 1);

    const monthKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    const isCurrentMonth = monthKey === currentMonthKey;

    const rmIssued = Math.round((rmIssuedMap.get(monthKey) ?? 0) * 100) / 100;
    const totalProduction =
      Math.round((productionMap.get(monthKey) ?? 0) * 100) / 100;
    const totalWaste = Math.round((wasteMap.get(monthKey) ?? 0) * 100) / 100;
    const rmConsumed =
      Math.round((totalProduction + totalWaste) * 100) / 100;
    const differenceQty =
      Math.round((rmIssued - rmConsumed) * 100) / 100;
    const differencePercent =
      rmIssued > 0
        ? Math.round(((rmIssued - rmConsumed) / rmIssued) * 10000) / 100
        : 0;

    months.push({
      month: format(monthDate, "MMM yyyy"),
      monthIndex: i,
      isCurrentMonth,
      rmIssued,
      totalProduction,
      totalWaste,
      rmConsumed,
      differenceQty,
      differencePercent,
    });
  }

  return months;
}

export async function fetchFinishedGoodsInventoryReport(
  input: FinishedGoodsReportRangeInput
) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");

  return getFinishedGoodsReportRange(input);
}

export async function fetchRawMaterialInventoryReport(
  input: RawMaterialReportRangeInput
) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");

  return getRawMaterialReport(
    Number(input.fromMonth),
    Number(input.fromYear),
    Number(input.toMonth),
    Number(input.toYear),
    input.materialId
  );
}
