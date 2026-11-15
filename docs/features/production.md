# PRD: Production (Work Orders)

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Work order creation, raw-material type linkage, production entries (actual output logging), status lifecycle
**Source of truth:** `actions/production.ts`, `actions/production-reports.ts`, `lib/production-utils.ts`, `app/(dashboard)/production/**`

> This document describes only what the current code does. See §8 for dead/unused code found during review. The daily/monthly production report fed by this module's data is documented in `reports-and-dashboard.md` (route `/reports/production`), per the app's own Reports hub grouping.

## 1. Overview

A Work Order plans production of a finished product (or a specific variant) in a target quantity, records which raw material *types* are associated with it (no quantity is tracked at the work-order level — see §3), and accumulates actual output through one or more Production Entries. Each entry immediately increases the finished product's stock and writes a ledger row; nothing in this module ever touches raw material stock (that happens exclusively in the Production Floor module, with no link back to a work order).

## 2. Routes / Pages

| Route | File | Purpose |
|---|---|---|
| `/production` | `app/(dashboard)/production/page.tsx` | Lists all work orders (`getAllWorkOrders()`); client `ProductionTable` with Open/Completed tabs |
| `/production/new` | `app/(dashboard)/production/new/page.tsx` | Create form (`CreateWorkOrderForm`) — loads finished products, raw materials, floor stock |
| `/production/[id]` | `app/(dashboard)/production/[id]/page.tsx` | Work order detail: header, `EditWorkOrderForm`, `AddProductionEntryForm`, `ProductionEntriesTable`, `ReopenButton`. Redirects to `/production` if not found |

Client-side, `isReadOnly = status === "COMPLETED"` disables the edit form, the add-entry form, and per-row entry edit buttons — this is a **UI-only** restriction; see §5 for what the server actions actually enforce.

## 3. Data Model (relevant fields)

- `WorkOrder`: `id`, `companyId`, `workOrderName`, `finishedProductId?`, `finishedProductVariantId?`, `plannedQuantity` (`Decimal`), `status` (`WorkOrderStatus`: `OPEN, COMPLETED, CANCELLED`), `createdAt`, `updatedAt`, `completedAt?`.
- `WorkOrderRawMaterial`: `id`, `companyId`, `workOrderId`, `rawMaterialId`, `quantityIssued` (`Decimal`, default 0). **This field is declared in the schema but is never written or read by any application code** (confirmed by repository-wide search) — in practice, raw materials linked to a work order are a type-only association with no quantity, matching the original product intent even though the column exists.
- `ProductionEntry`: `id`, `companyId`, `workOrderId`, `entryDate`, `quantityProduced` (`Decimal`), timestamps.

## 4. Server Actions (`actions/production.ts`)

**Read actions:** `getAllWorkOrders()` / `getWorkOrderById(id)` compute `totalProduced` (sum of `productionEntries.quantityProduced`), `variance = round2(totalProduced - plannedQuantity)`, and a kg-consumption total via `computeConsumptionKg` (uses `calculateKgWeight`, see §6). A work order whose `finishedProduct` has been deleted is displayed as `"<Deleted Product>"`. Neither read action wraps `computeConsumptionKg` in a try/catch, so a PIECE-unit product with no resolvable weight would throw unhandled during page render.

**`createWorkOrder(formData)`** — inputs: `workOrderName`, `finishedProductId`, `finishedProductVariantId?`, `plannedQuantity`, `rawMaterials` (JSON array of `{rawMaterialId}`).

| Condition | Error |
|---|---|
| Name empty | `"Work order name is required."` |
| Name `< 3` chars | `"Work order name must be at least 3 characters."` |
| No finished product selected | `"Finished product is required."` |
| `plannedQuantity` not finite or `<= 0` | `"Planned quantity must be greater than 0."` |
| Raw materials field missing/unparseable | `"At least one raw material type is required."` |
| Raw materials array empty | `"At least one raw material type is required."` |
| A row has a blank raw material id | `"Please select a raw material in every row."` |
| Duplicate raw material ids | `"Same raw material cannot be selected twice."` |
| Product not found / deleted / is a waste type | `"Finished product not found."` |
| Product has variants but none chosen | `"Variant is required for this finished product."` |
| Product has no variants but one was passed | `"Variant must be empty for this finished product."` |
| Variant doesn't belong to the chosen product | `"Selected variant does not belong to this finished product."` |
| Unit is PIECE and `plannedQuantity` is not a whole number | `"Planned quantity must be a whole number for pieces."` |
| Unit is PIECE and no weight resolvable (variant or product) | `"Weight per piece is required for piece-based products."` |
| Any raw material id not found for the company | `"One or more raw materials are invalid."` |

Effect: one `WorkOrder.create` with nested `WorkOrderRawMaterial.create` rows (each only `{companyId, rawMaterialId}` — `quantityIssued` is never set). `revalidatePath("/production")`, then redirect.

**`addProductionEntry(workOrderId, formData)`** — inputs: `quantityProduced`, `entryDate`.

| Condition | Error |
|---|---|
| Quantity not finite or `<= 0` | `"Production quantity must be greater than 0."` |
| Date missing/invalid | `"Entry date is required."` |
| Date in the future | `"Entry date cannot be in the future."` |
| Work order not found | `"Work order not found."` |
| Work order's finished product deleted | `"Finished product is deleted for this work order."` |
| Unit PIECE and quantity not a whole number | `"Production quantity must be a whole number for pieces."` |
| Unit PIECE and no resolvable weight | `"Weight per piece is required for piece-based products."` |

Effect, inside one transaction (`timeout: 20000ms`): creates the `ProductionEntry`; increments `FinishedProductVariant.quantityInStock` (if a variant is set) or `FinishedProduct.quantityInStock`; creates a `FinishedProductLedger` row (`eventType: "PRODUCTION"`, `quantityProduced`, `quantityDispatched: 0`, notes: `"Produced via Work Order {workOrderName}"`, linked via `workOrderId` and `productionEntryId`). **No status change happens here** — the action never touches `WorkOrder.status`. The client, after receiving `{status, updatedTotalProduced, plannedQuantity}` back, opens a completion-confirmation modal **only in the browser** when `status === "OPEN" && updatedTotalProduced >= plannedQuantity"`; nothing server-side forces completion.

**`updateProductionEntry(entryId, formData)`** — inputs: `quantityProduced`, `entryDate`. Same basic validations as add (`>0`, valid date, not future), plus deleted-product and PIECE-unit checks as above, plus: `currentStock + delta < 0` (where `delta = new - old` quantity) → `"Cannot reduce entry below dispatch-adjusted stock."` Effect: updates the entry; adjusts stock by `{increment: delta}`; looks up the single matching `FinishedProductLedger` row (by `productionEntryId`) and, **if found**, updates only its `quantityProduced`/`date` in place — it does **not** recompute `openingBalance`/`closingBalance` on that row or any later rows. If no matching ledger row exists, stock is still adjusted with no ledger correction at all. **No status check** — this can be called against a `COMPLETED` work order's entry; only the UI's `isReadOnly` state prevents it from the interface.

**`updateWorkOrder(id, formData)`** — inputs: `plannedQuantity`, `rawMaterials` (JSON array). Validation: `plannedQuantity <= 0` → `"Planned quantity must be greater than 0."`; bad JSON → `"At least one raw material type is required."`; same three raw-material-type errors as create; work order not found → `"Work order not found."`; deleted product → `"Finished product is deleted for this work order."`; PIECE + non-integer → `"Planned quantity must be a whole number for pieces."`; missing weight → `"Weight per piece is required for piece-based products."`; invalid raw material id → `"One or more raw materials are invalid."` Effect: updates `plannedQuantity`; **fully replaces** `WorkOrderRawMaterial` rows via `deleteMany({}) + create([...])` every save. **No status check, and no floor on `plannedQuantity` relative to `totalProduced`** — planned quantity can be freely set below what has already been produced.

**`completeWorkOrder(id)`** — no inputs. `status === "COMPLETED"` → `"Work order is already completed."`; `status === "CANCELLED"` → `"Cancelled work orders cannot be completed."`; `totalProduced <= 0` → `"Cannot complete a work order with 0 production."` Effect: `status → COMPLETED`, `completedAt = now`. **This is the only place status ever becomes `COMPLETED`; it is strictly manual.** The UI warns (but does not block) completing with `totalProduced < plannedQuantity`.

**`reopenWorkOrder(id)`** — requires `session.role === "SUPER_ADMIN" || "ADMIN"`, else `"Only admins can reopen work orders."`; `status !== "COMPLETED"` → `"Only completed work orders can be reopened."` Effect: `status → OPEN`, `completedAt = null`. This is the only reversal transition; **nothing about finished-product stock or the ledger is reversed** — it is purely a status/timestamp flip.

## 5. Status Lifecycle

```
OPEN → COMPLETED   via completeWorkOrder only (requires totalProduced > 0)
COMPLETED → OPEN    via reopenWorkOrder only (ADMIN/SUPER_ADMIN only)
* → CANCELLED        no code path exists anywhere in the repository
```

`CANCELLED` is declared in the schema, guarded against in `completeWorkOrder`, and referenced in a `deleteFinishedProduct` query filter, but there is no `cancelWorkOrder` (or any work-order delete) action anywhere in the codebase — it is currently unreachable.

Editing a work order's details (`updateWorkOrder`) or its production entries (`updateProductionEntry`) is **not blocked server-side** for a `COMPLETED` work order; only the client's `disabled`/read-only UI state prevents it through the interface.

## 6. `lib/production-utils.ts`

`calculateKgWeight(qty, unit, weightPerPiece?)`: normalizes `unit` (trim + lowercase); returns `qty` unchanged for `"kg"`; returns `qty * weightPerPiece` for `"piece"`/`"pcs"`; returns `0` for any other unit string (silent fallback, no error). Used by `computeConsumptionKg` here and by the production reports (`accumulate`, in `reports-and-dashboard.md`).

## 7. Access Control

Reachable by ADMIN, MANAGER, and OPERATOR (per `components/sidebar-nav.tsx`, allowed roles `["ADMIN","MANAGER","OPERATOR"]` for "Work Orders"); SUPER_ADMIN only while impersonating. `reopenWorkOrder` additionally requires `role === "ADMIN"` or `"SUPER_ADMIN"` inside the action itself — the only role check within `actions/production.ts`.

## 8. Known Issues / Unused Code

- **`WorkOrderRawMaterial.quantityIssued` is a dead schema field** — never written or read by any application code.
- **`CANCELLED` status is unreachable** — no action anywhere transitions a work order to it.
- **`updateWorkOrder` allows `plannedQuantity` below `totalProduced`** with no server-side floor; negative variance is only ever surfaced as a UI warning, at completion time.
- **No server-side status guard** on `updateProductionEntry` or `updateWorkOrder` — editing a `COMPLETED` order's entries/details is prevented only by the client, not the server action.
- **Ledger correction on entry edit is partial**: `updateProductionEntry` patches only the one matching ledger row's `quantityProduced`/`date`, never recomputing opening/closing balances for that row or any later rows, so the ledger's running balance can go stale after an edit if other ledger events occurred afterward. If the matching ledger row was separately deleted, the edit silently adjusts stock with no ledger correction at all.
- **No `deleteProductionEntry` action exists** — only add and update are implemented; there is no way to fully remove a logged production entry.
- **Two different "missing weight" failure philosophies**: `calculateKgWeight` silently returns `0` for an unrecognized unit, while `computeConsumptionKg`'s pre-checks throw/return an explicit validation error for the same underlying problem.

## 9. Source Files

`actions/production.ts`, `actions/production-reports.ts`, `lib/production-utils.ts`, `app/(dashboard)/production/{page.tsx,production-table.tsx,new/page.tsx,new/work-order-form.tsx,[id]/page.tsx,[id]/add-production-entry-form.tsx,[id]/edit-work-order-form.tsx,[id]/production-entries-table.tsx,[id]/reopen-button.tsx,[id]/work-order-context.tsx,[id]/work-order-shell.tsx}`, `prisma/schema.prisma`.
