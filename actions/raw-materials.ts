"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createRawMaterial(formData: FormData) {
  const name = formData.get("name") as string;
  const rawInitialQuantity = formData.get("initialQuantity");
  const initialQuantity =
    rawInitialQuantity === null || rawInitialQuantity === ""
      ? 0
      : parseFloat(rawInitialQuantity as string);

  if (!name || name.trim() === "") {
    return { error: "Name is required." };
  }
  if (Number.isNaN(initialQuantity) || initialQuantity < 0) {
    return { error: "Initial quantity must be greater than or equal to 0." };
  }

  try {
    await prisma.rawMaterial.create({
      data: {
        name: name.trim(),
        quantityInStock: initialQuantity,
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { error: "A raw material with this name already exists." };
    }
    return { error: "Failed to create raw material." };
  }

  revalidatePath("/raw-materials");
  redirect("/raw-materials");
}

export async function receiveRawMaterial(formData: FormData) {
  const id = formData.get("id") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const receivedDateRaw = (formData.get("receivedDate") as string | null) ?? "";
  const receivedDate = new Date(receivedDateRaw);

  if (!id) return { error: "Please select a raw material." };
  if (Number.isNaN(quantity) || quantity <= 0) {
    return { error: "Quantity must be greater than 0." };
  }
  if (!receivedDateRaw || Number.isNaN(receivedDate.getTime())) {
    return { error: "Received date is required." };
  }
  if (receivedDate.getTime() > Date.now()) {
    return { error: "Received date cannot be in the future." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.findUnique({
        where: { id },
        select: { quantityInStock: true },
      });

      if (!material) {
        throw Object.assign(new Error("Not found"), { code: "P2025" });
      }

      const openingBalance = Number(material.quantityInStock);
      const closingBalance = openingBalance + quantity;

      await tx.rawMaterial.update({
        where: { id },
        data: {
          quantityInStock: { increment: quantity },
          lastReceivedAt: receivedDate,
          lastReceivedQuantity: quantity,
        },
      });

      await tx.rawMaterialLedger.create({
        data: {
          rawMaterialId: id,
          date: receivedDate,
          openingBalance,
          quantityIn: quantity,
          quantityOut: 0,
          closingBalance,
          notes: "Stock received",
        },
      });
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return { error: "Selected raw material no longer exists." };
    }

    return { error: "Failed to receive stock." };
  }

  revalidatePath("/raw-materials");
  redirect("/raw-materials");
}

export async function getAllRawMaterials() {
  const materials = await prisma.rawMaterial.findMany({
    orderBy: { name: "asc" },
  });

  return materials.map((m) => ({
    ...m,
    quantityInStock: Number(m.quantityInStock),
    lastReceivedQuantity: m.lastReceivedQuantity
      ? Number(m.lastReceivedQuantity)
      : null,
  }));
}

export async function getRawMaterialById(id: string) {
  const material = await prisma.rawMaterial.findUnique({
    where: { id },
  });

  if (!material) return null;

  return {
    ...material,
    quantityInStock: Number(material.quantityInStock),
    lastReceivedQuantity: material.lastReceivedQuantity
      ? Number(material.lastReceivedQuantity)
      : null,
  };
}

export async function updateRawMaterial(id: string, formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    await prisma.rawMaterial.update({
      where: { id },
      data: {
        name,
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { error: "A raw material with this name already exists." };
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return { error: "Selected raw material no longer exists." };
    }

    return { error: "Failed to update raw material." };
  }

  revalidatePath("/raw-materials");
  redirect("/raw-materials");
}

export async function getRawMaterialLedger(id: string) {
  const entries = await prisma.rawMaterialLedger.findMany({
    where: { rawMaterialId: id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    openingBalance: Number(entry.openingBalance),
    quantityIn: Number(entry.quantityIn),
    quantityOut: Number(entry.quantityOut),
    closingBalance: Number(entry.closingBalance),
    notes: entry.notes,
  }));
}