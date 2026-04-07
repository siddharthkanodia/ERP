"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { format } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2 } from "lucide-react";

import type { CreateLeaveInput } from "@/actions/employees";
import {
  createLeave,
  deleteLeave,
  getLeavesByEmployee,
} from "@/actions/employees";

type EmploymentType = "PERMANENT" | "DAILY";
type EmployeeStatus = "ACTIVE" | "INACTIVE";
type LeaveType = "CASUAL" | "SICK" | "UNPAID" | "OTHER";

type Employee = {
  id: string;
  name: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  department: { id: string; name: string } | null;
};

type LeaveRow = {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: Date | string;
  endDate: Date | string;
  totalDays: number;
  reason: string | null;
  notes: string | null;
};

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function toDateOnlyUTC(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function parseInputDateValue(value: string) {
  if (!value) return null;
  const [y, m, dd] = value.split("-").map((v) => Number(v));
  if (!y || !m || !dd) return null;
  const d = new Date(y, m - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toInputDateValue(d: Date) {
  const tzOff = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tzOff).toISOString().slice(0, 10);
}

function diffDaysInclusiveUTC(start: Date, end: Date) {
  const startMs = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endMs = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function overlapInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  // overlap if A start <= B end and A end >= B start
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

function leaveTypeBadgeClass(type: LeaveType) {
  switch (type) {
    case "CASUAL":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "SICK":
      return "bg-red-50 text-red-700 border-red-200";
    case "UNPAID":
      return "bg-muted text-muted-foreground border-border";
    case "OTHER":
      return "bg-amber-50 text-amber-800 border-amber-200";
  }
}

function truncate(text: string | null, max = 40) {
  if (!text) return "-";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function LeavePage({
  employee,
  leaves: initialLeaves,
}: {
  employee: Employee;
  leaves: LeaveRow[];
}) {
  const router = useRouter();
  const [leaves, setLeaves] = useState<LeaveRow[]>(initialLeaves);

  useEffect(() => {
    setLeaves(initialLeaves);
  }, [initialLeaves]);

  async function refetchLeaves() {
    const next = await getLeavesByEmployee(employee.id);
    setLeaves(next);
  }

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteTargetId) return;
    await deleteLeave(deleteTargetId);
    setDeleteOpen(false);
    setDeleteTargetId(null);
    await refetchLeaves();
    router.refresh();
  }

  // Add modal state
  const [addOpen, setAddOpen] = useState(false);

  const todayInput = toInputDateValue(new Date());
  const [leaveType, setLeaveType] = useState<LeaveType>("CASUAL");
  const [startDate, setStartDate] = useState<string>(todayInput);
  const [endDate, setEndDate] = useState<string>(todayInput);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setLeaveType("CASUAL");
    setStartDate(todayInput);
    setEndDate(todayInput);
    setReason("");
    setNotes("");
    setFormError(null);
  }

  function openAdd() {
    resetForm();
    setAddOpen(true);
  }

  const startDateObj = parseInputDateValue(startDate);
  const endDateObj = parseInputDateValue(endDate);

  const totalDays = useMemo(() => {
    if (!startDateObj || !endDateObj) return null;
    const aStart = toDateOnlyUTC(startDateObj);
    const aEnd = toDateOnlyUTC(endDateObj);
    if (aEnd.getTime() < aStart.getTime()) return null;
    return diffDaysInclusiveUTC(aStart, aEnd);
  }, [startDateObj, endDateObj]);

  const overlapError = useMemo(() => {
    if (!startDateObj || !endDateObj) return null;
    const aStart = toDateOnlyUTC(startDateObj);
    const aEnd = toDateOnlyUTC(endDateObj);
    if (aEnd.getTime() < aStart.getTime()) return null;

    // overlap check (inclusive)
    for (const l of leaves) {
      const lStart = toDateOnlyUTC(asDate(l.startDate));
      const lEnd = toDateOnlyUTC(asDate(l.endDate));
      if (overlapInclusive(aStart, aEnd, lStart, lEnd)) {
        return "Leave dates overlap with an existing leave record.";
      }
    }
    return null;
  }, [startDateObj, endDateObj, leaves]);

  const canSubmit =
    !isSaving &&
    employee.status !== "INACTIVE" &&
    !!startDateObj &&
    !!endDateObj &&
    !!totalDays &&
    !overlapError;

  async function submitAdd() {
    if (!startDateObj || !endDateObj) return;
    setFormError(null);

    if (employee.status === "INACTIVE") {
      setFormError(
        "This employee is inactive. Attendance and leave tracking may be disabled."
      );
      return;
    }
    if (endDateObj.getTime() < startDateObj.getTime()) {
      setFormError("endDate must be >= startDate");
      return;
    }
    if (overlapError) {
      setFormError(overlapError);
      return;
    }

    setIsSaving(true);
    try {
      const payload: CreateLeaveInput = {
        employeeId: employee.id,
        leaveType,
        startDate: startDateObj,
        endDate: endDateObj,
        reason: reason.trim() ? reason.trim() : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      };
      const result = await createLeave(payload);
      if ("error" in result && result.error) {
        setFormError(result.error);
        setIsSaving(false);
        return;
      }

      setAddOpen(false);
      await refetchLeaves();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  const summary = useMemo(() => {
    const base = {
      total: 0,
      CASUAL: 0,
      SICK: 0,
      UNPAID: 0,
      OTHER: 0,
    } as Record<"total" | LeaveType, number>;

    for (const l of leaves) {
      base.total += 1;
      base[l.leaveType] += 1;
    }
    return base;
  }, [leaves]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/employees"
            className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            {employee.name} — Leave Records
          </h1>
          <p className="text-sm text-muted-foreground">
            {employee.department?.name ?? "-"}{" "}
            <span
              className={
                employee.employmentType === "PERMANENT"
                  ? "ml-2 inline-flex items-center rounded-md border bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                  : "ml-2 inline-flex items-center rounded-md border bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
              }
            >
              {employee.employmentType}
            </span>
          </p>
        </div>

        {employee.status !== "INACTIVE" ? (
          <button
            type="button"
            onClick={openAdd}
            className="h-9 inline-flex items-center gap-2 rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90"
          >
            + Add Leave
          </button>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Leaves" value={summary.total} />
        <MetricCard
          label="Casual"
          value={summary.CASUAL}
          tone="blue"
        />
        <MetricCard label="Sick" value={summary.SICK} tone="red" />
        <MetricCard
          label="Unpaid"
          value={summary.UNPAID}
          tone="neutral"
        />
        <MetricCard
          label="Other"
          value={summary.OTHER}
          tone="amber"
        />
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Leave Type
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                From
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                To
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Days
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Reason
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Notes
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {leaves.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  No leave records found.
                </td>
              </tr>
            ) : null}
            {leaves.map((l) => {
              const typeBadgeClass = leaveTypeBadgeClass(l.leaveType);
              const start = format(asDate(l.startDate), "dd MMM yyyy");
              const end = format(asDate(l.endDate), "dd MMM yyyy");
              return (
                <tr key={l.id} className="border-t border-transparent">
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${typeBadgeClass}`}
                    >
                      {l.leaveType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{start}</td>
                  <td className="px-3 py-2 text-muted-foreground">{end}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.totalDays}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.reason ? truncate(l.reason, 26) : "-"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.notes ? truncate(l.notes, 26) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-red-500 bg-background px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        setDeleteTargetId(l.id);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Leave Dialog */}
      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Add Leave
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Create a leave record for this employee.
            </Dialog.Description>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                >
                  <option value="CASUAL">CASUAL</option>
                  <option value="SICK">SICK</option>
                  <option value="UNPAID">UNPAID</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </div>
              </div>

              <div className="text-sm">
                Total Days:{" "}
                <span className="font-medium">
                  {totalDays != null ? totalDays : "-"}
                </span>
              </div>

              {overlapError ? (
                <p className="text-sm text-destructive">{overlapError}</p>
              ) : null}

              {formError ? (
                <p className="text-sm text-destructive">{formError}</p>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  onClick={submitAdd}
                  disabled={!canSubmit}
                  className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Adding..." : "Add Leave"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Leave Dialog */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Delete this leave record?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This leave record will be permanently removed.
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
                onClick={confirmDelete}
                className="h-8 inline-flex items-center justify-center rounded-md border border-red-500 bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-600/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!deleteTargetId}
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "blue" | "red" | "amber" | "neutral";
}) {
  const toneClasses =
    tone === "blue"
      ? { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" }
      : tone === "red"
        ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" }
        : tone === "amber"
          ? {
              bg: "bg-amber-50",
              border: "border-amber-200",
              text: "text-amber-800",
            }
          : { bg: "bg-muted/40", border: "border-border", text: "text-foreground" };

  return (
    <div
      className={`rounded-md border ${toneClasses.border} ${toneClasses.bg} p-3`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClasses.text}`}>
        {value}
      </div>
    </div>
  );
}

