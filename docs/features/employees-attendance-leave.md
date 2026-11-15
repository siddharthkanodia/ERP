# PRD: Employees, Departments, Attendance & Leave

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Employee master data, departments, daily attendance (per-employee and company-wide bulk entry), leave records
**Source of truth:** `actions/employees.ts`, `actions/attendance.ts`, `actions/departments.ts`, `app/(dashboard)/employees/**`, `app/(dashboard)/attendance/**`, `components/employees/EmployeeForm.tsx`, `components/attendance/AttendanceDashboard.tsx`

> This document describes only what the current code does. See §9 for dead/unused code and structural gaps found during review.

## 1. Overview

Employees belong to a Department and are either `PERMANENT` (paid `monthlySalary`) or `DAILY` (paid `dailyWage`). Attendance is entered manually (check-in/check-out times, not device punches) per employee per day, with hours and overtime computed from those times. Leave is a completely separate model from Attendance — the two are not reconciled by any code.

## 2. Routes / Pages

| Route | File | Purpose |
|---|---|---|
| `/employees` | `app/(dashboard)/employees/page.tsx` | List + search; client `EmployeeDashboard` (also hosts the "Manage Departments" modal — there is no separate departments route) |
| `/employees/new` | `app/(dashboard)/employees/new/page.tsx` | Create form (`EmployeeForm`, create mode) |
| `/employees/[id]/edit` | `app/(dashboard)/employees/[id]/edit/page.tsx` | Edit form; shows "Employee not found" inline (no `notFound()`) if soft-deleted/missing |
| `/employees/[id]/attendance` | `app/(dashboard)/employees/[id]/attendance/page.tsx` | Per-employee attendance for the current month; uses `notFound()` if employee missing |
| `/employees/[id]/leaves` | `app/(dashboard)/employees/[id]/leaves/page.tsx` | Per-employee leave records; uses `notFound()` if employee missing |
| `/attendance` | `app/(dashboard)/attendance/page.tsx` | Company-wide daily roster for one date; client `AttendanceDashboard` |

## 3. Data Model (relevant fields)

- `Department`: `id`, `companyId`, `name`, timestamps.
- `Employee`: `id`, `companyId`, `name`, `phone?`, `employmentType` (`PERMANENT`/`DAILY`), `status` (`ACTIVE`/`INACTIVE`), `monthlySalary?` (PERMANENT only), `dailyWage?` (DAILY only), `hireDate`, `departmentId`, `isDeleted`, `deletedAt?`, timestamps.
- `Attendance`: `id`, `companyId`, `employeeId`, `date` (date-only), `status` (`PRESENT, ABSENT, HALF_DAY, LEAVE, HOLIDAY`), `checkIn?`, `checkOut?`, `hoursWorked?`, `overtimeHours?`, `notes?`. `@@unique([employeeId, date])`.
- `Leave`: `id`, `companyId`, `employeeId`, `leaveType` (`CASUAL, SICK, UNPAID, OTHER`), `startDate`, `endDate`, `totalDays` (Int), `reason?`, `notes?`, timestamps.

## 4. Employee CRUD (`actions/employees.ts`)

Shared validation (`validateEmployeeInput`, used by both create and update):

| Condition | Error |
|---|---|
| Name empty after trim | `"Employee name must not be empty."` |
| Department id empty | `"Department id is required."` |
| Hire date unparseable | `"Invalid hire date."` |
| Hire date in the future | `"Hire date cannot be in the future."` |
| `employmentType === "PERMANENT"` and `monthlySalary` not finite or `<=0` | `"Monthly salary must be greater than 0 for PERMANENT employees."` |
| `employmentType === "DAILY"` and `dailyWage` not finite or `<=0` | `"Daily wage must be greater than 0 for DAILY employees."` |

The field not applicable to the chosen `employmentType` is force-nulled on write (e.g. a PERMANENT employee's `dailyWage` is always saved as `null`).

| Action | Extra checks | Effect |
|---|---|---|
| `createEmployee(data)` | Department must belong to the caller's company → `"Department does not exist."` | Creates the row; `status` defaults to `"ACTIVE"`. `revalidatePath("/employees")` |
| `updateEmployee(id, data)` | `"Invalid employee id."`; `"Employee not found."`; if `employmentType` is changing **and** the employee has any existing `Attendance` rows → `"Cannot change employment type when attendance records exist."`; department ownership check as above | Updates the row. `revalidatePath("/employees")` and the edit page path |
| `setEmployeeStatus(id, status)` | `"Invalid employee id."` only | Toggles `ACTIVE`/`INACTIVE` directly, with no other validation. `revalidatePath("/employees")` |
| `deleteEmployee(id)` | — | **Soft delete only**: `isDeleted: true, deletedAt: now`. Does not touch `Attendance` or `Leave` rows. `revalidatePath("/employees")` |
| `searchEmployees(query)` | Empty query returns `[]` (not "all employees") | Case-insensitive match on `name` or `phone`, scoped to `isDeleted:false` |

**Effect of soft-deleting an employee:** their `Attendance`/`Leave` rows remain in the database untouched, but `getEmployeeById` (used by both the attendance and leave sub-pages to resolve the employee first) returns `null` for a soft-deleted employee, and both sub-pages call `notFound()` in that case — so a soft-deleted employee's attendance and leave history becomes **unreachable through the UI**, even though the underlying rows still exist. There is **no `restoreEmployee` action anywhere in the codebase** — once soft-deleted, there is no code path back to active.

Employee form fields (`EmployeeForm.tsx`): `name`, `phone` (optional), `departmentId` (select), `employmentType` (toggle — switching clears both salary fields), `monthlySalary` (shown only if PERMANENT), `dailyWage` (shown only if DAILY), `hireDate` (max = today), `status` (Active/Inactive switch, default Active). Client-side validation mirrors the server list above.

## 5. Attendance Mechanics (`actions/attendance.ts`)

Check-in/check-out are **manually entered** (`<input type="time">` on the per-employee page; hour/minute/AM-PM dropdowns on the company-wide dashboard) — there is no device-punch integration. `hoursWorked` and `overtimeHours` are computed from those two manual times using the same formula in every entry point (server `markAttendance`/`upsertAttendance`/`upsertBulkAttendance`, and mirrored client-side for live preview):

```
diffHours = (checkOutTimestamp - checkInTimestamp) / 3,600,000
hoursWorked = round(diffHours, 2 decimals)
overtimeHours = hoursWorked > 8 ? round(hoursWorked - 8, 2) : 0
```

The 8-hour threshold is a flat constant applied identically regardless of `employmentType` (PERMANENT vs DAILY) — there is no per-employee configurable shift length. If check-out is not after check-in: `"Check-out must be after check-in"` (server) / `"Check Out must be after Check In."` (dialog copy). `hoursWorked`/`overtimeHours` computation in `upsertAttendance`/`upsertBulkAttendance` is gated to `status === "PRESENT"` only; `markAttendance` gates on checkIn/checkOut both being present instead.

| Action | Validation | Effect |
|---|---|---|
| `markAttendance(...)` | Employee must be `isDeleted:false, status:"ACTIVE"` → `"Employee not found or is not active"`; date not in the future → `"Attendance date cannot be in the future"` | Upsert on `(companyId, employeeId, date)` via a manual findFirst-then-create/update (**not wrapped in a `prisma.$transaction`**, despite a code comment noting awareness of composite-unique-key handling differences across Prisma versions) |
| `upsertAttendance(...)` / `upsertBulkAttendance(records)` | same shape | Same upsert semantics, but run inside `prisma.$transaction` (bulk: one transaction for every pending row) |
| `deleteAttendanceRecord(id)` | `"Invalid attendance id"`; `"Attendance record not found"` | **Hard delete** (`prisma.attendance.delete`) — not soft-deleted |
| `getAttendanceByEmployee(employeeId, month?)` | — | Defaults to trailing 30 days if no month given, else the full calendar month |
| `getDailyAttendance(date)` | — | Company-wide roster for one date. **Auto-generates Sunday holidays as a side effect of this read**: if the target date is a Sunday, any active employee missing a row for that date is auto-created/overwritten to `status: "HOLIDAY"` inside a transaction |
| `markDayAsHoliday(date)` | — | Explicit bulk action (any day of week): force-overwrites **every** active employee's row for that date to `HOLIDAY`, clearing checkIn/checkOut/hours/overtime/notes. Confirmation copy: *"All active employees will be marked as Holiday for this date. This will overwrite existing records."* |

**HOLIDAY/LEAVE status on `Attendance` is fully independent of the `Leave` model.** `getDailyAttendance` separately computes an `onLeave` flag per employee by querying `Leave` rows overlapping the target date; this flag drives UI (blue highlight, "On Leave" badge, disabled Present/Absent controls) but is not read from or written to `Attendance.status`. Manually setting `Attendance.status = "LEAVE"` for an employee does not create a `Leave` row, and creating a `Leave` record does not update any `Attendance` row — **the two signals can disagree** for the same employee and date.

## 6. Leave (`actions/employees.ts`)

`totalDays` is **calendar days, inclusive**, not business days — computed as `floor((endDate - startDate) / 1 day) + 1`, with no weekend or holiday exclusion (duplicated identically client-side).

| Action | Validation | Effect |
|---|---|---|
| `createLeave(data)` | `"Invalid employee id"`; `"endDate must be >= startDate"`; employee must be `isDeleted:false, status:"ACTIVE"` → `"Employee must be ACTIVE and not deleted"`; **server-side overlap check** against existing leave rows for the same employee (inclusive date-range overlap) → `"Leave dates overlap with an existing leave record"` | Creates the row. No interaction with `Attendance` for the covered dates. `revalidatePath` on the employee's leave page |
| `deleteLeave(id)` | `"Invalid leave id"`; `"Leave record not found"` | Hard delete. Revalidates the leave page, the edit page, and `/employees` |
| `getLeavesByEmployee(id)` | — | Lists raw records; the leave page only tallies counts by type for display |

There is **no leave balance/quota/accrual model** — no annual entitlement field exists, and every created leave record is implicitly "approved" the instant it is entered (no `PENDING`/`APPROVED`/`REJECTED` status field).

## 7. Department CRUD (`actions/departments.ts`)

| Action | Validation | Effect |
|---|---|---|
| `getAllDepartments()` | — | Returns each department with its `activeEmployeeCount` (`isDeleted:false, status:"ACTIVE"`) |
| `createDepartment(name)` | `"Department name must not be empty"`; case-insensitive duplicate → `"Department already exists"` | Creates the row |
| `deleteDepartment(id)` | `"Invalid department id"`; `"Department not found"`; department must belong to caller's company (`throw "Forbidden"` if not — an actual thrown exception, not a returned error object); **blocked if the department has any active employees** → `"Cannot delete department with active employees"` (only `ACTIVE` employees count — INACTIVE and soft-deleted employees do not block deletion) | Deletes the department row. No code reassigns or nulls `departmentId` on any remaining (inactive/soft-deleted) employees who still point at it |

**There is no `updateDepartment` action** — departments cannot be renamed once created.

## 8. Bulk Attendance Entry (`AttendanceDashboard.tsx`, `/attendance`)

The company-wide roster is the only "mark the whole day at once" surface:

- Loads every active employee for the selected date; unmarked rows show quick Present/Absent buttons.
- Clicking Present opens inline hour/minute/AM-PM dropdowns for check-in/check-out, computing hours/OT live with the same `>8h = OT` rule.
- Edits accumulate in local state until either a per-row "Save" (calls `upsertAttendance`) or the page-level **"Save All Attendance (N pending)"** button (calls `upsertBulkAttendance` — one transaction for all pending rows).
- **"Mark as Holiday"** button opens a confirmation dialog and, on confirm, calls `markDayAsHoliday`, overwriting every active employee's record for that date.
- On a Sunday, a banner reads: *"🗓️ Sunday — Weekly Off. All employees marked as Holiday. Edit individual rows to override."* (driven by `getDailyAttendance`'s auto-holiday side effect described in §5).
- Per-row notes editor caps input at 200 characters and saves independently via `upsertAttendance`.
- Employees currently on approved `Leave` (`onLeave`) are highlighted and cannot be marked Present/Absent or edited from this screen.

## 9. Access Control

Reachable by ADMIN and MANAGER only (per `components/sidebar-nav.tsx`, allowed roles `["ADMIN","MANAGER"]` for both "Employees" and "Attendance"); OPERATOR is blocked at the middleware layer (`proxy.ts` redirects OPERATOR away from `/employees` and `/attendance`); SUPER_ADMIN only while impersonating. No additional role check inside the server actions themselves beyond requiring a `companyId` on the session.

## 10. Known Issues / Structural Gaps

- **No employee restore path.** Once `deleteEmployee` sets `isDeleted:true`, no action exists to reverse it, and the employee's attendance/leave sub-pages 404 even though their historical rows remain in the database.
- **Department deletion never cleans up dangling `departmentId` references** on inactive/soft-deleted employees left pointing at a deleted department; behavior at the database level was not verified in this review.
- **No payroll computation exists anywhere.** `hoursWorked`/`overtimeHours` are computed and stored, but nothing in the codebase multiplies them against `monthlySalary`/`dailyWage`, applies an overtime rate, or produces a pay figure.
- **The 8-hour overtime threshold applies uniformly to DAILY employees**, with no differentiation for daily-wage workers who may not be expected to be tracked by exact hours at all.
- **No leave balance/quota/accrual or approval workflow** — every leave record is immediately final.
- **Leave uses calendar days while Attendance treats Sundays as holidays** — the two counting conventions are inconsistent with each other.
- **`Attendance.status` (LEAVE/HOLIDAY) and the `Leave` model are fully decoupled** and can silently disagree for the same employee/date, as described in §5.
- **`markAttendance`'s upsert is not wrapped in a `prisma.$transaction`**, unlike `upsertBulkAttendance` and the Sunday-auto-holiday/`markDayAsHoliday` flows — a race-condition risk under concurrent requests for the same `(employeeId, date)`.
- **`setEmployeeStatus` has no guard analogous to `updateEmployee`'s employment-type-change block** — an employee can be deactivated with no check on pending attendance/leave.
- **No department rename action exists.**

## 11. Source Files

`actions/employees.ts`, `actions/attendance.ts`, `actions/departments.ts`, `app/(dashboard)/employees/{page.tsx,employee-dashboard.tsx,new/page.tsx,[id]/edit/page.tsx,[id]/attendance/{page.tsx,attendance-page.tsx},[id]/leaves/{page.tsx,leaves-page.tsx}}`, `app/(dashboard)/attendance/page.tsx`, `components/employees/EmployeeForm.tsx`, `components/attendance/AttendanceDashboard.tsx`, `prisma/schema.prisma`.
