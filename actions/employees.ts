"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

type EmploymentType = "PERMANENT" | "DAILY";
type EmployeeStatus = "ACTIVE" | "INACTIVE";
type LeaveType = "CASUAL" | "SICK" | "UNPAID" | "OTHER";

export type CreateEmployeeInput = {
  name: string;
  phone?: string | null;
  employmentType: EmploymentType;
  monthlySalary: number | null;
  dailyWage: number | null;
  hireDate: Date | string;
  departmentId: string;
  status?: EmployeeStatus;
};

export type UpdateEmployeeInput = {
  name: string;
  phone?: string | null;
  employmentType: EmploymentType;
  monthlySalary: number | null;
  dailyWage: number | null;
  hireDate: Date | string;
  departmentId: string;
  status?: EmployeeStatus;
};

export type CreateLeaveInput = {
  employeeId: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  reason?: string;
  notes?: string;
};

function toDateOrNull(value: Date | string): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toDateOnlyUTC(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function diffDaysInclusiveUTC(start: Date, end: Date) {
  const startMs = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endMs = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diffMs = endMs - startMs;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

function validateEmployeeInput(
  data: Omit<CreateEmployeeInput, "status"> & { status?: EmployeeStatus }
): string | null {
  const name = (data.name ?? "").trim();
  if (!name) return "Employee name must not be empty.";

  const departmentId = (data.departmentId ?? "").trim();
  if (!departmentId) return "Department id is required.";

  const hireDate = toDateOrNull(data.hireDate);
  if (!hireDate) return "Invalid hire date.";
  if (hireDate.getTime() > Date.now()) return "Hire date cannot be in the future.";

  if (data.employmentType === "PERMANENT") {
    const ms = data.monthlySalary;
    if (!Number.isFinite(ms) || (ms ?? 0) <= 0) {
      return "Monthly salary must be greater than 0 for PERMANENT employees.";
    }
  }

  if (data.employmentType === "DAILY") {
    const dw = data.dailyWage;
    if (!Number.isFinite(dw) || (dw ?? 0) <= 0) {
      return "Daily wage must be greater than 0 for DAILY employees.";
    }
  }

  return null;
}

export async function getAllEmployees() {
  const employees = await prisma.employee.findMany({
    where: { isDeleted: false },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    phone: e.phone,
    employmentType: e.employmentType as EmploymentType,
    status: e.status as EmployeeStatus,
    monthlySalary: e.monthlySalary != null ? Number(e.monthlySalary) : null,
    dailyWage: e.dailyWage != null ? Number(e.dailyWage) : null,
    hireDate: e.hireDate,
    departmentId: e.departmentId,
    department: e.department,
  }));
}

export async function getEmployeeById(id: string) {
  const employeeId = id.trim();
  if (!employeeId) return null;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, isDeleted: false },
    include: { department: true },
  });

  if (!employee) return null;
  return {
    id: employee.id,
    name: employee.name,
    phone: employee.phone,
    employmentType: employee.employmentType as EmploymentType,
    status: employee.status as EmployeeStatus,
    monthlySalary: employee.monthlySalary != null ? Number(employee.monthlySalary) : null,
    dailyWage: employee.dailyWage != null ? Number(employee.dailyWage) : null,
    hireDate: employee.hireDate,
    departmentId: employee.departmentId,
    department: { id: employee.department.id, name: employee.department.name },
    isDeleted: employee.isDeleted,
    deletedAt: employee.deletedAt,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

export async function createEmployee(data: CreateEmployeeInput) {
  const name = (data.name ?? "").trim();
  const trimmedDepartmentId = (data.departmentId ?? "").trim();
  const hireDate = toDateOrNull(data.hireDate);

  if (!hireDate) {
    return { error: "Invalid hire date." };
  }

  const validationError = validateEmployeeInput(
    {
      ...data,
      name,
      departmentId: trimmedDepartmentId,
      hireDate,
    }
  );
  if (validationError) return { error: validationError };

  const department = await prisma.department.findFirst({
    where: { id: trimmedDepartmentId },
    select: { id: true },
  });
  if (!department) {
    return { error: "Department does not exist." };
  }

  const status: EmployeeStatus = (data.status ?? "ACTIVE") as EmployeeStatus;

  const employee = await prisma.employee.create({
    data: {
      name,
      phone: data.phone ?? null,
      employmentType: data.employmentType,
      monthlySalary:
        data.employmentType === "PERMANENT" ? (data.monthlySalary ?? null) : null,
      dailyWage:
        data.employmentType === "DAILY" ? (data.dailyWage ?? null) : null,
      hireDate,
      departmentId: trimmedDepartmentId,
      status,
    },
    include: { department: { select: { id: true, name: true } } },
  });

  revalidatePath("/employees");
  return {
    success: true,
    employee: {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      employmentType: employee.employmentType as EmploymentType,
      status: employee.status as EmployeeStatus,
      monthlySalary:
        employee.monthlySalary != null ? Number(employee.monthlySalary) : null,
      dailyWage: employee.dailyWage != null ? Number(employee.dailyWage) : null,
      hireDate: employee.hireDate,
      departmentId: employee.departmentId,
      department: employee.department,
      isDeleted: employee.isDeleted,
      deletedAt: employee.deletedAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    },
  };
}

export async function updateEmployee(id: string, data: UpdateEmployeeInput) {
  const employeeId = id.trim();
  if (!employeeId) return { error: "Invalid employee id." };

  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, isDeleted: false },
    select: { id: true, employmentType: true, status: true },
  });
  if (!existing) return { error: "Employee not found." };

  const name = (data.name ?? "").trim();
  const trimmedDepartmentId = (data.departmentId ?? "").trim();
  const hireDate = toDateOrNull(data.hireDate);

  if (!hireDate) {
    return { error: "Invalid hire date." };
  }

  // Guard: do not allow changing employmentType if attendance exists.
  const attendanceCount = await prisma.attendance.count({
    where: { employeeId },
  });
  const employmentTypeChanging = data.employmentType !== existing.employmentType;
  if (attendanceCount > 0 && employmentTypeChanging) {
    return { error: "Cannot change employment type when attendance records exist." };
  }

  const validationError = validateEmployeeInput(
    {
      ...data,
      name,
      departmentId: trimmedDepartmentId,
      hireDate,
    }
  );
  if (validationError) return { error: validationError };

  const department = await prisma.department.findFirst({
    where: { id: trimmedDepartmentId },
    select: { id: true },
  });
  if (!department) {
    return { error: "Department does not exist." };
  }

  const status: EmployeeStatus =
    (data.status ?? existing.status) as EmployeeStatus;

  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      name,
      phone: data.phone ?? null,
      employmentType: data.employmentType,
      monthlySalary:
        data.employmentType === "PERMANENT" ? (data.monthlySalary ?? null) : null,
      dailyWage:
        data.employmentType === "DAILY" ? (data.dailyWage ?? null) : null,
      hireDate,
      departmentId: trimmedDepartmentId,
      status,
    },
    include: { department: { select: { id: true, name: true } } },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}/edit`);

  return {
    success: true,
    employee: {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      employmentType: employee.employmentType as EmploymentType,
      status: employee.status as EmployeeStatus,
      monthlySalary:
        employee.monthlySalary != null ? Number(employee.monthlySalary) : null,
      dailyWage: employee.dailyWage != null ? Number(employee.dailyWage) : null,
      hireDate: employee.hireDate,
      departmentId: employee.departmentId,
      department: employee.department,
      isDeleted: employee.isDeleted,
      deletedAt: employee.deletedAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    },
  };
}

export async function setEmployeeStatus(id: string, status: EmployeeStatus) {
  const employeeId = id.trim();
  if (!employeeId) return { error: "Invalid employee id." };

  await prisma.employee.update({
    where: { id: employeeId },
    data: { status },
  });

  revalidatePath("/employees");
  return { success: true };
}

export async function deleteEmployee(id: string) {
  const employeeId = id.trim();
  if (!employeeId) return { error: "Invalid employee id." };

  await prisma.employee.update({
    where: { id: employeeId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  revalidatePath("/employees");
  return { success: true };
}

export async function searchEmployees(query: string) {
  const q = (query ?? "").trim();
  if (!q) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: {
      isDeleted: false,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { department: { select: { id: true, name: true } } },
  });

  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    phone: e.phone,
    employmentType: e.employmentType as EmploymentType,
    status: e.status as EmployeeStatus,
    monthlySalary: e.monthlySalary != null ? Number(e.monthlySalary) : null,
    dailyWage: e.dailyWage != null ? Number(e.dailyWage) : null,
    hireDate: e.hireDate,
    departmentId: e.departmentId,
    department: e.department,
  }));
}

export async function getLeavesByEmployee(employeeId: string) {
  const employeeIdTrimmed = employeeId.trim();
  if (!employeeIdTrimmed) return [];

  const leaves = await prisma.leave.findMany({
    where: { employeeId: employeeIdTrimmed },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      employeeId: true,
      leaveType: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      reason: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return leaves.map((l) => ({
    ...l,
    employeeId: l.employeeId,
  }));
}

export async function createLeave(data: CreateLeaveInput) {
  const employeeId = data.employeeId.trim();
  if (!employeeId) return { error: "Invalid employee id" };

  const startDate = toDateOnlyUTC(data.startDate);
  const endDate = toDateOnlyUTC(data.endDate);

  if (endDate.getTime() < startDate.getTime()) {
    return { error: "endDate must be >= startDate" };
  }

  const totalDays = diffDaysInclusiveUTC(startDate, endDate);

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      isDeleted: false,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!employee) {
    return { error: "Employee must be ACTIVE and not deleted" };
  }

  // Overlap check: startA <= endB AND endA >= startB
  const overlapping = await prisma.leave.findFirst({
    where: {
      employeeId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });

  if (overlapping) {
    return { error: "Leave dates overlap with an existing leave record" };
  }

  const leave = await prisma.leave.create({
    data: {
      employeeId,
      leaveType: data.leaveType,
      startDate,
      endDate,
      totalDays,
      reason: data.reason?.trim() ? data.reason.trim() : null,
      notes: data.notes?.trim() ? data.notes.trim() : null,
    },
  });

  revalidatePath(`/employees/${employeeId}/leaves`);
  return { success: true, leave };
}

export async function deleteLeave(id: string) {
  const leaveId = id.trim();
  if (!leaveId) return { error: "Invalid leave id" };

  const existing = await prisma.leave.findFirst({
    where: { id: leaveId },
    select: { id: true, employeeId: true },
  });

  if (!existing) {
    return { error: "Leave record not found" };
  }

  await prisma.leave.delete({ where: { id: leaveId } });

  revalidatePath(`/employees/${existing.employeeId}/leaves`);
  revalidatePath(`/employees/${existing.employeeId}/edit`);
  revalidatePath(`/employees`);

  return { success: true };
}

