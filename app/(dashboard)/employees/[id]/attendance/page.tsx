import { notFound } from "next/navigation";

import {
  getAttendanceByEmployee,
  getAttendanceSummary,
} from "@/actions/attendance";
import { getEmployeeById } from "@/actions/employees";

import { AttendancePage } from "./attendance-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EmployeeAttendancePage({ params }: PageProps) {
  const { id } = await params;
  const employee = await getEmployeeById(id);

  if (!employee) return notFound();

  const month = new Date();

  const [attendance, summary] = await Promise.all([
    getAttendanceByEmployee(id, month),
    getAttendanceSummary(id, month),
  ]);

  const monthISO = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(
    2,
    "0"
  )}-01`;

  return (
    <AttendancePage
      employee={employee}
      initialMonthISO={monthISO}
      attendance={attendance}
      summary={summary}
    />
  );
}

