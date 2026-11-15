# PRD: Reports & Dashboard

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** The `/reports` hub and its six report types, the `/dashboard` home screen, and the main sidebar navigation/role gating
**Source of truth:** `app/(dashboard)/reports/**`, `app/(dashboard)/dashboard/page.tsx`, `actions/reports.ts`, `actions/production-reports.ts`, `actions/waste-reports.ts`, `lib/reports/queries.ts`, `components/reports/*`, `components/dashboard/*`, `components/sidebar.tsx`, `components/sidebar-nav.tsx`

> This document describes only what the current code does. See §8 for dead/unused code found during review.

## 1. Overview

`/reports` is a hub of six report cards, each with its own filters and (mostly) its own XLSX export. `/dashboard` is a fixed set of KPI cards and charts with no user-adjustable filters. All report/dashboard queries are scoped by `session.companyId`; see §7 for what is — and is not — additionally role-gated.

## 2. Reports Hub — Routes

| Report | Route | Page file |
|---|---|---|
| Finished Goods Inventory | `/reports/inventory` | `app/(dashboard)/reports/inventory/page.tsx` |
| Raw Material Inventory | `/reports/raw-materials` | `app/(dashboard)/reports/raw-materials/page.tsx` |
| Production Floor | `/reports/production-floor` | `app/(dashboard)/reports/production-floor/page.tsx` |
| Production | `/reports/production` | `app/(dashboard)/reports/production/page.tsx` |
| Waste | `/reports/waste` | `app/(dashboard)/reports/waste/page.tsx` |
| Raw Material Issued vs Consumed ("RM Efficiency") | `/reports/production-efficiency` | `app/(dashboard)/reports/production-efficiency/page.tsx` |

## 3. Finished Goods Inventory Report (`/reports/inventory`)

Filters: single Product dropdown, From/To Month+Year (future months disabled in the option list; `toKey < fromKey` → `"End month cannot be before start month."`). Columns: `Date, Opening, Production, Dispatched, Closing` (all `.toFixed(2)`).

Query (`lib/reports/queries.ts::getFinishedGoodsReportRange`, wrapped by `actions/reports.ts::fetchFinishedGoodsInventoryReport`): computes IST-aware UTC day boundaries (`IST offset = +330 minutes`); resolves current stock (sum of variant stock if the product has variants, else product-level stock); pulls production/dispatch ledger totals both inside and after the selected range, then back-calculates the opening balance for the range start and rolls forward day by day. All figures rounded to 2 decimals.

XLSX export (`FinishedGoodsInventoryXLSXButton.tsx`): headers `["Date","Opening","Production","Dispatched","Closing"]`; sheet `"Inventory Report"`; filename `FinishedGoods_{product}_{fromMonth}-{toMonth}.xlsx`; only non-future rows are exported.

## 4. Raw Material Inventory Report (`/reports/raw-materials`)

Filters: single Raw Material dropdown, From/To Month+Year (same future-disable/range-error pattern). Columns: `Date, Opening, Received, Issued, Closing`.

Query (`actions/reports.ts::fetchRawMaterialInventoryReport` → `getRawMaterialReport`): seeds the opening balance from the most recent `RawMaterialLedger.closingBalance` before the range (ordered by `createdAt desc`), then aggregates `quantityIn`/`quantityOut` per IST day within range and rolls forward. **Uses ledger `createdAt` as the day-grouping timestamp**, not the ledger's `date` field — a different basis from the Finished Goods report, which groups by `date`.

XLSX export (`RawMaterialInventoryXLSXButton.tsx`): headers `["Date","Opening","Received","Issued","Closing"]`; sheet `"Raw Material Report"`; filename `RawMaterials_{material}_{fromMonth}-{toMonth}.xlsx`.

## 5. Production Floor Report (`/reports/production-floor`)

No filters beyond a Raw Material dropdown and From/To Month+Year (same pattern as above). Columns: `Date, Opening, Issued, Consumed, Adjusted, Closing`. Data comes from `getFloorReportRange` (documented in full in `production-floor.md` §4) — computes a range-start opening balance from all prior ledger activity, then walks every calendar day in range (including zero-activity days), classifying `ISSUE` as issued, `CONSUME` as consumed, and `ADJUSTMENT` net as adjusted.

XLSX export (`FloorReportXLSXButton.tsx`): headers `["Date","Opening","Issued","Consumed","Adjusted","Closing"]`; sheet name sanitized to ≤31 characters (Excel limit, strips `[ ] * / \ ? :`), defaulting to `"Floor Report"`; filename `ProductionFloor_{material}_{fromMonth}-{toMonth}.xlsx`; future-dated rows excluded from export.

## 6. Production Report (`/reports/production`)

Two tabs, Daily and Monthly (`components/reports/production-report.tsx`):

- **Daily**: date-range inputs (`max` = today, so future dates cannot be picked). Columns: `Date, Finished Good, Produced (pcs), Produced (kg)`, expandable to per-variant rows. Query: `actions/production-reports.ts::getDailyProductionReport(fromISO, toISO)` — reads `ProductionEntry` rows in an IST-aware UTC range, groups by IST date → product → variant.
- **Monthly**: Month + Year dropdowns (current year plus 4 prior). Columns: `Finished Good, Total (pcs), Total (kg)`. Query: `getMonthlyProductionReport(year, month)` — same grouping, no date dimension.

Both use `calculateKgWeight` (`lib/production-utils.ts`, documented in `production.md` §6) for kg conversion.

XLSX export is inline in `production-report.tsx` (dynamic `import("xlsx")`), not a separate button component: Daily columns `["Date","Finished Good","Variant","Produced (pcs)","Produced (kg)"]`, filename `production-daily-{fromISO}-to-{toISO}.xlsx`; Monthly columns `["Finished Good","Variant","Total (pcs)","Total (kg)"]`, filename `production-monthly-{monthLabel}.xlsx`.

## 7. Waste Report (`/reports/waste`)

Filters: Waste Type dropdown (blank = "All Waste Types"), From/To Month+Year. Columns: `Date, Opening Balance, Waste Generated, Waste Dispatched, Closing Balance`, plus a footer total (generated/dispatched only).

Query (`actions/waste-reports.ts::getWasteReport`): explicit authorization check `session.companyId === input.companyId` (else `Error: "Unauthorized"`); reads `FinishedProductLedger` rows where the linked `FinishedProduct.isWaste === true`, in date range, ordered `date, createdAt, id` ascending; classifies `PRODUCTION`/`RECEIPT` events as generated and `DISPATCH` as dispatched, grouped by IST date; **days with zero generated and zero dispatched are filtered out entirely**, not shown as blank rows. Uses `roundKg`/`addKg` from `lib/utils/units.ts` for rounding.

The export actually wired to this page is an **inline** `WasteXLSXButton` defined inside `waste-report.tsx` (headers `["Date","Opening Balance","Waste Generated","Waste Dispatched","Closing Balance"]`, filename `Waste_Report_{wasteType}_{fromMonth}-{toMonth}.xlsx`) — see §8 for the separate, unused standalone button component.

**Note:** this is a second, independent waste-reporting implementation from `getWasteReportRange` in `waste-management.md` §5 — the two use different balance-reconstruction techniques (this one reads stored `openingBalance`/`closingBalance` and walks forward; the other walks backward from current stock) and could disagree.

## 8. Raw Material Issued vs Consumed / "RM Efficiency" Report (`/reports/production-efficiency`)

Page title: "Raw Material Issued vs Consumed"; subtitle: "Financial Year April – March · All quantities in kg". **No user-facing filters** — always the current Financial Year (April of `curYear-1`/`curYear` through March, chosen by whether the current month is April or later).

Query (`actions/reports.ts::getMonthlyRMEfficiencyReport`), per FY month:

- `rmIssued` = sum of `ProductionFloorLedger.quantityIn` where `eventType: "ISSUE"`.
- `totalProduction` = sum of `calculateKgWeight(quantityProduced, unit, weightPerPiece)` over `ProductionEntry` rows (variant weight preferred over product weight when present).
- `totalWaste` = sum of `FinishedProductLedger.quantityProduced` where the linked product `isWaste: true` and `quantityProduced > 0`.
- `rmConsumed = totalProduction + totalWaste`.
- `differenceQty = rmIssued - rmConsumed`; `differencePercent = rmIssued > 0 ? (differenceQty / rmIssued) * 100 : 0` (rounded to 2 decimals).

All 12 FY months are pre-populated even with zero data; the current month is flagged `isCurrentMonth` for an "In Progress" UI badge. Columns: `Month, RM Issued (kg), Total Production (kg), Total Waste (kg), RM Consumed (kg), Difference (kg), Difference (%)`, plus a grouped/stacked bar chart. Export (`rm-efficiency-report.tsx`): columns `["Month","RM Issued (kg)","Total Production (kg)","Total Waste (kg)","RM Consumed (kg)","Difference (kg)","Difference (%)"]`, filename `rm-efficiency-{FYlabel}.xlsx` (e.g. `2025-26`).

## 9. Dashboard (`/dashboard`)

Single page, `export const dynamic = "force-dynamic"` (always fresh). Redirects to `/login` if `!session.companyId`.

**KPI cards** (no date-filter UI; each has a fixed implicit window):
- Active Work Orders — count of `WorkOrder` where `status: "OPEN"`.
- Total Planned Qty — sum of `plannedQuantity` over open work orders.
- Produced Today / Produced Yesterday — sum of `ProductionEntry.quantityProduced` for `entryDate` within `startOfDay`/`endOfDay` of today / yesterday, using **plain server-local time**, not the IST-offset technique used everywhere else in reporting.
- Floor Stock — sum of `ProductionFloorStock.quantityInStock` across all materials.

**Charts** (`components/dashboard/dashboard-charts.tsx`, 2-column grid), all point-in-time or fixed-window snapshots with no date controls:
1. Raw Materials — top 10 by warehouse stock; Table/Stacked-Bar toggle (warehouse vs floor stock).
2. Finished Goods Inventory — table only, expandable variant rows; tooltip: "Any variant not in stock is not shown"; zero-stock rows filtered client-side.
3. Open Work Orders — Table/Chart toggle; `remaining = max(0, planned - producedSum)`.
4. Production Trend — Last 7 Days (title hardcoded verbatim) — fixed rolling 7-day window, stacked bar per product per day.

No role-based content differences were found within the dashboard page or its four chart components — the same content renders for any authenticated session with a `companyId`; role gating for reaching `/dashboard` at all happens at the sidebar/route level, not within the page.

## 10. Sidebar Navigation & Role Gating (`components/sidebar.tsx`, `components/sidebar-nav.tsx`)

Exact role-check code:
```
function isAllowed(role, allowedRoles) {
  if (role === "SUPER_ADMIN") return true;
  return allowedRoles.includes(role);
}
```

| Nav item | Route | Allowed roles |
|---|---|---|
| Dashboard | `/dashboard` | ADMIN, MANAGER, OPERATOR |
| Raw Materials | `/raw-materials` | ADMIN, MANAGER, OPERATOR |
| Production Floor | `/production-floor` | ADMIN, MANAGER, OPERATOR |
| Work Orders | `/production` | ADMIN, MANAGER, OPERATOR |
| Finished Goods (+ child: Waste) | `/finished-products` (+ `/finished-products/waste`) | ADMIN, MANAGER |
| Employees | `/employees` | ADMIN, MANAGER |
| Attendance | `/attendance` | ADMIN, MANAGER |
| **Reports** | `/reports` (+ all six sub-reports) | **ADMIN only** |
| Settings | `/settings/users` | ADMIN only |

`SUPER_ADMIN` always sees every item via the short-circuit. `components/sidebar.tsx` also renders the "Viewing as {company}" impersonation banner when `impersonatedCompanyId` is set (see `super-admin-and-multi-tenancy.md` §5), and a distinct `components/super-admin/sidebar.tsx` exists for the super-admin area itself.

## 11. Access Control Summary

| Area | Sidebar-visible to | Server action itself checks role? |
|---|---|---|
| `/reports` and all six report sub-pages | ADMIN only (nav-hidden for MANAGER/OPERATOR) | **No** — `fetchFinishedGoodsInventoryReport`, `fetchRawMaterialInventoryReport`, `getMonthlyRMEfficiencyReport`, `getWasteReport`, `getDailyProductionReport`, `getMonthlyProductionReport` all check only `session?.companyId` (`getWasteReport` additionally checks `session.companyId === input.companyId`) |
| `/dashboard` | ADMIN, MANAGER, OPERATOR | Checks only `session.companyId` |

## 12. Known Issues / Unused Code

- **Report server actions have no role check**, even though the Reports section is hidden from MANAGER/OPERATOR in the sidebar — this is a UI-level restriction only; whether it is also enforced by `proxy.ts` route middleware for the underlying pages was not verified against the middleware's exact route list for every one of the six report paths (see `auth-and-access.md` §9 for the full middleware logic as read).
- **Two competing waste-report implementations** (this module's `/reports/waste` vs. Waste Management's `/finished-products/waste`) use different balance-reconstruction math — see §7 and `waste-management.md` §8.
- **A standalone `WasteInventoryXLSXButton.tsx` component is unused** — the actual export on `/reports/waste` is an inline button defined inside `waste-report.tsx`.
- **`lib/reports/queries.ts` contains unused functions**, confirmed by repository-wide search to have zero callers: `getProductionEfficiencyReport(year)` (a different, calendar-year, work-order-completion-based efficiency calculation, structurally unrelated to the FY-based report actually used), `getFinishedGoodsReport()` (a single-month convenience wrapper), and `getRawMaterialReportRange()`.
- **Dashboard "Today"/"Yesterday" use plain server-local time**, while every report elsewhere in the app explicitly applies a +330-minute IST offset — if the server runs in UTC, the dashboard's "Produced Today" figure can disagree with the IST-based reports by up to several hours around midnight.
- **No date-range persistence** — every report resets its filters to "current month" on reload; there is no bookmarkable/shareable filtered URL for any report.
- **The RM Efficiency formula's business meaning is not stated in code** — `rmConsumed = totalProduction + totalWaste` and `differenceQty = rmIssued - rmConsumed` are computed, but nothing in the code comments clarifies whether a positive difference should be read as floor-stock buildup, unrecorded loss, or timing lag; this document reports the formula as coded without interpreting its intended meaning.

## 13. Source Files

`app/(dashboard)/reports/**`, `app/(dashboard)/dashboard/page.tsx`, `actions/reports.ts`, `actions/production-reports.ts`, `actions/waste-reports.ts`, `lib/reports/queries.ts`, `lib/utils/units.ts`, `components/reports/*`, `components/dashboard/*`, `components/sidebar.tsx`, `components/sidebar-nav.tsx`, `prisma/schema.prisma`.
