"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { ReactNode } from "react";
import { format } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import type { MarkAttendanceInput } from "@/actions/attendance";
import {
  deleteAttendanceRecord,
  getAttendanceByEmployee,
  getAttendanceSummary,
  markAttendance,
} from "@/actions/attendance";

type EmploymentType = "PERMANENT" | "DAILY";
type EmployeeStatus = "ACTIVE" | "INACTIVE";
type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY";

type Employee = {
  id: string;
  name: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  department: { id: string; name: string } | null;
};

type AttendanceRow = {
  id: string;
  employeeId: string;
  date: Date | string;
  status: AttendanceStatus;
  checkIn: Date | string | null;
  checkOut: Date | string | null;
  hoursWorked: number | null;
  overtimeHours: number | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function toInputDateValue(d: Date) {
  // local yyyy-mm-dd
  const tzOff = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tzOff).toISOString().slice(0, 10);
}

function formatTimeHHmm(value: Date | string | null) {
  if (!value) return "-";
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "HH:mm");
}

function statusBadgeClass(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "bg-green-50 text-green-700 border-green-200";
    case "ABSENT":
      return "bg-red-50 text-red-700 border-red-200";
    case "HALF_DAY":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "LEAVE":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "HOLIDAY":
      return "bg-muted text-muted-foreground border-border";
  }
}

function timeStringToDateTime(date: Date, time: string) {
  // time: "HH:mm"
  const [hh, mm] = time.split(":").map((v) => Number(v));
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, 0, 0);
  return d;
}

function truncate(text: string | null, max = 32) {
  if (!text) return "-";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function AttendancePage({
  employee,
  initialMonthISO,
  attendance: initialAttendance,
  summary: initialSummary,
}: {
  employee: Employee;
  initialMonthISO: string;
  attendance: AttendanceRow[];
  summary: AttendanceSummary;
}) {
  const [selectedMonthISO, setSelectedMonthISO] = useState(initialMonthISO);
  const [attendance, setAttendance] = useState<AttendanceRow[]>(initialAttendance);
  const [summary, setSummary] = useState<AttendanceSummary>(initialSummary);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const selectedMonthDate = useMemo(() => {
    // expect yyyy-mm-01
    const [y, m] = selectedMonthISO.split("-").map((v) => Number(v));
    return new Date(y, m - 1, 1);
  }, [selectedMonthISO]);

  useEffect(() => {
    let cancelled = false;
    async function fetchMonth() {
      setLoadingMonth(true);
      const month = selectedMonthDate;
      const [rows, sum] = await Promise.all([
        getAttendanceByEmployee(employee.id, month),
        getAttendanceSummary(employee.id, month),
      ]);
      if (cancelled) return;
      setAttendance(rows);
      setSummary(sum);
      setLoadingMonth(false);
    }
    fetchMonth();
    return () => {
      cancelled = true;
    };
  }, [employee.id, selectedMonthDate]);

  const [markOpen, setMarkOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [activeDeleteRow, setActiveDeleteRow] = useState<AttendanceRow | null>(null);

  const isInactive = employee.status === "INACTIVE";

  // --- mark/edit form state ---
  const today = useMemo(() => new Date(), []);
  const [formDate, setFormDate] = useState<string>(() => toInputDateValue(today));
  const [formStatus, setFormStatus] = useState<AttendanceStatus>("PRESENT");
  const [checkInTime, setCheckInTime] = useState<string>("");
  const [checkOutTime, setCheckOutTime] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");

  function resetMarkForm() {
    setFormDate(toInputDateValue(new Date()));
    setFormStatus("PRESENT");
    setCheckInTime("");
    setCheckOutTime("");
    setFormNotes("");
  }

  function openMark() {
    resetMarkForm();
    setMarkOpen(true);
  }

  function openEdit(row: AttendanceRow) {
    const d = asDate(row.date);
    setFormDate(toInputDateValue(d));
    setFormStatus(row.status);
    setCheckInTime(row.checkIn ? format(asDate(row.checkIn), "HH:mm") : "");
    setCheckOutTime(row.checkOut ? format(asDate(row.checkOut), "HH:mm") : "");
    setFormNotes(row.notes ?? "");
    setEditOpen(true);
  }

  function parseInputDateValue(value: string) {
    if (!value) return null;
    const [y, m, dd] = value.split("-").map((v) => Number(v));
    if (!y || !m || !dd) return null;
    return new Date(y, m - 1, dd);
  }

  const formDateObj = parseInputDateValue(formDate);

  const computed = useMemo(() => {
    const dateObj = formDateObj;
    if (!dateObj) {
      return { hoursWorked: null as number | null, overtimeHours: null as number | null, error: null as string | null };
    }
    if (!checkInTime || !checkOutTime) {
      return { hoursWorked: null, overtimeHours: null, error: null };
    }
    const inDt = timeStringToDateTime(dateObj, checkInTime);
    const outDt = timeStringToDateTime(dateObj, checkOutTime);
    if (outDt.getTime() <= inDt.getTime()) {
      return { hoursWorked: null, overtimeHours: null, error: "Check Out must be after Check In." };
    }
    const diffHours = (outDt.getTime() - inDt.getTime()) / (1000 * 60 * 60);
    const hoursWorked = Math.round(diffHours * 100) / 100;
    const overtimeHours = hoursWorked > 8 ? Math.round((hoursWorked - 8) * 100) / 100 : 0;
    return { hoursWorked, overtimeHours, error: null as string | null };
  }, [formDateObj, checkInTime, checkOutTime]);

  async function saveAttendance(mode: "mark" | "edit") {
    if (!formDateObj) return;
    if (computed.error) return;
    if (isInactive && mode === "mark") return;

    const checkIn = checkInTime ? timeStringToDateTime(formDateObj, checkInTime) : undefined;
    const checkOut = checkOutTime ? timeStringToDateTime(formDateObj, checkOutTime) : undefined;

    const payload: MarkAttendanceInput = {
      employeeId: employee.id,
      date: formDateObj,
      status: formStatus,
      checkIn,
      checkOut,
      notes: formNotes.trim() ? formNotes.trim() : undefined,
    };

    await markAttendance(payload);
    setMarkOpen(false);
    setEditOpen(false);

    // refresh month (same effect will re-run because state unchanged, but we also force re-fetch)
    setLoadingMonth(true);
    const month = selectedMonthDate;
    const [rows, sum] = await Promise.all([
      getAttendanceByEmployee(employee.id, month),
      getAttendanceSummary(employee.id, month),
    ]);
    setAttendance(rows);
    setSummary(sum);
    setLoadingMonth(false);
  }

  async function confirmDelete() {
    if (!activeDeleteRow) return;
    await deleteAttendanceRecord(activeDeleteRow.id);
    setDeleteOpen(false);
    setActiveDeleteRow(null);

    setLoadingMonth(true);
    const month = selectedMonthDate;
    const [rows, sum] = await Promise.all([
      getAttendanceByEmployee(employee.id, month),
      getAttendanceSummary(employee.id, month),
    ]);
    setAttendance(rows);
    setSummary(sum);
    setLoadingMonth(false);
  }

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
            {employee.name} — Attendance
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
      </div>

      {isInactive ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This employee is inactive. Attendance tracking is disabled. Set
          employee to Active to mark attendance.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
            onClick={() => {
              const d = new Date(selectedMonthDate);
              d.setMonth(d.getMonth() - 1);
              setSelectedMonthISO(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
            }}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-sm font-medium">
              {format(selectedMonthDate, "MMMM yyyy")}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
            onClick={() => {
              const d = new Date(selectedMonthDate);
              d.setMonth(d.getMonth() + 1);
              setSelectedMonthISO(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
            }}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Present" value={summary.present} />
        <MetricCard label="Absent" value={summary.absent} tone="red" />
        <MetricCard label="Half Day" value={summary.halfDay} tone="amber" />
        <MetricCard label="Leave" value={summary.leave} tone="blue" />
        <MetricCard label="Total Hours" value={summary.totalHoursWorked} tone="neutral" suffix="h" />
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
          <div className="text-sm font-medium text-muted-foreground">
            Attendance Records
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              {loadingMonth ? "Loading..." : `${attendance.length} records`}
            </div>
            {!isInactive ? (
              <button
                type="button"
                onClick={openMark}
                className="h-8 inline-flex items-center gap-2 rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90"
              >
                + Mark Attendance
              </button>
            ) : null}
          </div>
        </div>

        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Day
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Check In
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Check Out
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Hours
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                OT Hours
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
            {attendance.map((row) => {
              const d = asDate(row.date);
              const dayLabel = format(d, "EEE");
              const dateLabel = format(d, "dd MMM");
              const badgeClass = statusBadgeClass(row.status);
              const hoursLabel =
                row.hoursWorked != null ? row.hoursWorked.toFixed(2) : "-";
              const otLabel =
                row.overtimeHours != null ? row.overtimeHours.toFixed(2) : "-";
              const otHighlight = (row.overtimeHours ?? 0) > 0;

              return (
                <tr key={row.id} className={row.status === "ABSENT" ? "bg-red-50/30" : undefined}>
                  <td className="px-3 py-2 text-muted-foreground">
                    {dateLabel}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {dayLabel}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatTimeHHmm(row.checkIn)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatTimeHHmm(row.checkOut)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {hoursLabel}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        otHighlight
                          ? "inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                          : "text-muted-foreground"
                      }
                    >
                      {otLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {truncate(row.notes)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                      >
                        <Pencil className="size-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDeleteRow(row);
                          setDeleteOpen(true);
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500 bg-background px-2 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {attendance.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No attendance records for this month.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mark Attendance Dialog */}
      <Dialog.Root open={markOpen} onOpenChange={setMarkOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Mark Attendance
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Enter attendance details for this date.
            </Dialog.Description>

            <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); saveAttendance("mark"); }}>
              <FieldRow label="Date">
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  max={toInputDateValue(new Date())}
                  disabled={isInactive}
                  className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </FieldRow>

              <FieldRow label="Status">
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                  className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="HALF_DAY">HALF_DAY</option>
                  <option value="LEAVE">LEAVE</option>
                  <option value="HOLIDAY">HOLIDAY</option>
                </select>
              </FieldRow>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldRow label="Check In">
                  <input
                    type="time"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </FieldRow>
                <FieldRow label="Check Out">
                  <input
                    type="time"
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </FieldRow>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground">Computed</div>
                <div className="mt-1 text-sm">
                  {computed.error ? (
                    <span className="text-sm text-destructive">{computed.error}</span>
                  ) : computed.hoursWorked != null && computed.overtimeHours != null ? (
                    <span>
                      Hours: {computed.hoursWorked.toFixed(2)} | Overtime:{" "}
                      {computed.overtimeHours.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Hours: - | Overtime: -</span>
                  )}
                </div>
              </div>

              <FieldRow label="Notes">
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                />
              </FieldRow>

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
                  type="submit"
                  disabled={Boolean(computed.error) || isInactive}
                  className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save Attendance
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Attendance Dialog */}
      <Dialog.Root open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Edit Attendance
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Update attendance details.
            </Dialog.Description>

            <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); saveAttendance("edit"); }}>
              <FieldRow label="Date">
                <input
                  type="date"
                  value={formDate}
                  disabled
                  className="h-9 w-full rounded-md border bg-muted px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </FieldRow>

              <FieldRow label="Status">
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                  className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="HALF_DAY">HALF_DAY</option>
                  <option value="LEAVE">LEAVE</option>
                  <option value="HOLIDAY">HOLIDAY</option>
                </select>
              </FieldRow>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldRow label="Check In">
                  <input
                    type="time"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </FieldRow>
                <FieldRow label="Check Out">
                  <input
                    type="time"
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                  />
                </FieldRow>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground">Computed</div>
                <div className="mt-1 text-sm">
                  {computed.error ? (
                    <span className="text-sm text-destructive">{computed.error}</span>
                  ) : computed.hoursWorked != null && computed.overtimeHours != null ? (
                    <span>
                      Hours: {computed.hoursWorked.toFixed(2)} | Overtime:{" "}
                      {computed.overtimeHours.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Hours: - | Overtime: -</span>
                  )}
                </div>
              </div>

              <FieldRow label="Notes">
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring/50 focus-visible:ring-2"
                />
              </FieldRow>

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
                  type="submit"
                  disabled={Boolean(computed.error)}
                  className="h-8 inline-flex items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save Attendance
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-4 shadow-lg">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Delete attendance record for{" "}
              {activeDeleteRow ? format(asDate(activeDeleteRow.date), "dd MMM yyyy") : ""}
              ?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This attendance record will be permanently removed. (It is
              correctable.)
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
                className="h-8 inline-flex items-center justify-center rounded-md border border-red-500 bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-600/90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={confirmDelete}
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

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "green",
  suffix = "",
}: {
  label: string;
  value: number;
  tone?: "green" | "red" | "amber" | "blue" | "neutral";
  suffix?: string;
}) {
  const toneClasses =
    tone === "red"
      ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" }
      : tone === "amber"
        ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" }
        : tone === "blue"
          ? { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" }
          : tone === "neutral"
            ? { bg: "bg-muted/40", border: "border-border", text: "text-foreground" }
            : { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" };

  return (
    <div className={`rounded-md border ${toneClasses.border} ${toneClasses.bg} p-3`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClasses.text}`}>
        {tone === "neutral" ? (Number.isFinite(value) ? value.toFixed(2) : "0.00") : value}
        {suffix ? <span className="ml-1 text-sm font-medium">{suffix}</span> : null}
      </div>
    </div>
  );
}

