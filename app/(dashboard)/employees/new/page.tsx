import { getAllDepartments } from "@/actions/departments";

import { EmployeeForm } from "@/components/employees/EmployeeForm";

export default async function AddEmployeePage() {
  const departments = await getAllDepartments();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Add Employee</h1>
        <p className="text-sm text-muted-foreground">
          Add a team member and track their attendance.
        </p>
      </header>

      <EmployeeForm departments={departments} />
    </section>
  );
}

