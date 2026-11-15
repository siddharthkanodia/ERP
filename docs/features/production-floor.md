# PRD: Production Floor

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Movement of raw materials from the warehouse onto the production floor ("issue"), and consumption of floor stock ("consume"); floor-side ledger with in-place edit/delete and rebuild
**Source of truth:** `actions/production-floor.ts`, `app/(dashboard)/production-floor/**`, `components/production-floor/*`

> This document describes only what the current code does. See §9 for dead/unused code found during review. The XLSX export and month-range report driven from this module are documented in `reports-and-dashboard.md` (route `/reports/production-floor`), per the app's own Reports hub grouping.

## 1. Overview

The Production Floor module tracks a second inventory location — "the floor" — separate from warehouse `RawMaterial.quantityInStock`. Materials are **issued** from the warehouse to the floor (decrementing warehouse stock, incrementing floor stock) and later **consumed** from the floor (decrementing floor stock only). Consumption does not write back to the warehouse or link to any `WorkOrder` — it simply represents material leaving the floor.

## 2. Routes / Pages

| Route | File | Purpose |
|---|---|---|
| `/production-floor` | `app/(dashboard)/production-floor/page.tsx` | Table: Raw Material (links to transactions), Inventory Stock (kg), Floor Stock (kg), Last Issued, Last Consumed. Buttons: "Issue to Floor", "Consume Stock", "View Report" |
| `/production-floor/issue` | `app/(dashboard)/production-floor/issue/page.tsx` | Server wrapper around client `IssueToFloorForm` |
| `/production-floor/consume` | `app/(dashboard)/production-floor/consume/page.tsx` | Server wrapper; **pre-filters to materials with `floorStock > 0`** before passing to `ConsumeFromFloorForm`; if none, shows "No materials currently on the production floor." |
| `/production-floor/transactions?materialId=` | `app/(dashboard)/production-floor/transactions/page.tsx` | Validates `materialId` against known materials (defaults to the first material if invalid/absent); loads up to 200 ledger entries; renders client `FloorTransactionsClient` with inline edit/delete |

## 3. Data Model (relevant fields)

- `ProductionFloorStock`: `id`, `companyId`, `rawMaterialId` (unique — one floor-stock row per material), `quantityInStock`, `lastIssuedAt?`, `lastConsumedAt?`.
- `ProductionFloorLedger`: `id`, `companyId`, `rawMaterialId`, `date`, `eventType` (`ProductionFloorEventType`: `ISSUE, CONSUME, ADJUSTMENT`), `openingBalance`, `quantityIn`, `quantityOut`, `closingBalance`, `notes?`.
- `RawMaterialLedger` (from the Raw Materials module) also receives entries from this module — see §4.

## 4. Server Actions (`actions/production-floor.ts`)

| Action | Inputs | Validation (exact strings) | Effect |
|---|---|---|---|
| `getProductionFloorStocks()` | — | — | Joins `RawMaterial` with `ProductionFloorStock`; floor stock defaults to 0 if no row exists |
| `getFloorStockForRawMaterials(ids)` | ids | — | Batch lookup helper |
| `issueToFloorBatch({date, notes?, items:[{materialId, quantity}]})` | see left | Non-empty items; date required and not future; `notes.length <= 500`; per-material insufficient warehouse stock → `"Issue quantity exceeds inventory stock for {name}."` | Duplicate material lines in the same submission are **merged (summed)**, not rejected. Per merged item, inside one `Prisma.Decimal`-precision transaction: warehouse `RawMaterial.quantityInStock` decrements by the issued quantity; a `RawMaterialLedger` row is written with **`eventType: ADJUSTMENT`** (not `DISPATCH` — see §9), `quantityOut = qty`; `ProductionFloorStock` is upserted (+= qty, `lastIssuedAt` updated); a `ProductionFloorLedger` row is written with `eventType: ISSUE`, `quantityIn = qty`. `revalidatePath("/production-floor")`, `/raw-materials`, then redirect |
| `consumeFromFloorBatch({date, notes?, items:[{materialId, quantity}]})` | see left | Non-future date; `notes.length <= 500`; **duplicate materials in the same submission are rejected** → `"Duplicate raw materials are not allowed."` (unlike issue, which merges); material not currently on the floor → `"Selected material is not currently on the production floor."`; quantity exceeds floor stock → `"Consume quantity exceeds floor stock for {name}."` | Per item: `ProductionFloorStock.quantityInStock` decrements, `lastConsumedAt` updated; `ProductionFloorLedger` row written with `eventType: CONSUME`, `quantityOut = quantity`. **Warehouse `RawMaterial`/`RawMaterialLedger` are not touched at all by consumption.** `revalidatePath("/production-floor")`, then redirect |
| `getFloorReportRange({rawMaterialId, fromMonth, fromYear, toMonth, toYear})` | see left | — | Computes an opening balance for the range start from the running sum of all prior ledger activity, then walks every calendar day in range (including zero-activity days), classifying each ledger entry into `issued` (ISSUE quantityIn), `consumed` (CONSUME quantityOut), or `adjusted` (ADJUSTMENT net), carrying a running balance forward |
| `getFloorLedgerEntries({rawMaterialId?, limit?})` | limit clamped to `[1,500]`, default 200 | — | Ledger rows with joined material name |
| `updateFloorLedgerEntry(entryId, {date, notes?, quantityIn, quantityOut})` | see left | Date required, not future; `quantityIn`/`quantityOut >= 0`; `notes.length <= 500`; shape rules by the entry's original `eventType`: `ISSUE` must have `quantityOut === 0` and `quantityIn > 0` (else `"Issue entries must have Quantity In only."` / `"Quantity must be greater than 0."`); `CONSUME` must have `quantityIn === 0`, `quantityOut > 0` (`"Consume entries must have Quantity Out only."`); `ADJUSTMENT` must be exactly one-directional and non-zero (`"Adjustment entries must be either IN or OUT, not both."`) | If an `ISSUE` entry's quantity changes, the warehouse side is corrected: `delta = newIn - oldIn`; if the warehouse would go negative → `"Warehouse stock is insufficient for the new quantity on {name}."`; otherwise `RawMaterial.quantityInStock` is adjusted and a `RawMaterialLedger` `ADJUSTMENT` row is written (notes: `"Floor issue edit: adjusted by +/-{delta} kg"`). The floor ledger row itself is updated, then `rebuildFloorBalancesForMaterial` recomputes the entire chain (see below); if that produces a negative balance on a later date → `"This change would produce a negative floor balance on a later date. Adjust or delete the affected entries first."` |
| `deleteFloorLedgerEntry(entryId)` | entryId | Entry must exist (`"Ledger entry no longer exists."`) | If the deleted entry was an `ISSUE` with `quantityIn > 0`, that quantity is returned to the warehouse (`RawMaterial.quantityInStock += oldIn`) with a `RawMaterialLedger` `ADJUSTMENT` row (notes: `"Floor issue deleted: returned {oldIn} kg to warehouse."`); the floor ledger row is then hard-deleted and `rebuildFloorBalancesForMaterial` runs; a resulting negative balance → `"Deleting this entry would produce a negative floor balance on a later date. Adjust or delete later entries first."` |
| `rebuildFloorBalancesForMaterial(tx, companyId, rawMaterialId)` | — | Throws an internal `NEGATIVE_FLOOR_BALANCE` signal if any recomputed closing balance is negative | Recomputes `openingBalance`/`closingBalance` for every ledger row of a material in chronological order (`date asc, createdAt asc`) from a running total starting at 0; updates `ProductionFloorStock.quantityInStock`/`lastIssuedAt`/`lastConsumedAt` to match |

## 5. Issue-to-Floor and Consume-from-Floor, step by step

**Issue to Floor:** Warehouse `RawMaterial.quantityInStock` decreases by the issued quantity; a `RawMaterialLedger` row records this as `eventType = ADJUSTMENT` with `quantityOut = qty`. Simultaneously, `ProductionFloorStock.quantityInStock` increases by the same quantity, and a `ProductionFloorLedger` row records this as `eventType = ISSUE` with `quantityIn = qty`. Both writes are one atomic transaction — material is neither lost nor gained system-wide.

**Consume from Floor:** Only the floor side changes. `ProductionFloorStock.quantityInStock` decreases by the consumed quantity; a `ProductionFloorLedger` row records `eventType = CONSUME` with `quantityOut = qty`. Nothing on the warehouse side (`RawMaterial`/`RawMaterialLedger`) is touched, and there is no link created into any `WorkOrder`/`WorkOrderRawMaterial` row from this action.

## 6. Business Rules

- Cannot issue more than the current warehouse `quantityInStock` for a material.
- Cannot consume more than the current floor `quantityInStock` for a material.
- The Consume form rejects selecting the same material twice in one submission; the Issue form instead silently sums duplicate lines into one.
- No transaction date (issue, consume, or ledger edit) may be in the future.
- Notes are capped at 500 characters on every floor action.
- Editing or deleting an `ISSUE` ledger entry can never drive warehouse stock negative, and can never make a later floor-ledger balance negative (both enforced via the full-chain rebuild).
- History here is mutable: editing or deleting a ledger row directly changes stored data and recomputes all downstream balances — there is no soft-delete flag and no separate reversal-entry pattern preserving the original row.

## 7. Access Control

Reachable by ADMIN, MANAGER, and OPERATOR (per `components/sidebar-nav.tsx`, allowed roles `["ADMIN","MANAGER","OPERATOR"]` for "Production Floor"); SUPER_ADMIN only while impersonating. No additional role check inside `actions/production-floor.ts` beyond requiring a `companyId` on the session.

## 8. Edge Cases (as coded)

- `issueToFloorBatch` uses exact `Prisma.Decimal` arithmetic; `consumeFromFloorBatch` and `rebuildFloorBalancesForMaterial` convert to JS `Number` with manual 2-decimal rounding (`round2`) — two different arithmetic strategies within the same module.
- All mutations run inside `prisma.$transaction`, but there is no explicit row-locking (`SELECT ... FOR UPDATE`) — concurrent issue/consume requests for the same material rely on Postgres's default transaction isolation rather than an explicit lock.
- In non-production environments (`NODE_ENV !== "production"`), `issueToFloorBatch`'s catch block returns raw Prisma error text to the client (`"DB error {code}: ..."`, `"Validation error: ..."`).

## 9. Known Issues / Unused Code

- **Warehouse-side ledger entries for floor issuance are typed `ADJUSTMENT`, not `DISPATCH`**, even though `DISPATCH` exists in `LedgerEventType` and would seem to better describe "goods leaving the warehouse." This means every floor-related warehouse correction looks identical to a manual adjustment in the raw material ledger.
- **Two independent, near-duplicate rounding helpers** exist: `round2`/`roundKg` are defined separately in `actions/production-floor.ts` and in `lib/utils/units.ts` rather than sharing one implementation.
- **`lib/utils/units.ts` exports `yieldPercent` and `netWasteKg`**, which are **not called anywhere in the codebase** (confirmed by repository-wide search) — dead code, unrelated to this module's actual behavior despite living in a "units" helper file used elsewhere by Waste Management.
- **No delete action exists for a `RawMaterial` itself** from this module or the Raw Materials module — see `raw-materials.md` §8.

## 10. Source Files

`actions/production-floor.ts`, `app/(dashboard)/production-floor/{page.tsx,issue/page.tsx,consume/page.tsx,transactions/page.tsx}`, `components/production-floor/{IssueToFloorForm,ConsumeFromFloorForm,FloorTransactionsClient}.tsx`, `lib/utils/units.ts`, `prisma/schema.prisma`.
