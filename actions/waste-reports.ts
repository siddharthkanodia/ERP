"use server";

import { endOfDay, startOfDay } from "date-fns";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addKg, roundKg } from "@/lib/utils/units";

const IST_OFFSET_MS = 330 * 60 * 1000;

export type WasteReportInput = {
  fromDate: string;
  toDate: string;
  companyId: string;
  finishedProductId?: string;
};

export type WasteReportRow = {
  date: string;
  openingBalance: number;
  wasteGenerated: number;
  wasteDispatched: number;
  closingBalance: number;
};

export type WasteReportResponse = {
  rows: WasteReportRow[];
  totals: {
    totalGenerated: number;
    totalDispatched: number;
  };
};

function parseISODateToLocal(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISTDateKey(utcDate: Date) {
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().slice(0, 10);
}

function formatDateLabel(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function getWasteReport(
  input: WasteReportInput
): Promise<WasteReportResponse> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  if (session.companyId !== input.companyId) throw new Error("Unauthorized");

  const { fromDate, toDate, companyId, finishedProductId } = input;
  if (!fromDate || !toDate || fromDate > toDate) {
    return { rows: [], totals: { totalGenerated: 0, totalDispatched: 0 } };
  }

  const rangeStart = startOfDay(parseISODateToLocal(fromDate));
  const rangeEnd = endOfDay(parseISODateToLocal(toDate));

  const entries = await prisma.finishedProductLedger.findMany({
    where: {
      companyId,
      ...(finishedProductId ? { finishedProductId } : {}),
      date: { gte: rangeStart, lte: rangeEnd },
      finishedProduct: {
        isWaste: true,
        isDeleted: false,
      },
    },
    select: {
      date: true,
      eventType: true,
      openingBalance: true,
      quantityProduced: true,
      quantityDispatched: true,
      closingBalance: true,
      createdAt: true,
      id: true,
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  const grouped = new Map<
    string,
    {
      openingBalance: number;
      wasteGenerated: number;
      wasteDispatched: number;
      closingBalance: number;
    }
  >();

  for (const entry of entries) {
    const key = toISTDateKey(entry.date);
    const prev = grouped.get(key);
    const generated =
      entry.eventType === "PRODUCTION" || entry.eventType === "RECEIPT"
        ? Number(entry.quantityProduced)
        : 0;
    const dispatched =
      entry.eventType === "DISPATCH" ? Number(entry.quantityDispatched) : 0;
    const opening = Number(entry.openingBalance);
    const closing = Number(entry.closingBalance);

    if (!prev) {
      grouped.set(key, {
        openingBalance: opening,
        wasteGenerated: roundKg(generated),
        wasteDispatched: roundKg(dispatched),
        closingBalance: closing,
      });
      continue;
    }

    prev.wasteGenerated = addKg(prev.wasteGenerated, generated);
    prev.wasteDispatched = addKg(prev.wasteDispatched, dispatched);
    prev.closingBalance = closing;
  }

  const rows = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateISO, value]) => ({
      date: formatDateLabel(dateISO),
      openingBalance: roundKg(value.openingBalance),
      wasteGenerated: roundKg(value.wasteGenerated),
      wasteDispatched: roundKg(value.wasteDispatched),
      closingBalance: roundKg(value.closingBalance),
    }))
    .filter((row) => row.wasteGenerated > 0 || row.wasteDispatched > 0);

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalGenerated = addKg(acc.totalGenerated, row.wasteGenerated);
      acc.totalDispatched = addKg(acc.totalDispatched, row.wasteDispatched);
      return acc;
    },
    { totalGenerated: 0, totalDispatched: 0 }
  );

  return { rows, totals };
}
