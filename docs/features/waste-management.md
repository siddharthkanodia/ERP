# PRD: Waste Management

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Waste-type creation, waste entries (goods becoming waste), waste dispatch
**Source of truth:** `actions/finished-products.ts` (waste-specific exports), `app/(dashboard)/finished-products/waste/**`, `components/finished-goods/{WasteDispatchForm,WasteEntryForm,WasteReportClient,WasteTypeManager}.tsx`

> This document describes only what the current code does. See §7 for dead/unused code found during review. The month-range waste report and its export are documented here (§5) since they are produced by this module's own query function; a second, separate waste report exists under Reports & Dashboard (`/reports/waste`) — see §7.

## 1. Overview

There is no separate "Waste" database model. A waste type **is** a `FinishedProduct` row with `isWaste: true`. The system auto-creates a default waste type named `"Mixed Waste"` (`unit: "KG"`, `quantityInStock: 0`) the first time any waste action or query runs for a company that has none — this happens inside `ensureDefaultWasteType(companyId)`, called at the top of `getWasteTypes`, `getWasteTypesWithVariants`, `getWasteReportRange`, `createWasteEntry`, and `dispatchWaste`.

## 2. Routes / Pages

| Route | File | Purpose |
|---|---|---|
| `/finished-products/waste` | `app/(dashboard)/finished-products/waste/page.tsx` | Waste home / month-range report (`WasteReportClient`) |
| `/finished-products/waste/new` | `app/(dashboard)/finished-products/waste/new/page.tsx` | Add waste entry (`WasteEntryForm`) |
| `/finished-products/waste/dispatch` | `app/(dashboard)/finished-products/waste/dispatch/page.tsx` | Dispatch waste (`WasteDispatchForm`) |
| `/finished-products/waste/manage` | `app/(dashboard)/finished-products/waste/manage/page.tsx` | Manage waste types (`WasteTypeManager`) |

## 3. Data Model

Waste types use the same `FinishedProduct` / `FinishedProductVariant` / `FinishedProductLedger` tables described in `finished-products.md`, distinguished only by `isWaste: true`. Waste-type products always have `unit: "KG"` — there is no PIECE-unit path anywhere in the waste UI/action layer.

## 4. Server Actions (waste-specific, in `actions/finished-products.ts`)

**`createWasteEntry({date, wasteTypeId, quantity, notes?})`** — `"Please select a waste type."`; `"Date is required."`; `"Date cannot be in the future."`; `"Quantity must be greater than 0."` Inside a transaction, re-fetches the `FinishedProduct` (`isWaste:true, isDeleted:false`); if missing, an internal `WASTE_NOT_FOUND` signal is swallowed by the generic catch and surfaced as `"Failed to add waste entry."` (not a distinct message). Increments `quantityInStock`; creates a `FinishedProductLedger` row with **`eventType: "RECEIPT"`** (not `PRODUCTION`), notes defaulting to `"Waste added"`. `revalidatePath("/finished-products/waste")` and `/finished-products`.

**`dispatchWaste({date, wasteTypeId, quantity, notes?})`** — same base validations, plus a stock check: quantity exceeding current stock throws an internal `INSUFFICIENT_STOCK` signal → `"Dispatch quantity cannot exceed available stock."` Decrements `quantityInStock`, updates `lastDispatchedAt`/`lastDispatchedQuantity`, creates a `FinishedProductLedger` row (`eventType: "DISPATCH"`, notes defaulting to `"Waste dispatched"`). **Unlike the normal finished-goods dispatch, this uses a plain read-then-write with no atomic `updateMany` guard** — there is no protection against a concurrent double-dispatch race for waste.

Both actions operate only at the parent waste-type (`FinishedProduct`) level — neither references `finishedProductVariantId`, regardless of whatever variants a waste type might have (see §5).

**`createWasteType(name)`** — trims name; `"Name is required."`; case-insensitive duplicate check among active waste types → `"A waste type with this name already exists."`; creates a `FinishedProduct{isWaste:true, unit:"KG"}` (stock defaults to 0). Other error → `"Failed to create waste type."` `revalidatePath("/finished-products/waste")` and `/finished-products/waste/manage`.

**`createWasteVariant({wasteTypeId, name})`** — `"Waste type is required."`; `"Variant name is required."`; waste type must exist and be `isWaste:true` → `"Waste type not found."`; duplicate check → `"A variant with this name already exists for this waste type."` Creates a `FinishedProductVariant{weightPerPiece: 1, quantityInStock: 0}` — **weight is hardcoded to `1`**, not user-supplied (the manager UI has no weight input at all). `revalidatePath("/finished-products/waste/manage")` only — **does not** revalidate `/finished-products/waste`.

**`getWasteTypes()` / `getWasteTypesWithVariants()`** — reads, both call `ensureDefaultWasteType` first.

**`getWasteReportRange({wasteTypeId?, fromMonth, fromYear, toMonth, toYear})`** — per-waste-type, month-range report. Reconstructs balances by starting from current stock and walking the ledger **backward** to derive historical opening balances (a different technique from the forward-walk used in the Reports & Dashboard waste report — see §7).

## 5. Waste Report & Export (this module's own implementation)

`WasteReportClient` renders the output of `getWasteReportRange` with a month/year range selector (identical UX pattern to the other inventory reports in this app) and its own inline XLSX export using the `xlsx` library.

## 6. Business Rules

- Waste type names are unique (case-insensitive) among active waste types — application-level check only, no DB constraint.
- A waste entry or dispatch quantity must be `> 0`; dispatch additionally cannot exceed current stock.
- Waste dates cannot be in the future.
- Waste is always tracked in KG.

## 7. Access Control

Reachable by ADMIN and MANAGER only — the "Waste" nav item is a child of "Finished Goods" in `components/sidebar-nav.tsx`, allowed roles `["ADMIN","MANAGER"]`; OPERATOR is blocked at the middleware layer (`proxy.ts` explicitly redirects OPERATOR away from `/finished-products/waste`); SUPER_ADMIN only while impersonating.

## 8. Known Issues / Unused Code

- **Waste variants are effectively cosmetic.** `WasteTypeManager` lets you add named variants with a hardcoded `weightPerPiece: 1`, but neither `createWasteEntry` nor `dispatchWaste` ever reference `finishedProductVariantId` — all waste quantity is tracked at the parent waste-type level regardless of how many variants exist.
- **Two independent waste-report implementations exist with different math.** This module's `getWasteReportRange` (feeds `/finished-products/waste`) reconstructs opening balances by walking the ledger *backward* from current stock; a second, separate function `getWasteReport` in `actions/waste-reports.ts` (feeds the unrelated route `/reports/waste`, documented in `reports-and-dashboard.md`) instead reads ledger `openingBalance`/`closingBalance` fields directly and walks *forward*. These can drift out of sync and it is not clear from the code which is meant to be canonical.
- **No dedicated "delete waste type" action exists.** `deleteFinishedProduct` only soft-deletes non-waste products (`where: {isWaste:false}`); calling it on a waste-type id no-ops with `PRODUCT_NOT_FOUND`.
- **Nothing in the schema prevents toggling `isWaste` on a normal product** — no update path exposes this today, but it is not enforced at the database level either.
- **`ADJUSTMENT` ledger event type is never used** for waste corrections — there is no adjustment-entry action for waste stock.
- **A standalone `WasteInventoryXLSXButton.tsx` component exists** (columns: Date/Opening/Added/Dispatched/Closing) but is not imported by `WasteReportClient` — the component actually wired into that page is an inline `WasteXLSXButton` defined inside the Reports module's `waste-report.tsx` (different column headers: Opening Balance/Waste Generated/Waste Dispatched/Closing Balance). This standalone component appears to be dead/legacy.

## 9. Source Files

`actions/finished-products.ts` (waste exports: `ensureDefaultWasteType`, `getWasteTypes`, `getWasteTypesWithVariants`, `createWasteType`, `createWasteVariant`, `createWasteEntry`, `dispatchWaste`, `getWasteReportRange`), `app/(dashboard)/finished-products/waste/{page.tsx,new/page.tsx,dispatch/page.tsx,manage/page.tsx}`, `components/finished-goods/{WasteDispatchForm,WasteEntryForm,WasteReportClient,WasteTypeManager}.tsx`, `prisma/schema.prisma`.
