"use server";

import { revalidatePath } from "next/cache";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getAllDepartments() {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const departments = await prisma.department.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          employees: {
            where: {
              isDeleted: false,
              status: "ACTIVE",
            },
          },
        },
      },
    },
  });

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    activeEmployeeCount: d._count.employees,
  }));
}

export async function createDepartment(name: string) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Department name must not be empty" };
  }

  const existing = await prisma.department.findFirst({
    where: {
      companyId,
      name: {
        equals: trimmed,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (existing) {
    return { error: "Department already exists" };
  }

  const department = await prisma.department.create({
    data: { name: trimmed, companyId },
  });

  revalidatePath("/employees");
  return { success: true, department };
}

export async function deleteDepartment(id: string) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");
  const companyId = session.companyId;

  const departmentId = id.trim();
  if (!departmentId) {
    return { error: "Invalid department id" };
  }

  const existing = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, companyId: true },
  });
  if (!existing) {
    return { error: "Department not found" };
  }
  if (existing.companyId !== companyId) {
    throw new Error("Forbidden");
  }

  const activeEmployeesCount = await prisma.employee.count({
    where: {
      companyId,
      departmentId,
      isDeleted: false,
      status: "ACTIVE",
    },
  });

  if (activeEmployeesCount > 0) {
    return { error: "Cannot delete department with active employees" };
  }

  await prisma.department.delete({
    where: { id: departmentId },
  });

  revalidatePath("/employees");
  return { success: true };
}
