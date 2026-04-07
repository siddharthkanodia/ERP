"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "LEAVE"
  | "HOLIDAY";

export type MarkAttendanceInput = {
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn?: Date;
  checkOut?: Date;
  notes?: string;
};

type AttendanceSerialized = {
  id: string;
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn: Date | null;
  checkOut: Date | null;
  hoursWorked: number | null;
  overtimeHours: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AttendanceSummary = {
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  holiday: number;
  totalHoursWorked: number;
  totalOvertimeHours: number;
};

type EmploymentType = "PERMANENT" | "DAILY";

export type UpsertAttendanceInput = {
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn?: string; // "HH:mm" 24hr
  checkOut?: string; // "HH:mm" 24hr
  notes?: string;
};

type AttendanceRecordLike = {
  id: string;
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn: Date | null;
  checkOut: Date | null;
  hoursWorked: number | { toString(): string } | null;
  overtimeHours: number | { toString(): string } | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function serializeAttendance(att: AttendanceRecordLike): AttendanceSerialized {
  return {
    id: att.id,
    employeeId: att.employeeId,
    date: att.date,
    status: att.status as AttendanceStatus,
    checkIn: att.checkIn ?? null,
    checkOut: att.checkOut ?? null,
    hoursWorked: att.hoursWorked != null ? Number(att.hoursWorked) : null,
    overtimeHours:
      att.overtimeHours != null ? Number(att.overtimeHours) : null,
    notes: att.notes ?? null,
    createdAt: att.createdAt,
    updatedAt: att.updatedAt,
  };
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function getAttendanceByEmployee(
  employeeId: string,
  month?: Date
): Promise<AttendanceSerialized[]> {
  const empId = employeeId.trim();
  if (!empId) return [];

  const now = new Date();
  const range = month
    ? { start: startOfMonth(month), end: endOfMonth(month) }
    : {
        start: new Date(
          startOfDay(now).getTime() - 29 * 24 * 60 * 60 * 1000
        ),
        end: now,
      };

  const records = await prisma.attendance.findMany({
    where: {
      employeeId: empId,
      date: { gte: range.start, lte: range.end },
    },
    orderBy: { date: "desc" },
  });

  return records.map(serializeAttendance);
}

export async function markAttendance(data: MarkAttendanceInput) {
  const employeeId = data.employeeId.trim();
  if (!employeeId) return { error: "Invalid employee id" };

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      isDeleted: false,
      status: "ACTIVE",
    },
    select: { id: true, status: true },
  });

  if (!employee) {
    return { error: "Employee not found or is not active" };
  }

  const dateOnly = toDateOnly(data.date);
  const todayStart = startOfDay(new Date());
  if (dateOnly.getTime() > todayStart.getTime()) {
    return { error: "Attendance date cannot be in the future" };
  }

  const shouldCompute =
    data.checkIn != null && data.checkOut != null
      ? true
      : false;

  let hoursWorked: number | null = null;
  let overtimeHours: number | null = null;
  const checkIn = data.checkIn ?? null;
  const checkOut = data.checkOut ?? null;
  if (shouldCompute) {
    const inTs = checkIn!.getTime();
    const outTs = checkOut!.getTime();
    if (outTs <= inTs) {
      return { error: "Check-out must be after check-in" };
    }
    const diffHours = (outTs - inTs) / (1000 * 60 * 60);
    hoursWorked = roundTo(diffHours, 2);
    overtimeHours = hoursWorked > 8 ? roundTo(hoursWorked - 8, 2) : 0;
  }

  // Prisma composite unique naming differs across versions; using a safe read-then-write transaction.
  const existing = await prisma.attendance.findFirst({
    where: { employeeId, date: dateOnly },
  });

  const attendance = existing
    ? await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          checkIn,
          checkOut,
          hoursWorked: hoursWorked != null ? hoursWorked : null,
          overtimeHours: overtimeHours != null ? overtimeHours : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
        },
      })
    : await prisma.attendance.create({
        data: {
          employeeId,
          date: dateOnly,
          status: data.status,
          checkIn,
          checkOut,
          hoursWorked: hoursWorked != null ? hoursWorked : null,
          overtimeHours: overtimeHours != null ? overtimeHours : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
        },
      });

  revalidatePath(`/employees/${employeeId}/attendance`);
  return { success: true, attendance: serializeAttendance(attendance) };
}

export async function getAttendanceSummary(
  employeeId: string,
  month: Date
): Promise<AttendanceSummary> {
  const empId = employeeId.trim();
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  const records = await prisma.attendance.findMany({
    where: {
      employeeId: empId,
      date: { gte: start, lte: end },
    },
    select: { status: true, hoursWorked: true, overtimeHours: true },
  });

  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    holiday: 0,
    totalHoursWorked: 0,
    totalOvertimeHours: 0,
  };

  for (const r of records) {
    switch (r.status as AttendanceStatus) {
      case "PRESENT":
        summary.present += 1;
        break;
      case "ABSENT":
        summary.absent += 1;
        break;
      case "HALF_DAY":
        summary.halfDay += 1;
        break;
      case "LEAVE":
        summary.leave += 1;
        break;
      case "HOLIDAY":
        summary.holiday += 1;
        break;
    }
    if (r.hoursWorked != null) summary.totalHoursWorked += Number(r.hoursWorked);
    if (r.overtimeHours != null) summary.totalOvertimeHours += Number(r.overtimeHours);
  }

  summary.totalHoursWorked = roundTo(summary.totalHoursWorked, 2);
  summary.totalOvertimeHours = roundTo(summary.totalOvertimeHours, 2);
  return summary;
}

export async function deleteAttendanceRecord(id: string) {
  const attendanceId = id.trim();
  if (!attendanceId) return { error: "Invalid attendance id" };

  const existing = await prisma.attendance.findFirst({
    where: { id: attendanceId },
    select: { id: true, employeeId: true },
  });

  if (!existing) {
    return { error: "Attendance record not found" };
  }

  await prisma.attendance.delete({ where: { id: attendanceId } });

  revalidatePath(`/employees/${existing.employeeId}/attendance`);
  revalidatePath(`/employees/${existing.employeeId}/edit`);
  revalidatePath(`/employees`);

  return { success: true };
}

export async function getDailyAttendance(date: Date) {
  const target = startOfDay(date);
  const targetEnd = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    23,
    59,
    59,
    999
  );

  const employees = await prisma.employee.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
      hireDate: { lte: target },
    },
    select: {
      id: true,
      name: true,
      employmentType: true,
      department: {
        select: { id: true, name: true },
      },
    },
    orderBy: { name: "asc" },
  });

  if (employees.length === 0) return [];

  const employeeIds = employees.map((e) => e.id);
  const isSunday = target.getDay() === 0;

  let [attendanceRows, leaveRows] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: {
          gte: target,
          lte: targetEnd,
        },
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
        checkIn: true,
        checkOut: true,
        hoursWorked: true,
        overtimeHours: true,
        notes: true,
      },
    }),
    prisma.leave.findMany({
      where: {
        employeeId: { in: employeeIds },
        startDate: { lte: targetEnd },
        endDate: { gte: target },
      },
      select: { id: true, employeeId: true },
    }),
  ]);

  if (isSunday) {
    const existingEmployeeIds = new Set(attendanceRows.map((row) => row.employeeId));
    const missingEmployeeIds = employeeIds.filter((id) => !existingEmployeeIds.has(id));

    if (missingEmployeeIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const employeeId of missingEmployeeIds) {
          const existing = await tx.attendance.findFirst({
            where: {
              employeeId,
              date: {
                gte: target,
                lte: targetEnd,
              },
            },
            select: { id: true },
          });

          if (existing) {
            await tx.attendance.update({
              where: { id: existing.id },
              data: {
                status: "HOLIDAY",
                checkIn: null,
                checkOut: null,
                hoursWorked: null,
                overtimeHours: null,
              },
            });
          } else {
            await tx.attendance.create({
              data: {
                employeeId,
                date: target,
                status: "HOLIDAY",
                checkIn: null,
                checkOut: null,
                hoursWorked: null,
                overtimeHours: null,
              },
            });
          }
        }
      });

      revalidatePath("/attendance");

      [attendanceRows, leaveRows] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            employeeId: { in: employeeIds },
            date: {
              gte: target,
              lte: targetEnd,
            },
          },
          select: {
            id: true,
            employeeId: true,
            status: true,
            checkIn: true,
            checkOut: true,
            hoursWorked: true,
            overtimeHours: true,
            notes: true,
          },
        }),
        prisma.leave.findMany({
          where: {
            employeeId: { in: employeeIds },
            startDate: { lte: targetEnd },
            endDate: { gte: target },
          },
          select: { id: true, employeeId: true },
        }),
      ]);
    }
  }

  const attendanceByEmployee = new Map<string, (typeof attendanceRows)[number]>();
  for (const row of attendanceRows) {
    attendanceByEmployee.set(row.employeeId, row);
  }

  const leaveEmployeeIds = new Set(leaveRows.map((l) => l.employeeId));

  function formatTime12h(d: Date | null | undefined) {
    if (!d) return null;
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return null;
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const mm = String(minutes).padStart(2, "0");
    return `${hours}:${mm} ${ampm}`;
  }

  return employees.map((emp) => {
    const att = attendanceByEmployee.get(emp.id) ?? null;
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department?.name ?? "-",
      employmentType: emp.employmentType as EmploymentType,
      attendance: att
        ? {
            id: att.id,
            status: att.status as AttendanceStatus,
            checkIn: formatTime12h(att.checkIn),
            checkOut: formatTime12h(att.checkOut),
            hoursWorked:
              att.hoursWorked != null ? Number(att.hoursWorked) : null,
            overtimeHours:
              att.overtimeHours != null ? Number(att.overtimeHours) : null,
            notes: att.notes ?? null,
          }
        : null,
      onLeave: leaveEmployeeIds.has(emp.id),
    };
  });
}

export async function upsertAttendance(data: UpsertAttendanceInput) {
  const employeeId = data.employeeId.trim();
  if (!employeeId) return { error: "Invalid employee id" };

  const dateOnly = startOfDay(data.date);

  let checkInDate: Date | null = null;
  let checkOutDate: Date | null = null;
  let hoursWorked: number | null = null;
  let overtimeHours: number | null = null;

  function parseTimeToDate(time: string | undefined) {
    if (!time) return null;
    const [hh, mm] = time.split(":").map((v) => Number(v));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return new Date(
      dateOnly.getFullYear(),
      dateOnly.getMonth(),
      dateOnly.getDate(),
      hh,
      mm,
      0,
      0
    );
  }

  if (data.status === "ABSENT") {
    checkInDate = null;
    checkOutDate = null;
    hoursWorked = null;
    overtimeHours = null;
  } else {
    checkInDate = parseTimeToDate(data.checkIn);
    checkOutDate = parseTimeToDate(data.checkOut);

    if (data.status === "PRESENT" && checkInDate && checkOutDate) {
      if (checkOutDate.getTime() <= checkInDate.getTime()) {
        return { error: "Check-out must be after check-in" };
      }
      const diffHours =
        (checkOutDate.getTime() - checkInDate.getTime()) /
        (1000 * 60 * 60);
      hoursWorked = roundTo(diffHours, 2);
      overtimeHours =
        hoursWorked > 8 ? roundTo(hoursWorked - 8, 2) : 0;
    } else if (data.status === "PRESENT") {
      hoursWorked = null;
      overtimeHours = null;
    }
  }

  const existing = await prisma.attendance.findFirst({
    where: { employeeId, date: dateOnly },
  });

  const attendance = existing
    ? await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          hoursWorked,
          overtimeHours,
          notes: data.notes?.trim() ? data.notes.trim() : null,
        },
      })
    : await prisma.attendance.create({
        data: {
          employeeId,
          date: dateOnly,
          status: data.status,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          hoursWorked,
          overtimeHours,
          notes: data.notes?.trim() ? data.notes.trim() : null,
        },
      });

  revalidatePath("/attendance");
  return { success: true, attendance: serializeAttendance(attendance) };
}

export async function upsertBulkAttendance(records: UpsertAttendanceInput[]) {
  if (records.length === 0) return { success: true, count: 0 };

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const employeeId = record.employeeId.trim();
      if (!employeeId) continue;

      const dateOnly = startOfDay(record.date);

      let checkInDate: Date | null = null;
      let checkOutDate: Date | null = null;
      let hoursWorked: number | null = null;
      let overtimeHours: number | null = null;

      const parseTimeToDate = (time: string | undefined) => {
        if (!time) return null;
        const [hh, mm] = time.split(":").map((v) => Number(v));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return new Date(
          dateOnly.getFullYear(),
          dateOnly.getMonth(),
          dateOnly.getDate(),
          hh,
          mm,
          0,
          0
        );
      };

      if (record.status === "ABSENT") {
        checkInDate = null;
        checkOutDate = null;
        hoursWorked = null;
        overtimeHours = null;
      } else {
        checkInDate = parseTimeToDate(record.checkIn);
        checkOutDate = parseTimeToDate(record.checkOut);

        if (record.status === "PRESENT" && checkInDate && checkOutDate) {
          if (checkOutDate.getTime() <= checkInDate.getTime()) {
            continue;
          }
          const diffHours =
            (checkOutDate.getTime() - checkInDate.getTime()) /
            (1000 * 60 * 60);
          hoursWorked = roundTo(diffHours, 2);
          overtimeHours =
            hoursWorked > 8 ? roundTo(hoursWorked - 8, 2) : 0;
        } else if (record.status === "PRESENT") {
          hoursWorked = null;
          overtimeHours = null;
        }
      }

      const existing = await tx.attendance.findFirst({
        where: { employeeId, date: dateOnly },
      });

      if (existing) {
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: record.status,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            hoursWorked,
            overtimeHours,
            notes: record.notes?.trim() ? record.notes.trim() : null,
          },
        });
      } else {
        await tx.attendance.create({
          data: {
            employeeId,
            date: dateOnly,
            status: record.status,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            hoursWorked,
            overtimeHours,
            notes: record.notes?.trim() ? record.notes.trim() : null,
          },
        });
      }
    }
  });

  revalidatePath("/attendance");
  return { success: true, count: records.length };
}

export async function markDayAsHoliday(date: Date) {
  const dateOnly = startOfDay(date);

  const employees = await prisma.employee.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (employees.length === 0) {
    revalidatePath("/attendance");
    return { success: true, count: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const employee of employees) {
      const existing = await tx.attendance.findFirst({
        where: { employeeId: employee.id, date: dateOnly },
        select: { id: true },
      });

      if (existing) {
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: "HOLIDAY",
            checkIn: null,
            checkOut: null,
            hoursWorked: null,
            overtimeHours: null,
            notes: null,
          },
        });
      } else {
        await tx.attendance.create({
          data: {
            employeeId: employee.id,
            date: dateOnly,
            status: "HOLIDAY",
            checkIn: null,
            checkOut: null,
            hoursWorked: null,
            overtimeHours: null,
            notes: null,
          },
        });
      }
    }
  });

  revalidatePath("/attendance");
  return { success: true, count: employees.length };
}

