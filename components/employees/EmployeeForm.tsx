"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import * as Switch from "@radix-ui/react-switch";

import {
  createEmployee,
  updateEmployee,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from "@/actions/employees";

type EmploymentType = "PERMANENT" | "DAILY";
type EmployeeStatus = "ACTIVE" | "INACTIVE";

export type Department = {
  id: string;
  name: string;
  activeEmployeeCount: number;
};

export type Employee = {
  id: string;
  name: string;
  phone: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  monthlySalary: number | null;
  dailyWage: number | null;
  hireDate: Date | string;
  departmentId: string;
};

export function EmployeeForm({
  employee,
  departments,
}: {
  employee?: Employee;
  departments: Department[];
}) {
  const router = useRouter();
  const isEditMode = Boolean(employee?.id);

  function toInputDateValue(d: Date) {
    // Convert to local yyyy-mm-dd for <input type="date">
    const tzOff = d.getTimezoneOffset() * 60 * 1000;
    return new Date(d.getTime() - tzOff).toISOString().slice(0, 10);
  }

  function parseInputDateValue(value: string) {
    if (!value) return null;
    const [y, m, dd] = value.split("-").map((v) => Number(v));
    if (!y || !m || !dd) return null;
    const d = new Date(y, m - 1, dd);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [departmentId, setDepartmentId] = useState(employee?.departmentId ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    employee?.employmentType ?? "PERMANENT"
  );

  const [monthlySalary, setMonthlySalary] = useState<string>(
    employee?.employmentType === "PERMANENT" && employee.monthlySalary != null
      ? String(employee.monthlySalary)
      : ""
  );
  const [dailyWage, setDailyWage] = useState<string>(
    employee?.employmentType === "DAILY" && employee.dailyWage != null
      ? String(employee.dailyWage)
      : ""
  );

  const [hireDate, setHireDate] = useState<string>(() => {
    const d = employee?.hireDate ? new Date(employee.hireDate) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return toInputDateValue(d);
  });

  const [status, setStatus] = useState<EmployeeStatus>(
    employee?.status ?? "ACTIVE"
  );

  const [touched, setTouched] = useState({
    name: false,
    departmentId: false,
    salary: false,
    hireDate: false,
    status: false,
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function computeNameError(value: string) {
    if (!value.trim()) return "Name is required.";
    return null;
  }

  function computeDepartmentError(value: string) {
    if (!value.trim()) return "Department is required.";
    return null;
  }

  function computeSalaryError() {
    if (employmentType === "PERMANENT") {
      const num = parseFloat(monthlySalary);
      if (!Number.isFinite(num) || num <= 0)
        return "Monthly salary must be greater than 0.";
      return null;
    }
    const num = parseFloat(dailyWage);
    if (!Number.isFinite(num) || num <= 0)
      return "Daily wage must be greater than 0.";
    return null;
  }

  function computeHireDateError() {
    const d = parseInputDateValue(hireDate);
    if (!d) return "Hire date is required.";
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dOnly.getTime() > todayOnly.getTime()) return "Hire date cannot be in the future.";
    return null;
  }

  function computeStatusError(value: EmployeeStatus) {
    if (!value) return "Status is required.";
    return null;
  }

  const nameError = computeNameError(name);
  const departmentError = computeDepartmentError(departmentId);
  const salaryError = computeSalaryError();
  const hireDateError = computeHireDateError();
  const statusError = computeStatusError(status);

  const isFormValid =
    !nameError &&
    !departmentError &&
    !salaryError &&
    !hireDateError &&
    !statusError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setTouched({ name: true, departmentId: true, salary: true, hireDate: true, status: true });
    if (!isFormValid || isPending) return;

    const hireDateObj = parseInputDateValue(hireDate);
    if (!hireDateObj) return;

    const base = {
      name: name.trim(),
      phone: phone.trim() ? phone.trim() : null,
      employmentType,
      hireDate: hireDateObj,
      departmentId: departmentId.trim(),
      status,
    };

    const payload: CreateEmployeeInput | UpdateEmployeeInput = {
      ...base,
      monthlySalary:
        employmentType === "PERMANENT" ? parseFloat(monthlySalary) : null,
      dailyWage: employmentType === "DAILY" ? parseFloat(dailyWage) : null,
    };

    try {
      setIsPending(true);
      const result = isEditMode
        ? await updateEmployee(employee!.id, payload as UpdateEmployeeInput)
        : await createEmployee(payload as CreateEmployeeInput);

      setIsPending(false);
      if (result?.error) {
        setServerError(result.error);
        return;
      }

      router.push("/employees");
      router.refresh();
    } catch {
      setIsPending(false);
      setServerError("Failed to save employee.");
    }
  }

  function handleExit() {
    router.push("/employees");
  }

  function setEmploymentTypeAndClear(next: EmploymentType) {
    setEmploymentType(next);
    // Clear values when switching types.
    setMonthlySalary("");
    setDailyWage("");
    setTouched((t) => ({ ...t, salary: false }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-card p-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
        {touched.name && nameError ? (
          <p className="text-xs text-destructive">{nameError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone (optional)
        </label>
        <input
          id="phone"
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="departmentId" className="text-sm font-medium">
          Department
        </label>
        <select
          id="departmentId"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, departmentId: true }))}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        >
          <option value="" disabled>
            Select department
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {touched.departmentId && departmentError ? (
          <p className="text-xs text-destructive">{departmentError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium">Employment Type</label>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            PERMANENT
            <span aria-hidden className="text-muted-foreground">
              /
            </span>
            DAILY
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className={
              employmentType === "PERMANENT"
                ? "flex-1 rounded-md border bg-black px-3 py-2 text-sm font-medium text-white"
                : "flex-1 rounded-md border bg-background px-3 py-2 text-sm font-medium text-black"
            }
            onClick={() => setEmploymentTypeAndClear("PERMANENT")}
          >
            PERMANENT
          </button>
          <button
            type="button"
            className={
              employmentType === "DAILY"
                ? "flex-1 rounded-md border bg-black px-3 py-2 text-sm font-medium text-white"
                : "flex-1 rounded-md border bg-background px-3 py-2 text-sm font-medium text-black"
            }
            onClick={() => setEmploymentTypeAndClear("DAILY")}
          >
            DAILY
          </button>
        </div>
      </div>

      {employmentType === "PERMANENT" ? (
        <div className="space-y-1.5">
          <label htmlFor="monthlySalary" className="text-sm font-medium">
            Monthly Salary (₹)
          </label>
          <input
            id="monthlySalary"
            type="number"
            min="0"
            step="0.01"
            value={monthlySalary}
            onChange={(e) => setMonthlySalary(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, salary: true }))}
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          />
          {touched.salary && salaryError ? (
            <p className="text-xs text-destructive">{salaryError}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="dailyWage" className="text-sm font-medium">
            Daily Wage (₹/day)
          </label>
          <input
            id="dailyWage"
            type="number"
            min="0"
            step="0.01"
            value={dailyWage}
            onChange={(e) => setDailyWage(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, salary: true }))}
            className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          />
          {touched.salary && salaryError ? (
            <p className="text-xs text-destructive">{salaryError}</p>
          ) : null}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="hireDate" className="text-sm font-medium">
          Hire Date
        </label>
        <input
          id="hireDate"
          type="date"
          value={hireDate}
          onChange={(e) => setHireDate(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, hireDate: true }))}
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
          max={toInputDateValue(new Date())}
        />
        {touched.hireDate && hireDateError ? (
          <p className="text-xs text-destructive">{hireDateError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <label className="text-sm font-medium">Status</label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Active</span>
            <Switch.Root
              checked={status === "ACTIVE"}
              onCheckedChange={(checked) => {
                setStatus(checked ? "ACTIVE" : "INACTIVE");
                setTouched((t) => ({ ...t, status: true }));
              }}
              className="relative h-[1.15rem] w-8 cursor-pointer rounded-full border border-black/20 bg-black/10 data-[state=checked]:bg-black data-[state=checked]:border-black"
              aria-label="Toggle employee active status"
            >
              <Switch.Thumb className="block h-[0.9rem] w-[0.9rem] translate-x-[0.1rem] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[0.9rem]" />
            </Switch.Root>
            <span className="text-xs text-muted-foreground">Inactive</span>
          </div>
        </div>
        {touched.status && statusError ? (
          <p className="text-xs text-destructive">{statusError}</p>
        ) : null}
      </div>

      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
          onClick={handleExit}
        >
          Exit
        </button>
        <button
          type="submit"
          disabled={!isFormValid || isPending}
          className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : isEditMode ? "Save Changes" : "Create Employee"}
        </button>
      </div>
    </form>
  );
}

