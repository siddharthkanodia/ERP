import { getAllEmployees } from "@/actions/employees";

import { EmployeeDashboard } from "./employee-dashboard";

export default async function EmployeesPage() {
  const employees = await getAllEmployees();

  return <EmployeeDashboard employees={employees} />;
}

