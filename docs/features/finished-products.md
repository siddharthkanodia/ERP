# PRD: Finished Products

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Finished goods master data, variants, dispatch, ledger, soft delete
**Source of truth:** `actions/finished-products.ts`, `app/(dashboard)/finished-products/{page.tsx,new/**,dispatch/**,[id]/edit/**,[id]/ledger/**}`, `components/finished-goods/DispatchForm.tsx`, `components/finished-products/DeleteProductButton.tsx`

> This document describes only what the current code does. See §9 for dead/unused code found during review. Waste-type products (`isWaste: true`) are a distinct workflow built on this same model — documented separately in `waste-management.md`.

## 1. Overview

`FinishedProduct` is the finished-goods master table. A product is measured in KG or PIECE; a PIECE product either has a single `weightPerPiece` (no variants) or is split into named `FinishedProductVariant` rows, each with its own mandatory weight — the schema comment describing variant weight as "overriding" the product's is not reflected in the code: the two are mutually exclusive (product-level `weightPerPiece` is always `null` once variants exist), not a fallback chain.

## 2. Routes / Pages

| Route | File | Type | Purpose |
|---|---|---|---|
| `/finished-products` | `app/(dashboard)/finished-products/page.tsx` | Server component | List (`getAllFinishedProducts()`, excludes deleted and waste types); client `FinishedProductsTable`. Buttons: "Add Finished Product", "Dispatch Stock" |
| `/finished-products/new` | `app/(dashboard)/finished-products/new/page.tsx` | Client component | Create form, calls `createFinishedProduct` |
| `/finished-products/dispatch` | `app/(dashboard)/finished-products/dispatch/page.tsx` | Server wrapper around client `DispatchForm` | Batch, multi-line dispatch — calls `dispatchFinishedGoodsBatch` |
| `/finished-products/[id]/edit` | `app/(dashboard)/finished-products/[id]/edit/page.tsx` | Server component + client `EditFinishedProductForm` | Rename, edit variants; shows "This product was deleted." if not found |
| `/finished-products/[id]/ledger?variantId=` | `app/(dashboard)/finished-products/[id]/ledger/page.tsx` | Server component | Ledger for the product or a specific variant; redirects to `/finished-products` if the product is missing |

## 3. Data Model (relevant fields)

- `FinishedProduct`: `id`, `companyId`, `name`, `unit` (`UnitOfMeasure`: `KG`, `PIECE`, default `KG`), `isWaste` (default `false`), `quantityInStock`, `weightPerPiece?` (only set when `unit === PIECE` and there are no variants), `isDeleted`, `deletedAt?`, `lastDispatchedAt?`, `lastDispatchedQuantity?`, timestamps.
  - **Note:** the schema comment implies `@@unique([companyId, name])`, but the actual schema only has `@@index([companyId])` and `@@index([name])` — there is **no unique database constraint** on name. Duplicate-name prevention is entirely a `findFirst` pre-check in application code (see §4), which is race-prone under concurrent requests.
- `FinishedProductVariant`: `id`, `companyId`, `finishedProductId`, `name`, `weightPerPiece?` (mandatory in practice — always validated `> 0` at creation), `quantityInStock`, `isDeleted`, `deletedAt?`.
- `FinishedProductLedger`: `id`, `companyId`, `finishedProductId`, `finishedProductVariantId?`, `workOrderId?`, `productionEntryId?`, `date`, `eventType` (`OPENING_STOCK, RECEIPT, PRODUCTION, DISPATCH, ADJUSTMENT, DELETION_CLEANUP`), `openingBalance`, `quantityProduced`, `quantityDispatched`, `closingBalance`, `notes?`.

## 4. Server Actions (`actions/finished-products.ts`)

All actions require an authenticated session with `companyId`, else `throw Error("Unauthorized")`.

**`createFinishedProduct(formData)`** — inputs: `name`, `unit`, `initialQuantity`, `weightPerPiece`, `variants` (JSON array of `{clientKey, name, weightPerPiece, initialQuantity}`).

| Condition | Error |
|---|---|
| Name empty | `"Name is required."` |
| Unit missing | `"Unit of measure is required."` |
| Duplicate active name (case-insensitive, among `isWaste:false` products) | `"A product with this name already exists."` |
| No variants, initial quantity NaN/`<0` | `"Initial quantity must be greater than or equal to 0."` |
| No variants, unit PIECE, quantity not whole | `"Pieces must be whole numbers."` |
| No variants, unit PIECE, weight NaN or `<=0` | `"Weight per piece is required for piece-based products without variants"` (no trailing period) |
| With variants: blank variant name | `"Variant name is required for all variant rows."` |
| With variants: weight `<=0` | `"Weight must be greater than 0."` |
| With variants: initial quantity NaN/`<0` | `"Variant initial quantity must be greater than or equal to 0."` |
| With variants: quantity not whole | `"Pieces must be whole numbers."` |
| With variants: duplicate variant names (case-insensitive) | `"Duplicate variant names are not allowed."` |
| DB duplicate (`P2002`) | `"A finished product with this name already exists."` |
| Other DB error | `` "Database Error: {message}" `` |

Effect (in a transaction): creates the `FinishedProduct` with `isWaste:false`; `quantityInStock = 0` if variants exist, else the parsed initial quantity; `weightPerPiece` set only for a no-variant PIECE product. If variants: creates each `FinishedProductVariant`, and for any with `initialQuantity > 0`, an `OPENING_STOCK` ledger row (notes: `"Opening stock"`) at the **variant** level. If no variants and initial quantity `> 0`, one `OPENING_STOCK` ledger row at the **product** level. `revalidatePath("/finished-products")`, then redirect.

**`dispatchFinishedGoodsBatch({dispatchDate, notes?, items:[{finishedGoodId, quantity}]})`** — the action the UI actually calls (`DispatchForm`). `finishedGoodId` is prefixed `"p:<id>"` for a no-variant product or `"v:<id>"` for a variant.

| Condition | Error |
|---|---|
| No lines | `"Add at least one line."` |
| Dispatch date missing | `"Dispatch date is required."` |
| Dispatch date in the future | `"Dispatch date cannot be in the future."` |
| `notes.length > 500` | `"Notes must be at most 500 characters."` |
| Line missing a selection | `"Each line must have a finished good selected."` |
| Line quantity `<=0` | `"Quantity must be greater than 0 for all lines."` |
| Bad prefix / empty id | `"Invalid line item."` |
| Variant lookup fails | `"One or more selected items are invalid."` |
| Product not found | `"Product not found."` |
| Product has variants but a line targets the bare product | `"One or more products require a variant selection."` |
| Dispatch exceeds available stock | `"Dispatch quantity cannot exceed available stock."` |
| PIECE quantity not whole | `"Pieces must be whole numbers."` |

Effect: every line is pre-validated, then re-validated again inside a transaction with an atomic `updateMany({..., quantityInStock: {gte: quantity}})` guard (prevents negative stock under concurrency — a 0-row update result throws an internal `INSUFFICIENT_STOCK` signal). Each line gets its own `FinishedProductLedger` row (`eventType: "DISPATCH"`, `quantityDispatched`), and `rebuildFinishedProductLedgerBalances` re-derives `openingBalance`/`closingBalance` for every ledger row of that product/variant scope, ordered by `date, createdAt` — **ledger balances are recomputed, not append-only immutable**. `FinishedProduct.lastDispatchedAt`/`lastDispatchedQuantity` are updated at the parent-product level even for a variant-level dispatch (variants have no `lastDispatchedAt` of their own). `revalidatePath("/finished-products")` and `/finished-products/dispatch`, then redirect.

**`updateFinishedProduct(id, formData)`** — inputs: `name`, `variants` (JSON), `stockDistribution` (JSON). `"Name is required."`; duplicate name excluding self → `"A product with this name already exists."`; not found → `"Selected finished product no longer exists."`; per-variant validation mirrors create.

- **Migration path** (product currently has zero variants but the payload introduces some): requires a `stockDistribution` allocation summing exactly to existing stock, else `"Total allocated quantity must equal existing stock."`; sets the parent's `quantityInStock` to 0 and creates each variant with an `OPENING_STOCK` ledger row (notes: `"Opening stock migrated from base product"`).
- **Normal path**, per variant: `_delete: true` → if `quantityInStock > 0`, blocked with `"Cannot remove variant with existing stock"`; otherwise **hard-deletes** the variant row (no soft delete, unlike product-level delete). An existing variant with no `_delete` → updates only `name`/`weightPerPiece` (stock is not touched in this path). A new variant row → created, with an `OPENING_STOCK` ledger entry if its initial quantity `> 0`.

`revalidatePath("/finished-products")`, then redirect.

**`getFinishedProductLedger(id, variantId?)`**, **`getFinishedProductVariants(id)`**, **`getFinishedProductById(id)`**, **`getAllFinishedProducts()`** — reads; all exclude `isDeleted:true`, and product-level reads also exclude `isWaste:true`.

**`deleteFinishedProduct(productId)`** — see §6.

**`dispatchFinishedProduct(formData)`** (single-item, legacy) — has its own validation set (`"Please select a product."`, `"Quantity must be greater than 0."`, `"Dispatch date is required."`, `"Dispatch date cannot be in the future."`, `"Product not found."`, `"Pieces must be whole numbers."`, `"Please select a variant."`, `"Variant is not allowed for this product."`, `"Selected variant is invalid."`, `"Dispatch quantity cannot exceed available stock."`) and the same atomic-guard/ledger/rebuild pattern as the batch action — but no caller was found in the reviewed UI; `DispatchForm` calls `dispatchFinishedGoodsBatch` exclusively. Documented for completeness; see §9.

## 5. Variant Weight Rule (as actually enforced)

Contrary to the schema's own comment ("overrides product weightPerPiece when set"), the code enforces **mutual exclusivity**: as soon as a product has any variants, its own `weightPerPiece` is always `null`, and every variant must carry its own `weightPerPiece > 0` (validated at creation and edit time). No read path (`getAllFinishedProducts`, table rendering) falls back to a product-level weight when a variant's is missing, because a variant without one cannot be created or saved in the first place.

## 6. Delete Flow

`DeleteProductButton` first calls `checkActiveWorkOrders(productId)`. If any `WorkOrder` with `status: "OPEN"` references the product, deletion is blocked and those work orders are listed, with the message: *"This product has active work orders. Please complete or delete them before deleting this product."*

If none, the confirmation dialog states: *"This action is permanent and cannot be undone."* — "All variants will be archived." / "All stock data and ledger history will be deleted." / "Completed work orders will show this product as \<Deleted Product\>." — and shows the current aggregate stock.

`deleteFinishedProduct(productId)` re-checks for open work orders server-side (same message, returned as `{error: "ACTIVE_WORK_ORDERS", message, workOrders}`). If clear, inside one transaction:

1. `FinishedProductVariant.updateMany` — **soft delete** (`isDeleted:true, deletedAt`), no stock-zero requirement.
2. `FinishedProductLedger.deleteMany` — **hard delete** of all ledger rows for the product (matches the confirmation dialog's own claim that ledger history is deleted, not archived).
3. `FinishedProduct.updateMany({isDeleted:true, deletedAt}, where:{isWaste:false})` — soft delete of the product itself; only applies to non-waste products; a count-mismatch (`P2025`) returns `{error:"PRODUCT_NOT_FOUND", message:"Finished product not found."}`.
4. `WorkOrder.updateMany({finishedProductId:null}, where:{status:{in:["COMPLETED","CANCELLED"]}})` — unlinks the product from its non-open work orders, producing the `"<Deleted Product>"` display elsewhere (open work orders were already blocked in the pre-check, so none remain here).

There is **no requirement that `quantityInStock` be zero** before deletion, despite the confirmation dialog prominently displaying current stock. Any thrown error is caught and returned as `{error:"DELETE_FAILED", message:"Failed to delete finished product."}`.

## 7. Business Rules Summary

- A product is either "no variants, KG or PIECE with its own optional weight" or "has variants, each with a mandatory weight" — never a hybrid.
- Dispatch quantity can never exceed current stock (enforced atomically at the DB level to prevent race conditions).
- PIECE-unit quantities (initial stock, variant stock, dispatch quantity) must always be whole numbers.
- Product and variant names must be unique (case-insensitive) among active (non-deleted) rows — enforced only by an application-level pre-check, not a DB constraint.
- Deleting a product requires no open work orders reference it; it does not require zero stock.

## 8. Access Control

Reachable by ADMIN and MANAGER only (per `components/sidebar-nav.tsx`, allowed roles `["ADMIN","MANAGER"]` for "Finished Goods"); OPERATOR is blocked at the middleware layer (`proxy.ts` redirects OPERATOR away from `/finished-products` routes); SUPER_ADMIN only while impersonating. No additional role check inside `actions/finished-products.ts` itself beyond requiring a `companyId` on the session.

## 9. Known Issues / Unused Code

- **No unique DB constraint on `FinishedProduct.name`** despite the code catching `P2002` as if one exists — the schema only has non-unique indexes. The `P2002` catch branch is likely unreachable; the real (race-prone) protection is the `findFirst` duplicate check.
- **`dispatchFinishedProduct` (singular) appears to be dead code** — no caller found in the reviewed UI; the wired path is `dispatchFinishedGoodsBatch`.
- **`debugFinishedProductVisibility(productId)`** is a diagnostic action (`{productExists, isDeleted, isWaste, variantsTotal, variantsNotDeleted}`) with no caller found in any component — appears to be a dev-only leftover.
- **`ADJUSTMENT` and `DELETION_CLEANUP` ledger event types are never written** by any action in this file — dead enum values in this module's context.
- **No stock-zero requirement on product deletion**, despite the confirmation UI surfacing current stock prominently.
- **Ledger is not append-only**: `rebuildFinishedProductLedgerBalances` rewrites `openingBalance`/`closingBalance` on all historical rows after every dispatch, so back-dated dispatches retroactively change previously-reported balances.
- **No supported way to correct an existing variant's stock** outside of the one-time zero-to-N-variants migration dialog — the normal variant-edit path only updates `name`/`weightPerPiece`.

## 10. Source Files

`actions/finished-products.ts`, `app/(dashboard)/finished-products/{page.tsx,finished-products-table.tsx,new/page.tsx,dispatch/page.tsx,[id]/edit/page.tsx,[id]/edit/finished-product-edit-form.tsx,[id]/ledger/page.tsx}`, `components/finished-goods/DispatchForm.tsx`, `components/finished-products/DeleteProductButton.tsx`, `prisma/schema.prisma`.
