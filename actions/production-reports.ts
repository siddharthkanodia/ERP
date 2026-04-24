"use server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKgWeight } from "@/lib/production-utils";

// IST is UTC+5:30 = 330 minutes
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Convert a local IST date string (YYYY-MM-DD) into a UTC-based `{ gte, lt }`
 * Prisma range covering [fromISO 00:00 IST, toISO+1 00:00 IST).
 */
function toUTCRange(fromISO: string, toISO: string) {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const gte = new Date(Date.UTC(fy, fm - 1, fd) - IST_OFFSET_MS);
  const lt = new Date(Date.UTC(ty, tm - 1, td + 1) - IST_OFFSET_MS);
  return { gte, lt };
}

function toISTDateKey(utcDate: Date): string {
  const ist = new Date(utcDate.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Exported types ──────────────────────────────────────────────────────────

export type VariantGroup = {
  variantId: string | null;
  variantName: string | null;
  totalPcs: number;
  totalKg: number;
  entryCount: number;
};

export type ProductGroup = {
  productId: string;
  productName: string;
  unit: string;
  totalPcs: number;
  totalKg: number;
  hasVariants: boolean;
  variants: VariantGroup[];
};

export type DailyGroup = {
  date: string; // "YYYY-MM-DD" IST
  products: ProductGroup[];
};

// ─── Internal accumulator ────────────────────────────────────────────────────

type ProductAccum = {
  productId: string;
  productName: string;
  unit: string;
  totalPcs: number;
  totalKg: number;
  variantMap: Map<string, VariantGroup>;
};

/**
 * Fold one raw entry into a product accumulator map.
 * `productMap` key = productId.
 */
function accumulate(
  productMap: Map<string, ProductAccum>,
  entry: {
    quantityProduced: { valueOf(): string | number };
    workOrder: {
      finishedProduct: { id: string; name: string; unit: string; weightPerPiece: { valueOf(): string | number } | null } | null;
      finishedProductVariant: { id: string; name: string; weightPerPiece: { valueOf(): string | number } | null } | null;
    } | null;
  }
) {
  const fp = entry.workOrder?.finishedProduct;
  const fv = entry.workOrder?.finishedProductVariant;
  if (!fp) return;

  const qty = Number(entry.quantityProduced);
  const unit = fp.unit;
  const pcs = unit === "PIECE" ? qty : 0;
  const weightPerPieceKg = Number(fv?.weightPerPiece ?? fp.weightPerPiece ?? 0);
  const kg = calculateKgWeight(qty, unit, weightPerPieceKg);

  const variantKey = fv?.id ?? "none";
  const productId = fp.id;

  let productAccum = productMap.get(productId);
  if (!productAccum) {
    productAccum = {
      productId,
      productName: fp.name,
      unit,
      totalPcs: 0,
      totalKg: 0,
      variantMap: new Map(),
    };
    productMap.set(productId, productAccum);
  }

  // Accumulate into product-level totals directly
  productAccum.totalPcs += pcs;
  productAccum.totalKg = (productAccum.totalKg ?? 0) + kg;

  const variantAccum = productAccum.variantMap.get(variantKey);
  if (variantAccum) {
    variantAccum.totalPcs += pcs;
    variantAccum.totalKg = (variantAccum.totalKg ?? 0) + kg;
    variantAccum.entryCount += 1;
  } else {
    productAccum.variantMap.set(variantKey, {
      variantId: fv?.id ?? null,
      variantName: fv?.name ?? null,
      totalPcs: pcs,
      totalKg: kg,
      entryCount: 1,
    });
  }
}

/** Convert a product accumulator map into a sorted ProductGroup[]. */
function buildProductGroups(productMap: Map<string, ProductAccum>): ProductGroup[] {
  return Array.from(productMap.values())
    .map((prod): ProductGroup => {
      const variants = Array.from(prod.variantMap.values()).sort((a, b) =>
        (a.variantName ?? "").localeCompare(b.variantName ?? "")
      );

      const hasVariants =
        variants.length > 0 && variants.some((v) => v.variantId !== null);

      return {
        productId: prod.productId,
        productName: prod.productName,
        unit: prod.unit,
        totalPcs: prod.totalPcs,
        totalKg: prod.totalKg,
        hasVariants,
        variants,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

// ─── Server Actions ──────────────────────────────────────────────────────────

export async function getDailyProductionReport(
  fromISO: string,
  toISO: string
): Promise<DailyGroup[]> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const { companyId } = session;

  const entries = await prisma.productionEntry.findMany({
    where: { companyId, entryDate: toUTCRange(fromISO, toISO) },
    select: {
      id: true,
      entryDate: true,
      quantityProduced: true,
      workOrder: {
        select: {
          finishedProduct: {
            select: { id: true, name: true, unit: true, weightPerPiece: true },
          },
          finishedProductVariant: {
            select: { id: true, name: true, weightPerPiece: true },
          },
        },
      },
    },
    orderBy: { entryDate: "desc" },
  });

  // Group: date → productId → variantId
  const dateMap = new Map<string, Map<string, ProductAccum>>();

  for (const entry of entries) {
    const dateKey = toISTDateKey(entry.entryDate);
    let productMap = dateMap.get(dateKey);
    if (!productMap) {
      productMap = new Map();
      dateMap.set(dateKey, productMap);
    }
    accumulate(productMap, entry);
  }

  // Build sorted DailyGroup[]: date DESC, productName ASC, variantName ASC
  return Array.from(dateMap.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // date DESC
    .map(([date, productMap]): DailyGroup => ({
      date,
      products: buildProductGroups(productMap),
    }));
}

export async function getMonthlyProductionReport(
  year: number,
  month: number
): Promise<ProductGroup[]> {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const { companyId } = session;

  // Build ISO range for the full month
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const fromISO = `${year}-${mm}-01`;
  const toISO = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const entries = await prisma.productionEntry.findMany({
    where: { companyId, entryDate: toUTCRange(fromISO, toISO) },
    select: {
      quantityProduced: true,
      workOrder: {
        select: {
          finishedProduct: {
            select: { id: true, name: true, unit: true, weightPerPiece: true },
          },
          finishedProductVariant: {
            select: { id: true, name: true, weightPerPiece: true },
          },
        },
      },
    },
  });

  // Group: productId → variantId
  const productMap = new Map<string, ProductAccum>();
  for (const entry of entries) {
    accumulate(productMap, entry);
  }

  // productName ASC → variantName ASC (applied inside buildProductGroups)
  return buildProductGroups(productMap);
}
