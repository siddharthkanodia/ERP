# PRD: Raw Materials

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Warehouse-level raw material inventory — create, receive stock, edit, ledger history
**Source of truth:** `actions/raw-materials.ts`, `app/(dashboard)/raw-materials/**`, `components/raw-materials/ReceiveStockForm.tsx`

> This document describes only what the current code does. See §8 for dead/unused code found during review.

## 1. Overview

Raw materials are warehouse-level inventory items, always measured in kilograms (there is no `unit`/`UnitOfMeasure` field on `RawMaterial` at all — the schema hard-codes an implicit KG-only model; every UI label hardcodes "(kg)"). Stock moves from the warehouse to the production floor via the separate Production Floor module (see `production-floor.md`); this module only covers warehouse-side create/receive/edit and the per-material ledger.

## 2. Routes / Pages

| Route | File | Type | Purpose |
|---|---|---|---|
| `/raw-materials` | `app/(dashboard)/raw-materials/page.tsx` | Server component | Dashboard table: Name (links to ledger), "Quantity In Stock (kg)", "Last Received" (`dd MMM yyyy (X kg)` or "Never"), Edit action. Empty state: "No raw materials found. Add your first raw material to start tracking inventory." Header buttons: "Add Raw Material" → `/raw-materials/new`, "Receive Stock" → `/raw-materials/receive` |
| `/raw-materials/new` | `app/(dashboard)/raw-materials/new/page.tsx` | Client component (`useActionState`) | Create form: Name, Initial Quantity. "Exit" returns to `/raw-materials` without saving |
| `/raw-materials/receive` | `app/(dashboard)/raw-materials/receive/page.tsx` | Server wrapper around client `ReceiveStockForm` | Batch stock receipt |
| `/raw-materials/[id]/edit` | `app/(dashboard)/raw-materials/[id]/edit/page.tsx` | Server component + client `EditRawMaterialForm` | Rename a material; redirects to `/raw-materials` if not found |
| `/raw-materials/[id]/ledger` | `app/(dashboard)/raw-materials/[id]/ledger/page.tsx` | Server component | Read-only ledger: Date & Time, Opening Balance, Received, "Given for Production" (`quantityOut`), Closing Balance, Notes. Empty state: "No transactions recorded yet." Redirects to `/raw-materials` if material missing |

## 3. Data Model (relevant fields)

- `RawMaterial`: `id`, `companyId`, `name`, `quantityInStock` (`Decimal(12,3)`), `lastReceivedAt?`, `lastReceivedQuantity?`, timestamps. `@@unique([companyId, name])`.
- `RawMaterialLedger`: `id`, `companyId`, `rawMaterialId`, `workOrderId?`, `date`, `eventType` (`LedgerEventType`: `OPENING_STOCK, RECEIPT, PRODUCTION, DISPATCH, ADJUSTMENT, DELETION_CLEANUP`), `openingBalance`, `quantityIn`, `quantityOut`, `closingBalance`, `notes?`.

## 4. Server Actions (`actions/raw-materials.ts`)

All actions require an authenticated session with `companyId` (`Error: "Unauthorized"` otherwise) and scope every query to that `companyId`.

| Action | Inputs | Validation (exact strings) | Effect |
|---|---|---|---|
| `createRawMaterial(formData)` | `name`, `initialQuantity` | `"Name is required."` (empty after trim); `"Initial quantity must be greater than or equal to 0."` (NaN or `< 0`); duplicate name (`P2002`) → `"A raw material with this name already exists."`; other error → `"Failed to create raw material."` | Creates the row with `quantityInStock = initialQuantity`. **No ledger entry is created on creation** — no `OPENING_STOCK` row is written even though that event type exists. `revalidatePath("/raw-materials")`, then redirect |
| `receiveStockBatch({items: [{materialId, quantity}], receivedDate, notes?})` | see left — this is the action the UI actually calls (`ReceiveStockForm`) | `"Add at least one material line."`; bad/missing date → `"Received date is required."`; future date → `"Received date cannot be in the future."`; `notes.length > 500` → `"Notes must be at most 500 characters."`; per line: missing material → `"Each item must have a valid raw material."`; `quantity <= 0` → `"Quantity must be greater than 0 for all items."`; material not found → `"One or more raw materials no longer exist."`; other error → `"Failed to receive stock."` | For each line, inside one transaction: `opening = current quantityInStock`, `closing = opening + quantity`; sets `quantityInStock = closing` (absolute set), updates `lastReceivedAt`/`lastReceivedQuantity`; creates a `RawMaterialLedger` row with `eventType: RECEIPT`, notes = trimmed input notes or `"Stock received"`. `revalidatePath("/raw-materials")` and `/raw-materials/receive`, then redirect to `/raw-materials` |
| `getAllRawMaterials()` | — | — | All company materials, ordered by name ascending, Decimal fields coerced to `Number` |
| `getRawMaterialById(id)` | id | — | Returns `null` if not found; **throws `Error: "Forbidden"`** if the material belongs to a different company |
| `updateRawMaterial(id, formData)` | `name` (only editable field) | `"Name is required."`; duplicate (`P2002`) → `"A raw material with this name already exists."`; not found (`P2025`) → `"Selected raw material no longer exists."`; other error → `"Failed to update raw material."` | Updates `name` only — quantity in stock is shown read-only in the edit form and cannot be changed here. `revalidatePath("/raw-materials")`, then redirect |
| `getRawMaterialLedger(id)` | id | — | Ledger rows for the material, ordered `date desc, createdAt desc`, Decimals coerced to `Number` |

## 5. Business Rules

- Material names are unique per company (`@@unique([companyId, name])`), enforced via a caught Prisma `P2002`.
- Initial quantity and received quantity must be `>= 0` / `> 0` respectively; negative values are rejected both client- and server-side.
- Received/transaction dates cannot be in the future.
- Notes on a batch receipt are capped at 500 characters.
- Quantities are stored to 3 decimal places (`Decimal(12,3)`, since migration `20261116_three_decimal_quantities`); inputs use `step="0.001"`.
- Only `name` is editable after creation — stock quantity can only change via a receipt (this module) or an issuance to the floor (Production Floor module).

## 6. Access Control

Reachable by ADMIN, MANAGER, and OPERATOR (per `components/sidebar-nav.tsx`, allowed roles `["ADMIN","MANAGER","OPERATOR"]` for the "Raw Materials" nav item); SUPER_ADMIN sees it only while impersonating a company. No role-specific restriction inside `actions/raw-materials.ts` itself beyond requiring a `companyId` on the session.

## 7. Edge Cases (as coded)

- Creating a material with a non-zero initial quantity does not generate any ledger history for that opening balance — the ledger for a brand-new material starts empty even though its `quantityInStock` is non-zero.
- `getRawMaterialById` distinguishes "not found" (`null`) from "found but belongs to another company" (`throw "Forbidden"`) — these are handled differently by callers.
- `receiveStockBatch` sets `quantityInStock` via an absolute value computed from a freshly-read `opening`, not an atomic `increment`, inside a transaction.

## 8. Known Issues / Unused Code

- **`receiveRawMaterial` (singular, legacy)** exists in `actions/raw-materials.ts` with its own validation (`"Quantity must be greater than 0."`, `"Received date is required."`, `"Received date cannot be in the future."`, synthetic `P2025` → `"Selected raw material no longer exists."`) but has no caller in the current UI — `ReceiveStockForm` calls `receiveStockBatch` exclusively. Appears to be dead code retained from before the batch form existed.
- **No delete action exists for raw materials** — there is no `deleteRawMaterial` and no delete control in the list UI. The `DELETION_CLEANUP` ledger event type exists in the schema but is never referenced anywhere in this module's code.
- **Raw materials have no unit-of-measure field** — every quantity is implicitly KG; there is no schema support for a piece-based raw material.

## 9. Source Files

`actions/raw-materials.ts`, `app/(dashboard)/raw-materials/{page.tsx,new/page.tsx,receive/page.tsx,[id]/edit/page.tsx,[id]/edit/raw-material-edit-form.tsx,[id]/ledger/page.tsx}`, `components/raw-materials/ReceiveStockForm.tsx`, `prisma/schema.prisma`.
