"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { format } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Trash2 } from "lucide-react";

import { setEmployeeStatus, deleteEmployee } from "@/actions/employees";
import {
  createDepartment,
  deleteDepartment,
  getAllDepartments,
} from "@/actions/departments";

type EmployeeRow = {
  id: string;
  name: string;
  phone: string | null;
  employmentType: "PERMANENT" | "DAILY";
  status: "ACTIVE" | "INACTIVE";
  monthlySalary: number | null;
  dailyWage: number | null;
  hireDate: Date | string;
  departmentId: string;
  department: { id: string; name: string } | null;
};

export function EmployeeDashboard({ employees }: { employees: EmployeeRow[] }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<EmployeeRow[]>(employees);

  useEffect(() => {
    setRows(employees);
  }, [employees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...rows].sort((a, b) => {
      // ACTIVE first always
      const aRank = a.status === "ACTIVE" ? 0 : 1;
      const bRank = b.status === "ACTIVE" ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    if (!q) return base;
    return base.filter((e) => {
      const name = (e.name ?? "").toLowerCase();
      const phone = (e.phone ?? "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [rows, query]);

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const deleteTarget = useMemo(
    () => rows.find((r) => r.id === deleteTargetId) ?? null,
    [rows, deleteTargetId]
  );

  async function confirmDelete() {
    if (!deleteTargetId) return;
    await deleteEmployee(deleteTargetId);
    setDeleteOpen(false);
    setDeleteTargetId(null);
    // Reload data to match server ordering/counts.
    window.location.reload();
  }

  // Departments modal state
  const [deptOpen, setDeptOpen] = useState(false);
  const [departments, setDepartments] = useState<
    Array<{ id: string; name: string; activeEmployeeCount: number }>
  >([]);
  const [deptName, setDeptName] = useState("");
  const [deptError, setDeptError] = useState<string | null>(null);
  const [deptBusy, setDeptBusy] = useState(false);

  useEffect(() => {
    if (!deptOpen) return;
    (async () => {
      const list = await getAllDepartments();
      setDepartments(list);
      setDeptName("");
      setDeptError(null);
    })();
  }, [deptOpen]);

  async function handleCreateDepartment() {
    setDeptError(null);
    const name = deptName.trim();
    if (!name) {
      setDeptError("Department name is required.");
      return;
    }
    setDeptBusy(true);
    const result = await createDepartment(name);
    setDeptBusy(false);
    if ("error" in result && result.error) {
      setDeptError(result.error);
      return;
    }
    const list = await getAllDepartments();
    setDepartments(list);
    setDeptName("");
  }

  async function handleDeleteDepartment(deptId: string) {
    setDeptError(null);
    setDeptBusy(true);
    const result = await deleteDepartment(deptId);
    setDeptBusy(false);
    if ("error" in result && result.error) {
      setDeptError(result.error);
      return;
    }
    const list = await getAllDepartments();
    setDepartments(list);
  }

  async function handleToggleStatus(id: string, nextStatus: "ACTIVE" | "INACTIVE") {
    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r))
    );
    try {
      await setEmployeeStatus(id, nextStatus);
      // Refresh page so server reflects any future ordering changes.
      window.location.reload();
    } catch {
      // Revert
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: nextStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : r
        )
      );
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Manage your team and track attendance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/employees/new"
            className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90"
          >
            + Add Employee
          </Link>

          <button
            type="button"
            className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
            onClick={() => setDeptOpen(true)}
          >
            Manage Departments
          </button>
        </div>
      </header>

      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone..."
          className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
        />
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Department
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Salary/Wage
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Hire Date
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const isInactive = e.status === "INACTIVE";
              const badgeClass =
                e.employmentType === "PERMANENT"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-amber-50 text-amber-700 border-amber-200";

              const hireDate = e.hireDate ? new Date(e.hireDate) : null;
              const hireDateLabel = hireDate
                ? format(hireDate, "dd MMM yyyy")
                : "-";

              const salaryLabel =
                e.employmentType === "PERMANENT"
                  ? `₹${Math.round(e.monthlySalary ?? 0).toLocaleString("en-IN")} / month`
                  : `₹${Math.round(e.dailyWage ?? 0).toLocaleString("en-IN")} / day`;

              return (
                <tr key={e.id} className={isInactive ? "opacity-60" : undefined}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{e.name}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {e.department?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {e.employmentType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {salaryLabel}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {hireDateLabel}
                  </td>
                  <td className="px-3 py-2">
                    <Switch.Root
                      checked={e.status === "ACTIVE"}
                      onCheckedChange={(checked) =>
                        handleToggleStatus(
                          e.id,
                          checked ? "ACTIVE" : "INACTIVE"
                        )
                      }
                      aria-label="Toggle employee status"
                      className="relative h-[1.15rem] w-8 cursor-pointer rounded-full border border-black/20 bg-black/10 data-[state=checked]:bg-black data-[state=checked]:border-black"
                    >
                      <Switch.Thumb className="block h-[0.9rem] w-[0.9rem] translate-x-[0.1rem] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[0.9rem]" />
                    </Switch.Root>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {e.status === "ACTIVE" ? "Active" : "Inactive"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/employees/${e.id}/attendance`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                        aria-label="Attendance"
                        title="Attendance"
                      >
                        📋
                      </Link>
                      <Link
                        href={`/employees/${e.id}/leaves`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                        aria-label="Leaves"
                        title="Leaves"
                      >
                        🏖️
                      </Link>
                      <Link
                        href={`/employees/${e.id}/edit`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                        aria-label="Edit"
                        title="Edit"
                      >
                        ✏️
                      </Link>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500 text-red-600 hover:bg-red-50"
                        aria-label="Delete employee"
                        title="Delete"
                        onClick={() => {
                          setDeleteTargetId(e.id);
                          setDeleteOpen(true);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No employees found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Delete {deleteTarget?.name ?? "Employee"}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This will permanently remove the employee record. Attendance and leave
              history will be retained.
            </Dialog.Description>

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="h-8 inline-flex items-center justify-center rounded-md border border-red-500 bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-600/90"
                onClick={confirmDelete}
              >
                Delete Employee
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Department management */}
      <Dialog.Root open={deptOpen} onOpenChange={setDeptOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Manage Departments
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Add departments and remove those that have no active employees.
            </Dialog.Description>

            <div className="mt-4 space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Department Name
                  </label>
                  <input
                    type="text"
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </div>
                <button
                  type="button"
                  className="h-9 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90"
                  onClick={handleCreateDepartment}
                  disabled={deptBusy}
                >
                  Add
                </button>
              </div>
              {deptError ? <p className="text-sm text-destructive">{deptError}</p> : null}

              <div className="space-y-2">
                {departments.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background p-2"
                  >
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Active employees: {d.activeEmployeeCount}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={d.activeEmployeeCount > 0 || deptBusy}
                      onClick={() => handleDeleteDepartment(d.id)}
                      title={
                        d.activeEmployeeCount > 0
                          ? "Cannot delete while active employees exist"
                          : "Delete department"
                      }
                    >
                      <Trash2 className="mr-1 size-4" />
                      Delete
                    </button>
                  </div>
                ))}
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No departments found.</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
                >
                  Done
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

