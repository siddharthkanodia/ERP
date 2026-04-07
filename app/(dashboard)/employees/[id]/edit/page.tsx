import { getAllDepartments } from "@/actions/departments";
import { getEmployeeById } from "@/actions/employees";

import { EmployeeForm } from "@/components/employees/EmployeeForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditEmployeePage({ params }: PageProps) {
  const { id } = await params;

  const [employee, departments] = await Promise.all([
    getEmployeeById(id),
    getAllDepartments(),
  ]);

  if (!employee) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">Edit Employee</h1>
        </header>
        <p className="text-sm text-muted-foreground">Employee not found</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Edit Employee</h1>
      </header>
      <EmployeeForm employee={employee} departments={departments} />
    </section>
  );
}

