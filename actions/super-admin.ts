"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthSession, hashPassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireSuperAdmin() {
  const session = await getAuthSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden");
  }
  return session;
}

export async function getCompanies() {
  await requireSuperAdmin();

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      industry: true,
      phone: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: { users: true },
      },
    },
  });

  return companies.map((company) => ({
    ...company,
    companyId: company.id,
  }));
}

export async function getCompanyById(companyId: string) {
  await requireSuperAdmin();

  return prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      industry: true,
      phone: true,
      address: true,
      isActive: true,
      createdAt: true,
    },
  });
}

type CreateCompanyInput = {
  name: string;
  industry?: string;
  phone?: string;
  address?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export async function createCompany(data: CreateCompanyInput) {
  await requireSuperAdmin();

  const name = data.name.trim();
  const industry = data.industry?.trim() || null;
  const phone = data.phone?.trim() || null;
  const address = data.address?.trim() || null;
  const adminName = data.adminName.trim();
  const adminEmail = data.adminEmail.trim().toLowerCase();
  const adminPassword = data.adminPassword;

  if (!name) return { success: false as const, error: "Company name is required." };
  if (!adminName) return { success: false as const, error: "Admin name is required." };
  if (!adminEmail) return { success: false as const, error: "Admin email is required." };
  if (adminPassword.length < 8) {
    return { success: false as const, error: "Admin password must be at least 8 characters." };
  }

  const hashedPassword = await hashPassword(adminPassword);

  try {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          industry,
          phone,
          address,
        },
      });

      await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          password: hashedPassword,
          role: "ADMIN",
          isActive: true,
          companyId: company.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false as const, error: "Admin email already exists." };
    }
    return { success: false as const, error: "Failed to create company." };
  }

  revalidatePath("/companies");
  revalidatePath("/super-admin/companies");
  return { success: true as const };
}

export async function updateCompany(
  companyId: string,
  data: {
    name: string;
    industry?: string;
    phone?: string;
    address?: string;
    isActive: boolean;
  }
) {
  await requireSuperAdmin();

  const name = data.name.trim();
  if (!name) return { success: false as const, error: "Company name is required." };

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name,
      industry: data.industry?.trim() || null,
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      isActive: data.isActive,
    },
  });

  revalidatePath("/super-admin/companies");
  revalidatePath(`/super-admin/companies/${companyId}/edit`);
  return { success: true as const };
}

export async function getSuperAdmins() {
  await requireSuperAdmin();

  return prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      isActive: true,
    },
  });
}

export async function createSuperAdmin(data: {
  name: string;
  email: string;
  password: string;
}) {
  await requireSuperAdmin();

  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const password = data.password;

  if (!name) return { success: false as const, error: "Name is required." };
  if (!email) return { success: false as const, error: "Email is required." };
  if (password.length < 8) {
    return { success: false as const, error: "Password must be at least 8 characters." };
  }

  const hashedPassword = await hashPassword(password);

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "SUPER_ADMIN",
        isActive: true,
        companyId: null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false as const, error: "A user with this email already exists." };
    }
    return { success: false as const, error: "Failed to create super admin." };
  }

  revalidatePath("/super-admin/super-admins");
  return { success: true as const };
}

export async function impersonateCompany(companyId: string) {
  const session = await requireSuperAdmin();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    throw new Error("Company not found.");
  }

  const token = await signToken({
    userId: session.id,
    role: session.role,
    companyId: company.id,
    impersonatedCompanyId: company.id,
  });

  const cookieStore = await cookies();
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/dashboard");
}

export async function stopImpersonating() {
  const session = await requireSuperAdmin();

  const token = await signToken({
    userId: session.id,
    role: session.role,
    companyId: null,
  });

  const cookieStore = await cookies();
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/super-admin/companies");
}

export async function deleteCompany(companyId: string) {
  const session = await requireSuperAdmin();
  const actorUserId = session.id;

  try {
    await prisma.$transaction([
      prisma.workOrderRawMaterial.deleteMany({ where: { companyId } }),
      prisma.workOrder.deleteMany({ where: { companyId } }),
      prisma.productionEntry.deleteMany({ where: { companyId } }),
      prisma.productionFloorLedger.deleteMany({ where: { companyId } }),
      prisma.productionFloorStock.deleteMany({ where: { companyId } }),
      prisma.rawMaterialLedger.deleteMany({ where: { companyId } }),
      prisma.finishedProductLedger.deleteMany({ where: { companyId } }),
      prisma.finishedProductVariant.deleteMany({ where: { companyId } }),
      prisma.finishedProduct.deleteMany({ where: { companyId } }),
      prisma.rawMaterial.deleteMany({ where: { companyId } }),
      prisma.leave.deleteMany({ where: { companyId } }),
      prisma.attendance.deleteMany({ where: { companyId } }),
      prisma.employee.deleteMany({ where: { companyId } }),
      prisma.department.deleteMany({ where: { companyId } }),
      prisma.user.updateMany({
        where: { companyId },
        data: { companyId: null },
      }),
      prisma.auditLog.deleteMany({ where: { companyId } }),
      prisma.company.delete({ where: { id: companyId } }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: "COMPANY_DELETED",
        companyId: null,
        metadata: { deletedCompanyId: companyId },
      },
    });
  } catch {
    return { error: "Failed to delete company. Please try again." };
  }

  redirect("/super-admin/companies");
}
