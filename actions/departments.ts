"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

export async function getAllDepartments() {
  const departments = await prisma.department.findMany({
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
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Department name must not be empty" };
  }

  const existing = await prisma.department.findFirst({
    where: {
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
    data: { name: trimmed },
  });

  revalidatePath("/employees");
  return { success: true, department };
}

export async function deleteDepartment(id: string) {
  const departmentId = id.trim();
  if (!departmentId) {
    return { error: "Invalid department id" };
  }

  const activeEmployeesCount = await prisma.employee.count({
    where: {
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

