"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type VariantInput = {
  id?: string;
  clientKey?: string;
  name: string;
  weightInGrams: number;
  initialQuantity?: number;
  quantityInStock?: number;
  _delete?: boolean;
};

type StockDistributionInput = {
  variantTempKeyOrId: string;
  allocatedQuantity: number;
};

function parseVariantsInput(raw: FormDataEntryValue | null): VariantInput[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return { name: "", weightInGrams: Number.NaN };
      }
      const typed = item as Record<string, unknown>;
      return {
        id: typeof typed.id === "string" && typed.id.trim() ? typed.id : undefined,
        clientKey:
          typeof typed.clientKey === "string" && typed.clientKey.trim()
            ? typed.clientKey
            : undefined,
        name: typeof typed.name === "string" ? typed.name.trim() : "",
        weightInGrams:
          typeof typed.weightInGrams === "number"
            ? typed.weightInGrams
            : parseFloat(String(typed.weightInGrams ?? "")),
        initialQuantity:
          typeof typed.initialQuantity === "number"
            ? typed.initialQuantity
            : parseFloat(String(typed.initialQuantity ?? "")),
        quantityInStock:
          typeof typed.quantityInStock === "number"
            ? typed.quantityInStock
            : parseFloat(String(typed.quantityInStock ?? "")),
        _delete: typed._delete === true,
      };
    });
  } catch {
    return [];
  }
}

function parseStockDistributionInput(
  raw: FormDataEntryValue | null
): StockDistributionInput[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return { variantTempKeyOrId: "", allocatedQuantity: Number.NaN };
      }
      const typed = item as Record<string, unknown>;
      return {
        variantTempKeyOrId:
          typeof typed.variantTempKeyOrId === "string"
            ? typed.variantTempKeyOrId
            : "",
        allocatedQuantity:
          typeof typed.allocatedQuantity === "number"
            ? typed.allocatedQuantity
            : parseFloat(String(typed.allocatedQuantity ?? "")),
      };
    });
  } catch {
    return [];
  }
}

function toTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

async function rebuildFinishedProductLedgerBalances(
  finishedProductId: string,
  tx: Prisma.TransactionClient,
  finishedProductVariantId?: string | null
) {
  // ISOLATION: always scoped by finishedProductId (ID, not name)
  // Soft-deleted products with same name are separate records
  const entries = await tx.finishedProductLedger.findMany({
    where: {
      finishedProductId,
      finishedProductVariantId: finishedProductVariantId ?? null,
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      quantityProduced: true,
      quantityDispatched: true,
    },
  });

  let runningBalance = 0;
  const updates = entries.map((entry) => {
    const openingBalance = runningBalance;
    const closingBalance =
      openingBalance +
      Number(entry.quantityProduced) -
      Number(entry.quantityDispatched);
    runningBalance = closingBalance;

    // ISOLATION: always scoped by finishedProductId (ID, not name)
    // Soft-deleted products with same name are separate records
    return tx.finishedProductLedger.update({
      where: { id: entry.id },
      data: { openingBalance, closingBalance },
    });
  });

  await Promise.all(updates);
}

async function ensureDefaultWasteType() {
  const existing = await prisma.finishedProduct.findFirst({
    where: { isDeleted: false, isWaste: true },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.finishedProduct.create({
    data: {
      name: "Mixed Waste",
      unit: "KG",
      isWaste: true,
      quantityInStock: 0,
    },
    select: { id: true },
  });
  return created.id;
}

export async function createFinishedProduct(formData: FormData) {
  const name = formData.get("name") as string;
  const unit = formData.get("unit") as "KG" | "PIECE";
  const initialQuantityRaw = formData.get("initialQuantity") as string | null;
  const weightPerPieceRaw = formData.get("weightPerPiece") as string | null;
  const variants = parseVariantsInput(formData.get("variants"));

  if (!name || name.trim() === "") {
    return { error: "Name is required." };
  }

  if (!unit) {
    return { error: "Unit of measure is required." };
  }

  const existingActiveProduct = await prisma.finishedProduct.findFirst({
    where: {
      name: { equals: name.trim(), mode: "insensitive" },
      isDeleted: false,
      isWaste: false,
    },
    select: { id: true },
  });
  if (existingActiveProduct) {
    return { error: "A product with this name already exists." };
  }

  const parsedInitialQuantity = parseFloat(initialQuantityRaw ?? "0");
  const parsedWeightPerPiece = parseFloat(weightPerPieceRaw ?? "");

  if (variants.length === 0) {
    if (!Number.isFinite(parsedInitialQuantity) || parsedInitialQuantity < 0) {
      return { error: "Initial quantity must be greater than or equal to 0." };
    }
    if (unit === "PIECE" && !Number.isInteger(parsedInitialQuantity)) {
      return { error: "Pieces must be whole numbers." };
    }

    if (unit === "PIECE") {
      if (!Number.isFinite(parsedWeightPerPiece)) {
        return {
          error:
            "Weight per piece is required for piece-based products without variants",
        };
      }
      if (parsedWeightPerPiece <= 0) {
        return {
          error:
            "Weight per piece is required for piece-based products without variants",
        };
      }
    }
  }

  if (variants.length > 0) {
    const names = new Set<string>();
    for (const variant of variants) {
      if (!variant.name) {
        return { error: "Variant name is required for all variant rows." };
      }
      if (!Number.isFinite(variant.weightInGrams) || variant.weightInGrams <= 0) {
        return { error: "Variant weight must be greater than 0 grams." };
      }
      const initialQuantity = variant.initialQuantity ?? Number.NaN;
      if (!Number.isFinite(initialQuantity) || initialQuantity < 0) {
        return { error: "Variant initial quantity must be greater than or equal to 0." };
      }
      if (unit === "PIECE" && !Number.isInteger(initialQuantity)) {
        return { error: "Pieces must be whole numbers." };
      }
      const normalized = variant.name.toLowerCase();
      if (names.has(normalized)) {
        return { error: "Duplicate variant names are not allowed." };
      }
      names.add(normalized);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.finishedProduct.create({
        data: {
          name: name.trim(),
          unit,
          isWaste: false,
          quantityInStock: variants.length > 0 ? 0 : parsedInitialQuantity,
          weightPerPiece:
            unit === "PIECE" && variants.length === 0
              ? parsedWeightPerPiece
              : null,
        },
      });
      if (variants.length > 0) {
        for (const variant of variants) {
          const initialQuantity = variant.initialQuantity ?? 0;
          const createdVariant = await tx.finishedProductVariant.create({
            data: {
              finishedProductId: product.id,
              name: variant.name,
              weightInGrams: variant.weightInGrams,
              quantityInStock: initialQuantity,
            },
          });

          if (initialQuantity > 0) {
            // ISOLATION: always scoped by finishedProductId (ID, not name)
            // Soft-deleted products with same name are separate records
            await tx.finishedProductLedger.create({
              data: {
                finishedProductId: product.id,
                finishedProductVariantId: createdVariant.id,
                eventType: "OPENING_STOCK",
                openingBalance: 0,
                quantityProduced: initialQuantity,
                quantityDispatched: 0,
                closingBalance: initialQuantity,
                notes: "Opening stock",
              },
            });
          }
        }
      } else if (parsedInitialQuantity > 0) {
        // ISOLATION: always scoped by finishedProductId (ID, not name)
        // Soft-deleted products with same name are separate records
        await tx.finishedProductLedger.create({
          data: {
            finishedProductId: product.id,
            eventType: "OPENING_STOCK",
            openingBalance: 0,
            quantityProduced: parsedInitialQuantity,
            quantityDispatched: 0,
            closingBalance: parsedInitialQuantity,
            notes: "Opening stock",
          },
        });
      }
    });
  } catch (error: unknown) {
    console.error("Prisma Error:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { error: "A finished product with this name already exists." };
    }
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return { error: `Database Error: ${message}` };
  }

  revalidatePath("/finished-products");
  redirect("/finished-products");
}

export async function dispatchFinishedProduct(formData: FormData) {
  const productId =
    ((formData.get("productId") as string | null) ??
      (formData.get("id") as string | null) ??
      "").trim();
  const variantIdRaw = (formData.get("variantId") as string | null) ?? "";
  const variantId = variantIdRaw.trim() || null;
  const quantityRaw = formData.get("quantity") as string;
  const notesRaw = (formData.get("notes") as string | null) ?? "";
  const dispatchDateRaw = (formData.get("dispatchDate") as string | null) ?? "";
  const dispatchDate = new Date(dispatchDateRaw);
  const notes = notesRaw.trim() || "Stock dispatched";

  if (!productId) return { error: "Please select a product." };

  const quantity = parseFloat(quantityRaw);

  if (isNaN(quantity) || quantity <= 0) {
    return { error: "Quantity must be greater than 0." };
  }
  if (!dispatchDateRaw || Number.isNaN(dispatchDate.getTime())) {
    return { error: "Dispatch date is required." };
  }
  if (dispatchDate.getTime() > Date.now()) {
    return { error: "Dispatch date cannot be in the future." };
  }

  const product = await prisma.finishedProduct.findFirst({
    where: { id: productId, isDeleted: false, isWaste: false },
    include: {
      variants: {
        where: { isDeleted: false },
        select: { id: true, quantityInStock: true },
      },
    },
  });

  if (!product) return { error: "Product not found." };

  if (product.unit === "PIECE" && !Number.isInteger(quantity)) {
    return { error: "Pieces must be whole numbers." };
  }

  const hasVariants = product.variants.length > 0;
  if (hasVariants && !variantId) {
    return { error: "Please select a variant." };
  }
  if (!hasVariants && variantId) {
    return { error: "Variant is not allowed for this product." };
  }

  const selectedVariant = variantId
    ? product.variants.find((variant) => variant.id === variantId)
    : null;
  if (variantId && !selectedVariant) {
    return { error: "Selected variant is invalid." };
  }

  const availableStock = selectedVariant
    ? Number(selectedVariant.quantityInStock)
    : Number(product.quantityInStock);
  if (quantity > availableStock) {
    return { error: "Dispatch quantity cannot exceed available stock." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const openingBalance = selectedVariant
        ? Number(selectedVariant.quantityInStock)
        : Number(product.quantityInStock);
      const closingBalance = openingBalance - quantity;

      if (selectedVariant) {
        const updated = await tx.finishedProductVariant.updateMany({
          where: {
            id: selectedVariant.id,
            finishedProductId: productId,
            quantityInStock: { gte: quantity },
          },
          data: { quantityInStock: { decrement: quantity } },
        });
        if (updated.count !== 1) {
          throw Object.assign(new Error("Insufficient stock"), {
            code: "INSUFFICIENT_STOCK",
          });
        }
      } else {
        const updated = await tx.finishedProduct.updateMany({
          where: { id: productId, quantityInStock: { gte: quantity } },
          data: { quantityInStock: { decrement: quantity } },
        });
        if (updated.count !== 1) {
          throw Object.assign(new Error("Insufficient stock"), {
            code: "INSUFFICIENT_STOCK",
          });
        }
      }

      await tx.finishedProduct.update({
        where: { id: productId },
        data: {
          lastDispatchedAt: dispatchDate,
          lastDispatchedQuantity: quantity,
        },
      });

      await tx.finishedProductLedger.create({
        data: {
          finishedProductId: productId,
          finishedProductVariantId: selectedVariant?.id ?? null,
          date: dispatchDate,
          eventType: "DISPATCH",
          openingBalance,
          quantityProduced: 0,
          quantityDispatched: quantity,
          closingBalance,
          notes,
        },
      });

      await rebuildFinishedProductLedgerBalances(
        productId,
        tx,
        selectedVariant?.id ?? null
      );
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_STOCK"
    ) {
      return { error: "Dispatch quantity cannot exceed available stock." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return { error: "Product not found." };
    }
    return { error: "Failed to dispatch stock." };
  }

  revalidatePath("/finished-products");
  redirect("/finished-products");
}

type DispatchFinishedGoodsBatchInput = {
  dispatchDate: string;
  notes?: string;
  items: Array<{
    finishedGoodId: string;
    quantity: number;
  }>;
};

export async function dispatchFinishedGoodsBatch(
  input: DispatchFinishedGoodsBatchInput
): Promise<{ error: string } | void> {
  const dispatchDate = new Date(input.dispatchDate);
  const ledgerNotes = input.notes?.trim() ? input.notes.trim() : "Goods dispatched";

  if (!input.items?.length) {
    return { error: "Add at least one line." };
  }
  if (!input.dispatchDate || Number.isNaN(dispatchDate.getTime())) {
    return { error: "Dispatch date is required." };
  }
  if (dispatchDate.getTime() > Date.now()) {
    return { error: "Dispatch date cannot be in the future." };
  }
  if (input.notes !== undefined && input.notes.length > 500) {
    return { error: "Notes must be at most 500 characters." };
  }

  for (const item of input.items) {
    if (!item.finishedGoodId?.trim()) {
      return { error: "Each line must have a finished good selected." };
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: "Quantity must be greater than 0 for all lines." };
    }
  }

  type ParsedRow = {
    productId: string;
    variantId: string | null;
    quantity: number;
  };

  const parsed: ParsedRow[] = [];

  for (const item of input.items) {
    const fid = item.finishedGoodId.trim();
    if (fid.startsWith("p:")) {
      const productId = fid.slice(2);
      if (!productId) {
        return { error: "Invalid line item." };
      }
      parsed.push({ productId, variantId: null, quantity: item.quantity });
    } else if (fid.startsWith("v:")) {
      const variantId = fid.slice(2);
      if (!variantId) {
        return { error: "Invalid line item." };
      }
      const v = await prisma.finishedProductVariant.findFirst({
        where: {
          id: variantId,
          isDeleted: false,
          finishedProduct: { isDeleted: false, isWaste: false },
        },
        select: { finishedProductId: true },
      });
      if (!v) {
        return { error: "One or more selected items are invalid." };
      }
      parsed.push({
        productId: v.finishedProductId,
        variantId,
        quantity: item.quantity,
      });
    } else {
      return { error: "Invalid line item." };
    }
  }

  for (const row of parsed) {
    const product = await prisma.finishedProduct.findFirst({
      where: { id: row.productId, isDeleted: false, isWaste: false },
      include: {
        variants: { where: { isDeleted: false }, select: { id: true, quantityInStock: true } },
      },
    });
    if (!product) {
      return { error: "Product not found." };
    }

    const hasVariants = product.variants.length > 0;
    if (hasVariants && !row.variantId) {
      return { error: "One or more products require a variant selection." };
    }
    if (!hasVariants && row.variantId) {
      return { error: "Invalid line item." };
    }

    if (row.variantId) {
      const sv = product.variants.find((v) => v.id === row.variantId);
      if (!sv) {
        return { error: "Invalid variant." };
      }
      const stock = Number(sv.quantityInStock);
      if (row.quantity > stock) {
        return { error: "Dispatch quantity cannot exceed available stock." };
      }
      if (product.unit === "PIECE" && !Number.isInteger(row.quantity)) {
        return { error: "Pieces must be whole numbers." };
      }
    } else {
      const stock = Number(product.quantityInStock);
      if (row.quantity > stock) {
        return { error: "Dispatch quantity cannot exceed available stock." };
      }
      if (product.unit === "PIECE" && !Number.isInteger(row.quantity)) {
        return { error: "Pieces must be whole numbers." };
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of parsed) {
        const product = await tx.finishedProduct.findFirstOrThrow({
          where: { id: row.productId, isDeleted: false, isWaste: false },
          include: {
            variants: { where: { isDeleted: false }, select: { id: true, quantityInStock: true } },
          },
        });

        const selectedVariant = row.variantId
          ? product.variants.find((v) => v.id === row.variantId) ?? null
          : null;
        if (row.variantId && !selectedVariant) {
          throw Object.assign(new Error("Not found"), { code: "P2025" });
        }

        const openingBalance = selectedVariant
          ? Number(selectedVariant.quantityInStock)
          : Number(product.quantityInStock);
        const closingBalance = openingBalance - row.quantity;

        if (selectedVariant) {
          const updated = await tx.finishedProductVariant.updateMany({
            where: {
              id: selectedVariant.id,
              finishedProductId: row.productId,
              quantityInStock: { gte: row.quantity },
            },
            data: { quantityInStock: { decrement: row.quantity } },
          });
          if (updated.count !== 1) {
            throw Object.assign(new Error("Insufficient stock"), {
              code: "INSUFFICIENT_STOCK",
            });
          }
        } else {
          const updated = await tx.finishedProduct.updateMany({
            where: { id: row.productId, quantityInStock: { gte: row.quantity } },
            data: { quantityInStock: { decrement: row.quantity } },
          });
          if (updated.count !== 1) {
            throw Object.assign(new Error("Insufficient stock"), {
              code: "INSUFFICIENT_STOCK",
            });
          }
        }

        await tx.finishedProduct.update({
          where: { id: row.productId },
          data: {
            lastDispatchedAt: dispatchDate,
            lastDispatchedQuantity: row.quantity,
          },
        });

        await tx.finishedProductLedger.create({
          data: {
            finishedProductId: row.productId,
            finishedProductVariantId: selectedVariant?.id ?? null,
            date: dispatchDate,
            eventType: "DISPATCH",
            openingBalance,
            quantityProduced: 0,
            quantityDispatched: row.quantity,
            closingBalance,
            notes: ledgerNotes,
          },
        });

        await rebuildFinishedProductLedgerBalances(
          row.productId,
          tx,
          selectedVariant?.id ?? null
        );
      }
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_STOCK"
    ) {
      return { error: "Dispatch quantity cannot exceed available stock." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return { error: "Product not found." };
    }
    return { error: "Failed to dispatch stock." };
  }

  revalidatePath("/finished-products");
  revalidatePath("/finished-products/dispatch");
  redirect("/finished-products");
}

type WasteRangeInput = {
  wasteTypeId: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
};

type WasteReportRow = {
  dateISO: string;
  dateLabel: string;
  opening: number;
  added: number;
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

const IST_OFFSET_MS = 330 * 60 * 1000;

function toISTDateKey(utcDate: Date) {
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().slice(0, 10);
}

function getISTRange(fromMonth: number, fromYear: number, toMonth: number, toYear: number) {
  const dbStart = new Date(Date.UTC(fromYear, fromMonth - 1, 1) - IST_OFFSET_MS);
  const dbEnd = new Date(Date.UTC(toYear, toMonth, 1) - IST_OFFSET_MS - 1);
  const uiStart = new Date(fromYear, fromMonth - 1, 1);
  const uiEnd = new Date(toYear, toMonth, 0);
  return { dbStart, dbEnd, uiStart, uiEnd };
}

function formatDateLabelFromISO(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export async function getWasteTypes() {
  await ensureDefaultWasteType();

  const wasteTypes = await prisma.finishedProduct.findMany({
    where: { isDeleted: false, isWaste: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, quantityInStock: true },
  });

  return wasteTypes.map((item) => ({
    id: item.id,
    name: item.name,
    quantityInStock: Number(item.quantityInStock),
  }));
}

export async function getWasteTypesWithVariants() {
  await ensureDefaultWasteType();

  const wasteTypes = await prisma.finishedProduct.findMany({
    where: { isDeleted: false, isWaste: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      variants: {
        where: { isDeleted: false },
        orderBy: [{ weightInGrams: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      },
    },
  });

  return wasteTypes.map((w) => ({
    id: w.id,
    name: w.name,
    variantCount: w.variants.length,
    variants: w.variants,
  }));
}

export async function createWasteType(name: string): Promise<{ error?: string; success?: true }> {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return { error: "Name is required." };
  }

  const existing = await prisma.finishedProduct.findFirst({
    where: {
      isDeleted: false,
      isWaste: true,
      name: { equals: normalizedName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return { error: "A waste type with this name already exists." };
  }

  try {
    await prisma.finishedProduct.create({
      data: {
        name: normalizedName,
        isWaste: true,
        unit: "KG",
      },
    });
  } catch {
    return { error: "Failed to create waste type." };
  }

  revalidatePath("/finished-products/waste");
  revalidatePath("/finished-products/waste/manage");
  return { success: true };
}

export async function createWasteVariant(input: {
  wasteTypeId: string;
  name: string;
}): Promise<{ error?: string; success?: true }> {
  const wasteTypeId = input.wasteTypeId.trim();
  const variantName = input.name.trim();

  if (!wasteTypeId) {
    return { error: "Waste type is required." };
  }
  if (!variantName) {
    return { error: "Variant name is required." };
  }

  const wasteType = await prisma.finishedProduct.findFirst({
    where: { id: wasteTypeId, isDeleted: false, isWaste: true },
    select: { id: true },
  });
  if (!wasteType) {
    return { error: "Waste type not found." };
  }

  const duplicate = await prisma.finishedProductVariant.findFirst({
    where: {
      finishedProductId: wasteTypeId,
      isDeleted: false,
      name: { equals: variantName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { error: "A variant with this name already exists for this waste type." };
  }

  try {
    await prisma.finishedProductVariant.create({
      data: {
        finishedProductId: wasteTypeId,
        name: variantName,
        weightInGrams: 1000,
        quantityInStock: 0,
      },
    });
  } catch {
    return { error: "Failed to create waste variant." };
  }

  revalidatePath("/finished-products/waste/manage");
  return { success: true };
}

export async function getWasteReportRange(input: WasteRangeInput): Promise<WasteReportRow[]> {
  await ensureDefaultWasteType();

  const wasteTypeId = input.wasteTypeId;
  const fromMonth = Number(input.fromMonth);
  const fromYear = Number(input.fromYear);
  const toMonth = Number(input.toMonth);
  const toYear = Number(input.toYear);

  const { dbStart, dbEnd, uiStart, uiEnd } = getISTRange(
    fromMonth,
    fromYear,
    toMonth,
    toYear
  );
  const now = new Date();

  if (!wasteTypeId) return [];
  if (dbEnd.getTime() < dbStart.getTime()) return [];

  const wasteType = await prisma.finishedProduct.findFirst({
    where: { id: wasteTypeId, isDeleted: false, isWaste: true },
    select: { quantityInStock: true },
  });
  if (!wasteType) return [];

  const currentStock = round2(Number(wasteType.quantityInStock));

  const [addedInRange, dispatchedInRange, addedAfter, dispatchedAfter] = await Promise.all([
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: wasteTypeId,
        eventType: "RECEIPT",
        date: { gte: dbStart, lte: dbEnd },
      },
      select: { date: true, quantityProduced: true },
    }),
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: wasteTypeId,
        eventType: "DISPATCH",
        date: { gte: dbStart, lte: dbEnd },
      },
      select: { date: true, quantityDispatched: true },
    }),
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: wasteTypeId,
        eventType: "RECEIPT",
        date: { gt: dbEnd, lte: now },
      },
      select: { quantityProduced: true },
    }),
    prisma.finishedProductLedger.findMany({
      where: {
        finishedProductId: wasteTypeId,
        eventType: "DISPATCH",
        date: { gt: dbEnd, lte: now },
      },
      select: { quantityDispatched: true },
    }),
  ]);

  const dailyAdded: Record<string, number> = {};
  const dailyDispatch: Record<string, number> = {};

  for (const p of addedInRange) {
    const key = toISTDateKey(p.date);
    dailyAdded[key] = round2((dailyAdded[key] ?? 0) + Number(p.quantityProduced));
  }
  for (const d of dispatchedInRange) {
    const key = toISTDateKey(d.date);
    dailyDispatch[key] = round2(
      (dailyDispatch[key] ?? 0) + Number(d.quantityDispatched)
    );
  }

  const addedInRangeTotal = round2(
    addedInRange.reduce((sum, p) => sum + Number(p.quantityProduced), 0)
  );
  const dispatchedInRangeTotal = round2(
    dispatchedInRange.reduce((sum, p) => sum + Number(p.quantityDispatched), 0)
  );
  const addedAfterTotal = round2(
    addedAfter.reduce((sum, p) => sum + Number(p.quantityProduced), 0)
  );
  const dispatchedAfterTotal = round2(
    dispatchedAfter.reduce((sum, p) => sum + Number(p.quantityDispatched), 0)
  );

  const stockAtEnd = round2(currentStock - addedAfterTotal + dispatchedAfterTotal);
  let opening = round2(stockAtEnd - addedInRangeTotal + dispatchedInRangeTotal);

  const rows: WasteReportRow[] = [];
  for (
    let d = new Date(uiStart);
    d <= uiEnd;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const dateKey = toISODateKeyLocal(d);
    const added = dailyAdded[dateKey] ?? 0;
    const dispatched = dailyDispatch[dateKey] ?? 0;
    const closing = round2(opening + added - dispatched);

    rows.push({
      dateISO: dateKey,
      dateLabel: formatDateLabelFromISO(dateKey),
      opening,
      added,
      dispatched,
      closing,
    });

    opening = closing;
  }

  return rows;
}

type WasteEntryInput = {
  date: string;
  wasteTypeId: string;
  quantity: number;
  notes?: string;
};

export async function createWasteEntry(input: WasteEntryInput) {
  await ensureDefaultWasteType();

  const date = new Date(input.date);
  if (!input.wasteTypeId) return { error: "Please select a waste type." };
  if (!input.date || Number.isNaN(date.getTime())) return { error: "Date is required." };
  if (date.getTime() > Date.now()) return { error: "Date cannot be in the future." };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be greater than 0." };
  }

  const notes = input.notes?.trim() || "Waste added";

  try {
    await prisma.$transaction(async (tx) => {
      const wasteType = await tx.finishedProduct.findFirstOrThrow({
        where: { id: input.wasteTypeId, isWaste: true, isDeleted: false },
      });

      const opening = Number(wasteType.quantityInStock);
      const closing = opening + input.quantity;

      await tx.finishedProduct.update({
        where: { id: input.wasteTypeId },
        data: {
          quantityInStock: closing,
        },
      });

      await tx.finishedProductLedger.create({
        data: {
          finishedProductId: input.wasteTypeId,
          date,
          eventType: "RECEIPT",
          openingBalance: opening,
          quantityProduced: input.quantity,
          quantityDispatched: 0,
          closingBalance: closing,
          notes,
        },
      });
    });
  } catch {
    return { error: "Failed to add waste entry." };
  }

  revalidatePath("/finished-products/waste");
  revalidatePath("/finished-products");
  return { success: true };
}

type DispatchWasteInput = {
  date: string;
  wasteTypeId: string;
  quantity: number;
  notes?: string;
};

export async function dispatchWaste(input: DispatchWasteInput) {
  await ensureDefaultWasteType();

  const date = new Date(input.date);
  if (!input.wasteTypeId) return { error: "Please select a waste type." };
  if (!input.date || Number.isNaN(date.getTime())) return { error: "Date is required." };
  if (date.getTime() > Date.now()) return { error: "Date cannot be in the future." };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be greater than 0." };
  }

  const notes = input.notes?.trim() || "Waste dispatched";

  try {
    await prisma.$transaction(async (tx) => {
      const wasteType = await tx.finishedProduct.findFirstOrThrow({
        where: { id: input.wasteTypeId, isWaste: true, isDeleted: false },
      });

      const opening = Number(wasteType.quantityInStock);
      if (input.quantity > opening) {
        throw Object.assign(new Error("Insufficient stock"), { code: "INSUFFICIENT_STOCK" });
      }

      const closing = opening - input.quantity;

      await tx.finishedProduct.update({
        where: { id: input.wasteTypeId },
        data: {
          quantityInStock: closing,
          lastDispatchedAt: date,
          lastDispatchedQuantity: input.quantity,
        },
      });

      await tx.finishedProductLedger.create({
        data: {
          finishedProductId: input.wasteTypeId,
          date,
          eventType: "DISPATCH",
          openingBalance: opening,
          quantityProduced: 0,
          quantityDispatched: input.quantity,
          closingBalance: closing,
          notes,
        },
      });
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INSUFFICIENT_STOCK"
    ) {
      return { error: "Dispatch quantity cannot exceed available stock." };
    }
    return { error: "Failed to dispatch waste." };
  }

  revalidatePath("/finished-products/waste");
  revalidatePath("/finished-products");
  return { success: true };
}

export async function getAllFinishedProducts() {
  const products = await prisma.finishedProduct.findMany({
    where: { isDeleted: false, isWaste: false },
    include: {
      variants: {
        where: { isDeleted: false },
        select: { id: true, name: true, weightInGrams: true, quantityInStock: true },
        orderBy: [{ weightInGrams: "asc" }, { name: "asc" }],
      },
      ledgerEntries: {
        where: {
          eventType: "DISPATCH",
          OR: [
            { finishedProductVariantId: null },
            { finishedProductVariant: { isDeleted: false } },
          ],
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { date: true, quantityDispatched: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => {
    const variants = p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      weightInGrams: Number(v.weightInGrams),
      quantityInStock: Number(v.quantityInStock),
    }));
    const quantityInStock = Number(p.quantityInStock);
    const aggregateStock =
      variants.length > 0
        ? variants.reduce((sum, variant) => sum + variant.quantityInStock, 0)
        : quantityInStock;

    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      quantityInStock,
      weightPerPiece: p.weightPerPiece != null ? Number(p.weightPerPiece) : null,
      aggregateStock,
      isDeleted: p.isDeleted,
      deletedAt: p.deletedAt,
      lastDispatchedAt: p.ledgerEntries[0]?.date ?? null,
      lastDispatchedQuantity: p.ledgerEntries[0]
        ? Number(p.ledgerEntries[0].quantityDispatched)
        : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      variants,
    };
  });
}

export async function getFinishedProductById(id: string) {
  const product = await prisma.finishedProduct.findFirst({
    where: { id, isDeleted: false, isWaste: false },
    include: {
      variants: {
        where: { isDeleted: false },
        select: { id: true, name: true, weightInGrams: true, quantityInStock: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
    quantityInStock: Number(product.quantityInStock),
    weightPerPiece: product.weightPerPiece != null ? Number(product.weightPerPiece) : null,
    lastDispatchedQuantity: product.lastDispatchedQuantity
      ? Number(product.lastDispatchedQuantity)
      : null,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      weightInGrams: Number(variant.weightInGrams),
      quantityInStock: Number(variant.quantityInStock),
    })),
  };
}

export async function updateFinishedProduct(id: string, formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const variants = parseVariantsInput(formData.get("variants"));
  const stockDistribution = parseStockDistributionInput(
    formData.get("stockDistribution")
  );

  if (!name) {
    return { error: "Name is required." };
  }

  const existingActiveProduct = await prisma.finishedProduct.findFirst({
    where: {
      id: { not: id },
      name: { equals: name, mode: "insensitive" },
      isDeleted: false,
      isWaste: false,
    },
    select: { id: true },
  });
  if (existingActiveProduct) {
    return { error: "A product with this name already exists." };
  }

  const productMeta = await prisma.finishedProduct.findFirst({
    where: { id, isDeleted: false, isWaste: false },
    select: { unit: true },
  });
  if (!productMeta) {
    return { error: "Selected finished product no longer exists." };
  }

  const keptOrCreated = variants.filter((v) => !v._delete);
  const existingVariantRowCount = await prisma.finishedProductVariant.count({
    where: { finishedProductId: id, isDeleted: false },
  });
  const isMigrationScenarioPreview =
    existingVariantRowCount === 0 && keptOrCreated.length > 0;

  const names = new Set<string>();
  for (const variant of keptOrCreated) {
    if (!variant.name) {
      return { error: "Variant name is required for all variant rows." };
    }
    if (!Number.isFinite(variant.weightInGrams) || variant.weightInGrams <= 0) {
      return { error: "Variant weight must be greater than 0 grams." };
    }
    if (!variant.id && !isMigrationScenarioPreview) {
      const iq = variant.initialQuantity ?? Number.NaN;
      if (!Number.isFinite(iq) || iq < 0) {
        return {
          error: "Variant initial quantity must be greater than or equal to 0.",
        };
      }
      if (productMeta.unit === "PIECE" && !Number.isInteger(iq)) {
        return { error: "Pieces must be whole numbers." };
      }
    }
    const normalized = variant.name.toLowerCase();
    if (names.has(normalized)) {
      return { error: "Duplicate variant names are not allowed." };
    }
    names.add(normalized);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingProduct = await tx.finishedProduct.findUnique({
        where: { id },
        select: { id: true, unit: true, quantityInStock: true },
      });
      if (!existingProduct) {
        throw Object.assign(new Error("Not found"), { code: "P2025" });
      }
      const existingVariants = await tx.finishedProductVariant.findMany({
        where: { finishedProductId: id },
        select: { id: true },
      });
      const isMigrationScenario =
        existingVariants.length === 0 && keptOrCreated.length > 0;

      await tx.finishedProduct.update({ where: { id }, data: { name } });

      if (isMigrationScenario) {
        const parentStock = Number(existingProduct.quantityInStock);
        const distributionMap = new Map<string, number>();
        for (const row of stockDistribution) {
          if (!row.variantTempKeyOrId) continue;
          distributionMap.set(row.variantTempKeyOrId, row.allocatedQuantity);
        }

        const migrationTargets = keptOrCreated.map((variant) => {
          const key = variant.id ?? variant.clientKey;
          if (!key) {
            throw Object.assign(new Error("Missing variant mapping key"), {
              code: "INVALID_STOCK_DISTRIBUTION",
            });
          }
          const allocated = distributionMap.get(key);
          if (allocated === undefined) {
            throw Object.assign(new Error("Missing stock allocation"), {
              code: "INVALID_STOCK_DISTRIBUTION",
            });
          }
          if (!Number.isFinite(allocated) || allocated < 0) {
            throw Object.assign(new Error("Invalid allocated quantity"), {
              code: "INVALID_STOCK_DISTRIBUTION",
            });
          }
          if (existingProduct.unit === "PIECE" && !Number.isInteger(allocated)) {
            throw Object.assign(new Error("Pieces must be whole numbers."), {
              code: "INVALID_STOCK_DISTRIBUTION",
            });
          }
          return {
            id: variant.id,
            name: variant.name,
            weightInGrams: variant.weightInGrams,
            allocatedQuantity: allocated,
          };
        });

        const allocatedTotal = toTwoDecimals(
          migrationTargets.reduce((sum, row) => sum + row.allocatedQuantity, 0)
        );
        if (toTwoDecimals(parentStock) !== allocatedTotal) {
          throw Object.assign(
            new Error("Total allocated quantity must equal existing stock."),
            { code: "INVALID_STOCK_DISTRIBUTION" }
          );
        }

        for (const target of migrationTargets) {
          let variantId = target.id;
          if (variantId) {
            await tx.finishedProductVariant.update({
              where: { id: variantId },
              data: {
                name: target.name,
                weightInGrams: target.weightInGrams,
                quantityInStock: target.allocatedQuantity,
              },
            });
          } else {
            const created = await tx.finishedProductVariant.create({
              data: {
                finishedProductId: id,
                name: target.name,
                weightInGrams: target.weightInGrams,
                quantityInStock: target.allocatedQuantity,
              },
            });
            variantId = created.id;
          }

          if (target.allocatedQuantity > 0) {
            // ISOLATION: always scoped by finishedProductId (ID, not name)
            // Soft-deleted products with same name are separate records
            await tx.finishedProductLedger.create({
              data: {
                finishedProductId: id,
                finishedProductVariantId: variantId,
                openingBalance: 0,
                quantityProduced: target.allocatedQuantity,
                quantityDispatched: 0,
                closingBalance: target.allocatedQuantity,
                notes: "Opening stock migrated from base product",
              },
            });
          }
        }

        await tx.finishedProduct.update({
          where: { id },
          data: { quantityInStock: 0 },
        });
        return;
      }

      for (const variant of variants) {
        if (variant._delete === true) {
          if (!variant.id) continue;
          const existing = await tx.finishedProductVariant.findUnique({
            where: { id: variant.id },
            select: { id: true, finishedProductId: true, quantityInStock: true },
          });
          if (!existing || existing.finishedProductId !== id) continue;
          if (Number(existing.quantityInStock) > 0) {
            throw Object.assign(
              new Error("Cannot remove variant with existing stock"),
              { code: "VARIANT_STOCK_EXISTS" }
            );
          }
          await tx.finishedProductVariant.delete({ where: { id: variant.id } });
          continue;
        }

        if (variant.id) {
          await tx.finishedProductVariant.update({
            where: { id: variant.id },
            data: {
              name: variant.name,
              weightInGrams: variant.weightInGrams,
            },
          });
          continue;
        }

        const initialQty = toTwoDecimals(
          Number.isFinite(variant.initialQuantity) && variant.initialQuantity! >= 0
            ? variant.initialQuantity!
            : 0
        );
        const createdVariant = await tx.finishedProductVariant.create({
          data: {
            finishedProductId: id,
            name: variant.name,
            weightInGrams: variant.weightInGrams,
            quantityInStock: initialQty,
          },
        });

        if (initialQty > 0) {
          // ISOLATION: always scoped by finishedProductId (ID, not name)
          // Soft-deleted products with same name are separate records
          await tx.finishedProductLedger.create({
            data: {
              finishedProductId: id,
              finishedProductVariantId: createdVariant.id,
              eventType: "OPENING_STOCK",
              openingBalance: 0,
              quantityProduced: initialQty,
              quantityDispatched: 0,
              closingBalance: initialQty,
              notes: "Opening stock",
            },
          });
        }
      }
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INVALID_STOCK_DISTRIBUTION"
    ) {
      return { error: "Total allocated quantity must equal existing stock." };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "VARIANT_STOCK_EXISTS"
    ) {
      return { error: "Cannot remove variant with existing stock" };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { error: "A finished product with this name already exists." };
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return { error: "Selected finished product no longer exists." };
    }

    return { error: "Failed to update finished product." };
  }

  revalidatePath("/finished-products");
  redirect("/finished-products");
}

export async function getFinishedProductLedger(id: string, variantId?: string) {
  const product = await prisma.finishedProduct.findFirst({
    where: { id, isDeleted: false, isWaste: false },
    select: { id: true },
  });
  if (!product) return [];

  // ISOLATION: always scoped by finishedProductId (ID, not name)
  // Soft-deleted products with same name are separate records
  const entries = await prisma.finishedProductLedger.findMany({
    where: {
      finishedProductId: id,
      ...(variantId ? { finishedProductVariantId: variantId } : {}),
    },
    include: { finishedProductVariant: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    eventType: entry.eventType,
    openingBalance: Number(entry.openingBalance),
    quantityProduced: Number(entry.quantityProduced),
    quantityDispatched: Number(entry.quantityDispatched),
    closingBalance: Number(entry.closingBalance),
    notes: entry.notes,
    ...(variantId
      ? {}
      : {
          variantName: entry.finishedProductVariant?.name || "Base Product",
        }),
  }));
}

export async function getFinishedProductVariants(productId: string) {
  const variants = await prisma.finishedProductVariant.findMany({
    where: {
      finishedProductId: productId,
      isDeleted: false,
      finishedProduct: { isWaste: false, isDeleted: false },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      weightInGrams: true,
      quantityInStock: true,
    },
  });

  return variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    weightInGrams: Number(variant.weightInGrams),
    quantityInStock: Number(variant.quantityInStock),
  }));
}

export async function deleteFinishedProduct(productId: string) {
  if (!productId || productId.trim() === "") {
    return {
      error: "INVALID_PRODUCT_ID",
      message: "Invalid finished product id.",
    };
  }

  try {
    const activeWorkOrders = await prisma.workOrder.findMany({
      where: {
        finishedProductId: productId,
        status: "OPEN",
      },
      select: {
        id: true,
        workOrderName: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (activeWorkOrders.length > 0) {
      return {
        error: "ACTIVE_WORK_ORDERS",
        message:
          "This product has active work orders. Please complete or delete them before deleting this product.",
        workOrders: activeWorkOrders.map((wo) => ({
          id: wo.id,
          workOrderName: wo.workOrderName,
          status: wo.status,
        })),
      };
    }

    await prisma.$transaction(async (tx) => {
      const deletedAt = new Date();

      await tx.finishedProductVariant.updateMany({
        where: { finishedProductId: productId },
        data: {
          isDeleted: true,
          deletedAt,
        },
      });

      // ISOLATION: always scoped by finishedProductId (ID, not name)
      // Soft-deleted products with same name are separate records
      await tx.finishedProductLedger.deleteMany({
        where: { finishedProductId: productId },
      });

      const updatedProduct = await tx.finishedProduct.updateMany({
        where: { id: productId, isWaste: false },
        data: {
          isDeleted: true,
          deletedAt,
        },
      });

      if (updatedProduct.count !== 1) {
        throw Object.assign(new Error("Finished product not found."), {
          code: "P2025",
        });
      }

      await tx.workOrder.updateMany({
        where: {
          finishedProductId: productId,
          status: { in: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          finishedProductId: null,
        },
      });
    });

    revalidatePath("/finished-products");
    revalidatePath("/finished-products/dispatch");
    revalidatePath("/production");
    return { success: true };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return {
        error: "PRODUCT_NOT_FOUND",
        message: "Finished product not found.",
      };
    }

    return {
      error: "DELETE_FAILED",
      message: "Failed to delete finished product.",
    };
  }
}

export async function checkActiveWorkOrders(productId: string) {
  if (!productId || productId.trim() === "") return [];

  const workOrders = await prisma.workOrder.findMany({
    where: {
      finishedProductId: productId,
      status: "OPEN",
    },
    select: {
      id: true,
      workOrderName: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return workOrders.map((wo) => ({
    id: wo.id,
    workOrderName: wo.workOrderName,
  }));
}

export async function debugFinishedProductVisibility(productId: string) {
  if (!productId || productId.trim() === "") {
    return {
      productExists: false,
      isDeleted: null,
      variantsTotal: 0,
      variantsNotDeleted: 0,
    };
  }

  const product = await prisma.finishedProduct.findUnique({
    where: { id: productId },
    select: { id: true, isDeleted: true, isWaste: true },
  });
  const [variantsTotal, variantsNotDeleted] = await Promise.all([
    prisma.finishedProductVariant.count({ where: { finishedProductId: productId } }),
    prisma.finishedProductVariant.count({
      where: { finishedProductId: productId, isDeleted: false },
    }),
  ]);

  return {
    productExists: Boolean(product),
    isDeleted: product ? product.isDeleted : null,
    isWaste: product ? product.isWaste : null,
    variantsTotal,
    variantsNotDeleted,
  };
}