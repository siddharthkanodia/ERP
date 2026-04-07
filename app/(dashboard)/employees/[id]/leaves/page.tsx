import { notFound } from "next/navigation";

import {
  getEmployeeById,
  getLeavesByEmployee,
} from "@/actions/employees";

import { LeavePage } from "./leaves-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EmployeeLeavesPage({ params }: PageProps) {
  const { id } = await params;

  const employee = await getEmployeeById(id);
  if (!employee) return notFound();

  const leaves = await getLeavesByEmployee(id);

  return <LeavePage employee={employee} leaves={leaves} />;
}

