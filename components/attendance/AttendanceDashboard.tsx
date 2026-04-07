"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CalendarOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getDailyAttendance,
  markDayAsHoliday,
  upsertAttendance,
  upsertBulkAttendance,
} from "@/actions/attendance";

type EmploymentType = "PERMANENT" | "DAILY";
type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY";

type EmployeeAttendanceRow = {
  employeeId: string;
  employeeName: string;
  department: string;
  employmentType: EmploymentType;
  attendance: {
    id: string | null;
    status: AttendanceStatus | null;
    checkIn: string | null;
    checkOut: string | null;
    hoursWorked: number | null;
    overtimeHours: number | null;
    notes: string | null;
  } | null;
  onLeave: boolean;
};

type UpsertAttendanceInput = {
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
};

type TimeParts = {
  hour: string;
  minute: string;
  ampm: "AM" | "PM";
};

const HOUR_OPTIONS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MINUTE_OPTIONS = ["00", "15", "30", "45"];

function parseTime12h(value: string | null | undefined): TimeParts | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const h = String(Number(match[1])).padStart(2, "0");
  const minute = match[2];
  const ampm = match[3].toUpperCase() as "AM" | "PM";
  return { hour: h, minute, ampm };
}

function to24Hour(parts: TimeParts | null) {
  if (!parts) return undefined;
  let hour24 = Number(parts.hour) % 12;
  if (parts.ampm === "PM") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${parts.minute}`;
}

function formatTimeFromParts(parts: TimeParts | null) {
  if (!parts) return null;
  return `${Number(parts.hour)}:${parts.minute} ${parts.ampm}`;
}

function formatStatus(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "Present";
    case "ABSENT":
      return "Absent";
    case "HALF_DAY":
      return "Half Day";
    case "LEAVE":
      return "Leave";
    case "HOLIDAY":
      return "Holiday";
  }
}

function badgeClass(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "border-green-200 bg-green-50 text-green-700";
    case "ABSENT":
      return "border-red-200 bg-red-50 text-red-700";
    case "HALF_DAY":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "LEAVE":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "HOLIDAY":
      return "border-border bg-muted text-muted-foreground";
  }
}

export function AttendanceDashboard({
  rows: initialRows,
  date,
}: {
  rows: EmployeeAttendanceRow[];
  date: Date;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(date);
  const [rows, setRows] = useState<EmployeeAttendanceRow[]>(initialRows);
  const [pendingChanges, setPendingChanges] = useState<Map<string, UpsertAttendanceInput>>(new Map());
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSavingAll, startSaveAllTransition] = useTransition();
  const [isMarkingHoliday, startMarkHolidayTransition] = useTransition();
  const [successByEmployee, setSuccessByEmployee] = useState<Record<string, boolean>>({});
  const [inlineMessage, setInlineMessage] = useState<string>("");
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(startOfMonth(date));
  const [editingByEmployee, setEditingByEmployee] = useState<Record<string, boolean>>({});
  const [timeDraftByEmployee, setTimeDraftByEmployee] = useState<
    Record<string, { checkIn: TimeParts | null; checkOut: TimeParts | null }>
  >({});
  const [notesDraftByEmployee, setNotesDraftByEmployee] = useState<Record<string, string>>({});
  const [notesPopoverOpenByEmployee, setNotesPopoverOpenByEmployee] = useState<Record<string, boolean>>({});

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let onLeave = 0;
    let notMarked = 0;
    for (const row of rows) {
      if (row.onLeave) {
        onLeave += 1;
        continue;
      }
      const status = row.attendance?.status ?? null;
      if (status === "PRESENT") present += 1;
      else if (status === "ABSENT") absent += 1;
      else if (status) present += 1;
      else notMarked += 1;
    }
    return { present, absent, onLeave, notMarked };
  }, [rows]);
  const isSundaySelected = selectedDate.getDay() === 0;

  function computeFromParts(checkInParts: TimeParts | null, checkOutParts: TimeParts | null) {
    if (!checkInParts || !checkOutParts) {
      return { hoursWorked: null as number | null, overtime: null as number | null, error: null as string | null };
    }
    const in24 = to24Hour(checkInParts);
    const out24 = to24Hour(checkOutParts);
    if (!in24 || !out24) {
      return { hoursWorked: null, overtime: null, error: null };
    }
    const [inH, inM] = in24.split(":").map(Number);
    const [outH, outM] = out24.split(":").map(Number);
    const inDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      inH,
      inM,
      0,
      0
    );
    const outDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      outH,
      outM,
      0,
      0
    );
    if (outDate.getTime() <= inDate.getTime()) {
      return { hoursWorked: null, overtime: null, error: "Check-out must be after check-in." };
    }
    const hoursWorked = Math.round(((outDate.getTime() - inDate.getTime()) / 36e5) * 100) / 100;
    const overtime = hoursWorked > 8 ? Math.round((hoursWorked - 8) * 100) / 100 : 0;
    return { hoursWorked, overtime, error: null };
  }

  async function fetchRows(nextDate: Date) {
    startLoadingTransition(async () => {
      const data = await getDailyAttendance(nextDate);
      setRows(data);
      setPendingChanges(new Map());
      setInlineMessage("");
      setEditingByEmployee({});
      setTimeDraftByEmployee({});
      setNotesDraftByEmployee({});
      setNotesPopoverOpenByEmployee({});
    });
  }

  function updateDate(nextDate: Date) {
    setSelectedDate(nextDate);
    setCalendarMonth(startOfMonth(nextDate));
    void fetchRows(nextDate);
  }

  const calendarCells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
  }, [calendarMonth]);

  function markRowSuccess(employeeId: string) {
    setSuccessByEmployee((prev) => ({ ...prev, [employeeId]: true }));
    window.setTimeout(() => {
      setSuccessByEmployee((prev) => ({ ...prev, [employeeId]: false }));
    }, 2000);
  }

  function updateRowLocal(employeeId: string, patch: Partial<EmployeeAttendanceRow["attendance"]> | null) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.employeeId !== employeeId) return row;
        if (patch === null) return { ...row, attendance: null };
        const existing = row.attendance ?? {
          id: null,
          status: null,
          checkIn: null,
          checkOut: null,
          hoursWorked: null,
          overtimeHours: null,
          notes: null,
        };
        return { ...row, attendance: { ...existing, ...patch } };
      })
    );
  }

  function setEditing(employeeId: string, value: boolean) {
    setEditingByEmployee((prev) => ({ ...prev, [employeeId]: value }));
  }

  function setRowDraftTime(
    employeeId: string,
    field: "checkIn" | "checkOut",
    next: Partial<TimeParts> | null
  ) {
    setTimeDraftByEmployee((prev) => {
      const current = prev[employeeId] ?? { checkIn: null, checkOut: null };
      const currentField = current[field];
      let nextField: TimeParts | null;
      if (next === null) {
        nextField = null;
      } else {
        nextField = {
          hour: next.hour ?? currentField?.hour ?? (field === "checkIn" ? "09" : "06"),
          minute: next.minute ?? currentField?.minute ?? "00",
          ampm: next.ampm ?? currentField?.ampm ?? (field === "checkIn" ? "AM" : "PM"),
        };
      }

      return {
        ...prev,
        [employeeId]: {
          ...current,
          [field]: nextField,
        },
      };
    });
  }

  function buildPayloadForRow(row: EmployeeAttendanceRow): UpsertAttendanceInput {
    const draft = timeDraftByEmployee[row.employeeId] ?? {
      checkIn: parseTime12h(row.attendance?.checkIn) ?? null,
      checkOut: parseTime12h(row.attendance?.checkOut) ?? null,
    };
    const status = (row.attendance?.status ?? "ABSENT") as AttendanceStatus;
    const notesValue =
      notesDraftByEmployee[row.employeeId] ?? row.attendance?.notes ?? undefined;

    return {
      employeeId: row.employeeId,
      date: selectedDate,
      status,
      checkIn: status === "PRESENT" ? to24Hour(draft.checkIn) : undefined,
      checkOut: status === "PRESENT" ? to24Hour(draft.checkOut) : undefined,
      notes: notesValue?.trim() ? notesValue.trim() : undefined,
    };
  }

  function syncPendingForRow(row: EmployeeAttendanceRow) {
    const payload = buildPayloadForRow(row);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(row.employeeId, payload);
      return next;
    });
  }

  function enterInlineEdit(row: EmployeeAttendanceRow) {
    if (row.onLeave || row.attendance?.status === "HOLIDAY") return;
    const checkIn = parseTime12h(row.attendance?.checkIn) ?? null;
    const checkOut = parseTime12h(row.attendance?.checkOut) ?? null;
    setTimeDraftByEmployee((prev) => ({
      ...prev,
      [row.employeeId]: { checkIn, checkOut },
    }));
    setNotesDraftByEmployee((prev) => ({
      ...prev,
      [row.employeeId]: row.attendance?.notes ?? "",
    }));
    setEditing(row.employeeId, true);
    syncPendingForRow(row);
  }

  function handlePresent(row: EmployeeAttendanceRow) {
    if (row.onLeave || row.attendance?.status === "HOLIDAY") return;
    updateRowLocal(row.employeeId, {
      status: "PRESENT",
      checkIn: row.attendance?.checkIn ?? null,
      checkOut: row.attendance?.checkOut ?? null,
      hoursWorked: row.attendance?.hoursWorked ?? null,
      overtimeHours: row.attendance?.overtimeHours ?? null,
      notes: row.attendance?.notes ?? null,
    });
    const nextRow: EmployeeAttendanceRow = {
      ...row,
      attendance: {
        id: row.attendance?.id ?? null,
        status: "PRESENT",
        checkIn: row.attendance?.checkIn ?? null,
        checkOut: row.attendance?.checkOut ?? null,
        hoursWorked: row.attendance?.hoursWorked ?? null,
        overtimeHours: row.attendance?.overtimeHours ?? null,
        notes: row.attendance?.notes ?? null,
      },
    };
    enterInlineEdit(nextRow);
  }

  function handleAbsent(row: EmployeeAttendanceRow) {
    if (row.onLeave || row.attendance?.status === "HOLIDAY") return;
    updateRowLocal(row.employeeId, {
      status: "ABSENT",
      checkIn: null,
      checkOut: null,
      hoursWorked: null,
      overtimeHours: null,
      notes: null,
    });
    setTimeDraftByEmployee((prev) => ({
      ...prev,
      [row.employeeId]: { checkIn: null, checkOut: null },
    }));
    setEditing(row.employeeId, true);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(row.employeeId, {
        employeeId: row.employeeId,
        date: selectedDate,
        status: "ABSENT",
        notes: (notesDraftByEmployee[row.employeeId] ?? row.attendance?.notes ?? "").trim() || undefined,
      });
      return next;
    });
  }

  async function saveSinglePending(employeeId: string) {
    const payload = pendingChanges.get(employeeId);
    if (!payload) return;
    const row = rows.find((r) => r.employeeId === employeeId);
    if (!row) return;
    const draft = timeDraftByEmployee[employeeId] ?? {
      checkIn: parseTime12h(row.attendance?.checkIn) ?? null,
      checkOut: parseTime12h(row.attendance?.checkOut) ?? null,
    };
    const computed = computeFromParts(draft.checkIn, draft.checkOut);
    if (payload.status === "PRESENT" && computed.error) return;

    const res = await upsertAttendance(payload);
    if (!res?.error) {
      const finalStatus = payload.status;
      updateRowLocal(employeeId, {
        status: finalStatus,
        checkIn: finalStatus === "PRESENT" ? formatTimeFromParts(draft.checkIn) : null,
        checkOut: finalStatus === "PRESENT" ? formatTimeFromParts(draft.checkOut) : null,
        hoursWorked: finalStatus === "PRESENT" ? computed.hoursWorked : null,
        overtimeHours: finalStatus === "PRESENT" ? computed.overtime : null,
        notes: payload.notes ?? null,
      });
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(employeeId);
        return next;
      });
      setEditing(employeeId, false);
      markRowSuccess(employeeId);
      router.refresh();
    }
  }

  async function saveAllPending() {
    if (pendingChanges.size === 0) return;
    const records = [...pendingChanges.values()];
    startSaveAllTransition(async () => {
      const res = await upsertBulkAttendance(records);
      if (!res?.error) {
        const count = records.length;
        setPendingChanges(new Map());
        setInlineMessage(`${count} attendance records saved.`);
        setEditingByEmployee({});
        router.refresh();
      }
    });
  }

  async function saveNoteForRow(row: EmployeeAttendanceRow) {
    const employeeId = row.employeeId;
    const note = (notesDraftByEmployee[employeeId] ?? "").slice(0, 200);
    const basePayload = buildPayloadForRow(row);
    const payload: UpsertAttendanceInput = {
      ...basePayload,
      notes: note.trim() ? note.trim() : undefined,
    };

    const res = await upsertAttendance(payload);
    if (res?.error) return;

    updateRowLocal(employeeId, {
      notes: payload.notes ?? null,
    });
    setNotesPopoverOpenByEmployee((prev) => ({ ...prev, [employeeId]: false }));
    markRowSuccess(employeeId);
    router.refresh();
  }

  async function confirmMarkHoliday() {
    startMarkHolidayTransition(async () => {
      const result = await markDayAsHoliday(selectedDate);
      if (!result?.success) return;

      const data = await getDailyAttendance(selectedDate);
      setRows(data);
      setPendingChanges(new Map());
      setInlineMessage(`${result.count} employees marked as Holiday.`);
      setHolidayDialogOpen(false);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-md border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No active employees found. Add employees to start tracking attendance.
        </p>
        <div className="mt-4">
          <Link
            href="/employees"
            className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-black/90"
          >
            Go to Employees
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
              onClick={() => updateDate(addDays(selectedDate, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="size-4" />
            </button>

            <Popover.Root
              open={datePopoverOpen}
              onOpenChange={(open) => {
                setDatePopoverOpen(open);
                if (open) setCalendarMonth(startOfMonth(selectedDate));
              }}
            >
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
                >
                  {format(selectedDate, "dd MMM yyyy")}
                  <ChevronDown className="size-4" />
                </button>
              </Popover.Trigger>

              <Popover.Portal>
                <Popover.Content
                  sideOffset={8}
                  align="center"
                  className="z-50 w-[320px] rounded-md border bg-background p-3 shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                      onClick={() => setCalendarMonth((m) => addDays(startOfMonth(m), -1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <p className="text-sm font-semibold">{format(calendarMonth, "MMMM yyyy")}</p>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                      onClick={() =>
                        setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                      }
                      aria-label="Next month"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>

                  <div className="mb-2 grid grid-cols-7 text-center text-xs text-muted-foreground">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((day) => {
                      const selected = isSameDay(day, selectedDate);
                      const muted = !isSameMonth(day, calendarMonth);
                      const today = isToday(day);
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          className={[
                            "h-9 rounded-md text-sm transition-colors",
                            selected
                              ? "bg-black font-semibold text-white hover:bg-black/90"
                              : "hover:bg-muted",
                            muted ? "text-muted-foreground" : "text-foreground",
                            today && !selected ? "font-semibold underline underline-offset-2" : "",
                          ].join(" ")}
                          onClick={() => {
                            updateDate(day);
                            setDatePopoverOpen(false);
                          }}
                        >
                          {format(day, "d")}
                        </button>
                      );
                    })}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
              onClick={() => updateDate(addDays(selectedDate, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <AlertDialog.Root open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
            <AlertDialog.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <CalendarOff className="size-4" />
                Mark as Holiday
              </button>
            </AlertDialog.Trigger>

            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg">
                <AlertDialog.Title className="text-base font-semibold">
                  Mark {format(selectedDate, "dd MMM yyyy")} as Holiday?
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                  All active employees will be marked as Holiday for this date.
                  This will overwrite existing records.
                </AlertDialog.Description>

                <div className="mt-5 flex justify-end gap-2">
                  <AlertDialog.Cancel asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={(e) => {
                        e.preventDefault();
                        void confirmMarkHoliday();
                      }}
                      disabled={isMarkingHoliday}
                    >
                      Confirm Holiday
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      </div>

      {isSundaySelected ? (
        <div className="mb-4 w-full rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          🗓️ Sunday — Weekly Off. All employees marked as Holiday. Edit individual rows to override.
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border bg-card p-3">
          <div className="text-xs text-muted-foreground">Present</div>
          <div className="text-lg font-semibold">{summary.present}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="text-xs text-muted-foreground">Absent</div>
          <div className="text-lg font-semibold">{summary.absent}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="text-xs text-muted-foreground">On Leave</div>
          <div className="text-lg font-semibold">{summary.onLeave}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="text-xs text-muted-foreground">Not Marked</div>
          <div className="text-lg font-semibold">{summary.notMarked}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Check In</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Check Out</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hours</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">OT Hours</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = row.attendance?.status ?? null;
              const isMarked = Boolean(status);
              const showSuccess = Boolean(successByEmployee[row.employeeId]);
              return (
                <tr
                  key={row.employeeId}
                  className={row.onLeave ? "bg-blue-50" : "border-t"}
                >
                  <td className="px-3 py-2 font-medium">{row.employeeName}</td>
                  <td className="px-3 py-2">
                    {row.onLeave ? (
                      <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        On Leave
                      </span>
                    ) : editingByEmployee[row.employeeId] ? (
                      <select
                        value={(status === "ABSENT" ? "ABSENT" : "PRESENT") as "PRESENT" | "ABSENT"}
                        onChange={(e) => {
                          const nextStatus = e.target.value as "PRESENT" | "ABSENT";
                          if (nextStatus === "ABSENT") {
                            updateRowLocal(row.employeeId, {
                              status: "ABSENT",
                              checkIn: null,
                              checkOut: null,
                              hoursWorked: null,
                              overtimeHours: null,
                            });
                            setTimeDraftByEmployee((prev) => ({
                              ...prev,
                              [row.employeeId]: { checkIn: null, checkOut: null },
                            }));
                          } else {
                            updateRowLocal(row.employeeId, {
                              status: "PRESENT",
                            });
                            setTimeDraftByEmployee((prev) => {
                              const existing = prev[row.employeeId] ?? {
                                checkIn: parseTime12h(row.attendance?.checkIn) ?? null,
                                checkOut: parseTime12h(row.attendance?.checkOut) ?? null,
                              };
                              return {
                                ...prev,
                                [row.employeeId]: existing,
                              };
                            });
                          }
                          setPendingChanges((prev) => {
                            const next = new Map(prev);
                            next.set(row.employeeId, {
                              employeeId: row.employeeId,
                              date: selectedDate,
                              status: nextStatus,
                              checkIn:
                                nextStatus === "PRESENT"
                                  ? to24Hour(
                                      timeDraftByEmployee[row.employeeId]?.checkIn ??
                                        parseTime12h(row.attendance?.checkIn) ??
                                        null
                                    )
                                  : undefined,
                              checkOut:
                                nextStatus === "PRESENT"
                                  ? to24Hour(
                                      timeDraftByEmployee[row.employeeId]?.checkOut ??
                                        parseTime12h(row.attendance?.checkOut) ??
                                        null
                                    )
                                  : undefined,
                              notes:
                                (notesDraftByEmployee[row.employeeId] ?? row.attendance?.notes ?? "")
                                  .trim() || undefined,
                            });
                            return next;
                          });
                        }}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="PRESENT">PRESENT</option>
                        <option value="ABSENT">ABSENT</option>
                      </select>
                    ) : status ? (
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${badgeClass(status)}`}>
                        {formatStatus(status)}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-green-300 px-2 text-xs font-medium text-green-700 hover:bg-green-50"
                          onClick={() => handlePresent(row)}
                        >
                          <Check className="size-3.5" />
                          Present
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-red-300 px-2 text-xs font-medium text-red-700 hover:bg-red-50"
                          onClick={() => handleAbsent(row)}
                        >
                          <X className="size-3.5" />
                          Absent
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.onLeave || status === "ABSENT" || status === "HOLIDAY" ? (
                      "-"
                    ) : editingByEmployee[row.employeeId] && status === "PRESENT" ? (
                      <div className="grid grid-cols-3 gap-1">
                        <select
                          value={timeDraftByEmployee[row.employeeId]?.checkIn?.hour ?? ""}
                          onChange={(e) => {
                            setRowDraftTime(row.employeeId, "checkIn", e.target.value ? { hour: e.target.value } : null);
                            syncPendingForRow(row);
                          }}
                          className="h-8 rounded-md border bg-background px-1 text-xs"
                        >
                          <option value="">HH</option>
                          {HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <select
                          value={timeDraftByEmployee[row.employeeId]?.checkIn?.minute ?? ""}
                          onChange={(e) => {
                            setRowDraftTime(row.employeeId, "checkIn", e.target.value ? { minute: e.target.value } : null);
                            syncPendingForRow(row);
                          }}
                          className="h-8 rounded-md border bg-background px-1 text-xs"
                        >
                          <option value="">MM</option>
                          {MINUTE_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <select
                          value={timeDraftByEmployee[row.employeeId]?.checkIn?.ampm ?? "AM"}
                          onChange={(e) => {
                            setRowDraftTime(row.employeeId, "checkIn", { ampm: e.target.value as "AM" | "PM" });
                            syncPendingForRow(row);
                          }}
                          className="h-8 rounded-md border bg-background px-1 text-xs"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    ) : (
                      row.attendance?.checkIn ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.onLeave || status === "ABSENT" || status === "HOLIDAY" ? (
                      "-"
                    ) : editingByEmployee[row.employeeId] && status === "PRESENT" ? (
                      <div className="space-y-1">
                        <div className="grid grid-cols-3 gap-1">
                          <select
                            value={timeDraftByEmployee[row.employeeId]?.checkOut?.hour ?? ""}
                            onChange={(e) => {
                              setRowDraftTime(row.employeeId, "checkOut", e.target.value ? { hour: e.target.value } : null);
                              syncPendingForRow(row);
                            }}
                            className="h-8 rounded-md border bg-background px-1 text-xs"
                          >
                            <option value="">HH</option>
                            {HOUR_OPTIONS.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          <select
                            value={timeDraftByEmployee[row.employeeId]?.checkOut?.minute ?? ""}
                            onChange={(e) => {
                              setRowDraftTime(row.employeeId, "checkOut", e.target.value ? { minute: e.target.value } : null);
                              syncPendingForRow(row);
                            }}
                            className="h-8 rounded-md border bg-background px-1 text-xs"
                          >
                            <option value="">MM</option>
                            {MINUTE_OPTIONS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <select
                            value={timeDraftByEmployee[row.employeeId]?.checkOut?.ampm ?? "PM"}
                            onChange={(e) => {
                              setRowDraftTime(row.employeeId, "checkOut", { ampm: e.target.value as "AM" | "PM" });
                              syncPendingForRow(row);
                            }}
                            className="h-8 rounded-md border bg-background px-1 text-xs"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                        {(() => {
                          const draft = timeDraftByEmployee[row.employeeId];
                          const computed = computeFromParts(draft?.checkIn ?? null, draft?.checkOut ?? null);
                          return computed.error ? (
                            <p className="text-[11px] text-red-600">Check-out must be after check-in</p>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      row.attendance?.checkOut ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.onLeave || status === "ABSENT" || status === "HOLIDAY"
                      ? "-"
                      : (() => {
                          if (editingByEmployee[row.employeeId] && status === "PRESENT") {
                            const draft = timeDraftByEmployee[row.employeeId];
                            const computed = computeFromParts(draft?.checkIn ?? null, draft?.checkOut ?? null);
                            return computed.hoursWorked != null
                              ? `${computed.hoursWorked.toFixed(2)} hrs`
                              : "-";
                          }
                          return row.attendance?.hoursWorked != null
                            ? `${row.attendance.hoursWorked.toFixed(2)} hrs`
                            : "-";
                        })()}
                  </td>
                  <td className="px-3 py-2">
                    {row.onLeave || status === "ABSENT" || status === "HOLIDAY" ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      (() => {
                        if (editingByEmployee[row.employeeId] && status === "PRESENT") {
                          const draft = timeDraftByEmployee[row.employeeId];
                          const computed = computeFromParts(draft?.checkIn ?? null, draft?.checkOut ?? null);
                          if (computed.overtime != null && computed.overtime > 0) {
                            return <span className="text-amber-700">{computed.overtime.toFixed(2)} hrs</span>;
                          }
                          return <span className="text-muted-foreground">-</span>;
                        }
                        if (row.attendance?.overtimeHours && row.attendance.overtimeHours > 0) {
                          return <span className="text-amber-700">{row.attendance.overtimeHours.toFixed(2)} hrs</span>;
                        }
                        return <span className="text-muted-foreground">-</span>;
                      })()
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {!row.onLeave && status !== "HOLIDAY" ? (
                        <Popover.Root
                          open={Boolean(notesPopoverOpenByEmployee[row.employeeId])}
                          onOpenChange={(open) => {
                            setNotesPopoverOpenByEmployee((prev) => ({
                              ...prev,
                              [row.employeeId]: open,
                            }));
                            if (open) {
                              setNotesDraftByEmployee((prev) => ({
                                ...prev,
                                [row.employeeId]: row.attendance?.notes ?? "",
                              }));
                            }
                          }}
                        >
                          <Popover.Trigger asChild>
                            <Tooltip.Root>
                              {row.attendance?.notes ? (
                                <Tooltip.Trigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 border border-amber-400 hover:bg-amber-200"
                                    aria-label={`Notes for ${row.employeeName}`}
                                  >
                                    <FileText className="size-3.5 text-amber-600" />
                                  </button>
                                </Tooltip.Trigger>
                              ) : (
                                <Tooltip.Trigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                                    aria-label={`Notes for ${row.employeeName}`}
                                  >
                                    <FileText className="size-3.5 text-muted-foreground" />
                                  </button>
                                </Tooltip.Trigger>
                              )}

                              {row.attendance?.notes ? (
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    side="top"
                                    align="center"
                                    className="z-50 max-w-[220px] rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg"
                                  >
                                    {(() => {
                                      const t = (row.attendance?.notes ?? "").trim();
                                      return t.length > 50 ? `${t.slice(0, 50)}…` : t;
                                    })()}
                                    <Tooltip.Arrow className="fill-black" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              ) : null}
                            </Tooltip.Root>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              sideOffset={8}
                              align="start"
                              className="z-50 w-64 rounded-md border bg-background p-3 shadow-md"
                            >
                              <textarea
                                value={notesDraftByEmployee[row.employeeId] ?? ""}
                                onChange={(e) =>
                                  setNotesDraftByEmployee((prev) => ({
                                    ...prev,
                                    [row.employeeId]: e.target.value.slice(0, 200),
                                  }))
                                }
                                className="min-h-[90px] w-full rounded-md border bg-background px-2 py-1 text-sm"
                                placeholder="Add notes..."
                              />
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center rounded-md bg-black px-2 text-xs font-medium text-white hover:bg-black/90"
                                  onClick={() => void saveNoteForRow(row)}
                                >
                                  Save Note
                                </button>
                              </div>
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      ) : null}

                      {!row.onLeave && isMarked && status !== "HOLIDAY" && !editingByEmployee[row.employeeId] ? (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                          onClick={() => enterInlineEdit(row)}
                          aria-label={`Edit ${row.employeeName} attendance`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      ) : null}

                      {editingByEmployee[row.employeeId] && pendingChanges.has(row.employeeId) ? (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-md bg-black px-2 text-xs font-medium text-white hover:bg-black/90 disabled:opacity-50"
                          onClick={() => void saveSinglePending(row.employeeId)}
                          disabled={(() => {
                            const payload = pendingChanges.get(row.employeeId);
                            if (!payload || payload.status !== "PRESENT") return false;
                            const draft = timeDraftByEmployee[row.employeeId];
                            const computed = computeFromParts(draft?.checkIn ?? null, draft?.checkOut ?? null);
                            return Boolean(computed.error);
                          })()}
                        >
                          Save
                        </button>
                      ) : null}

                      {showSuccess ? (
                        <span className="inline-flex items-center text-green-700">
                          <Check className="size-4" />
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pendingChanges.size > 0 ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void saveAllPending()}
            disabled={isSavingAll}
            className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save All Attendance ({pendingChanges.size} pending)
          </button>
        </div>
      ) : null}

      {inlineMessage ? (
        <p className="mt-3 text-sm text-green-700">{inlineMessage}</p>
      ) : null}

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading attendance...</p>
      ) : null}
    </Tooltip.Provider>
  );
}

