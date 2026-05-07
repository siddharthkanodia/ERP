"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getAuthSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isStaffRole(role: string): role is "ADMIN" | "MANAGER" | "OPERATOR" {
  return role === "ADMIN" || role === "MANAGER" || role === "OPERATOR";
}

async function requireAdminSession() {
  const session = await getAuthSession();
  if (!session?.companyId) {
    throw new Error("Unauthorized");
  }
  if (session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
  return session;
}

export async function getUsers() {
  const session = await requireAdminSession();

  return prisma.user.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function createUser(data: { name: string; email: string; role: string }) {
  const session = await requireAdminSession();

  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const role = data.role.trim().toUpperCase();

  if (!name) return { success: false as const, error: "Name is required." };
  if (!email) return { success: false as const, error: "Email is required." };
  if (!isStaffRole(role)) return { success: false as const, error: "Invalid role." };

  const hashedPassword = await hashPassword("Welcome123!");

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role as UserRole,
        isActive: true,
        companyId: session.companyId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false as const, error: "A user with this email already exists." };
    }
    return { success: false as const, error: "Failed to create user." };
  }

  revalidatePath("/settings/users");
  return { success: true as const };
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
  const session = await requireAdminSession();

  await prisma.user.updateMany({
    where: { id: userId, companyId: session.companyId },
    data: { isActive },
  });

  revalidatePath("/settings/users");
}

export async function updateUserRole(userId: string, newRole: string) {
  const session = await requireAdminSession();
  if (!isStaffRole(newRole)) throw new Error("Invalid role.");

  await prisma.user.updateMany({
    where: { id: userId, companyId: session.companyId },
    data: { role: newRole as UserRole },
  });

  revalidatePath("/settings/users");
}
