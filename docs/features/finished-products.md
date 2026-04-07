# Finished Products Module — Feature Spec

## 1. Overview
This module manages finished goods inventory ready for dispatch.

Users can:
- View a dashboard of all finished products
- Track quantity in stock (kg)
- See the last dispatch date
- Add new finished products
- Dispatch stock (reduce inventory)

---

## 2. Database Model (Prisma 6)

Add to prisma/schema.prisma:

model FinishedProduct {
  id              String    @id @default(cuid())
  name            String    @unique
  quantityInStock Decimal   @default(0) @db.Decimal(10, 2)
  lastDispatchedAt DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

---

## 3. Folder Structure

app/(dashboard)/finished-products/
  page.tsx              <- Dashboard
  new/
    page.tsx            <- Add new finished product
  dispatch/
    page.tsx            <- Dispatch stock

actions/
  finished-products.ts  <- Server actions

---

## 4. Pages

### A. Dashboard Page
Path: app/(dashboard)/finished-products/page.tsx

- Server Component
- Table columns:
  - Name
  - Quantity In Stock (kg)
  - Last Dispatched Date
- Buttons in header:
  - "Add Finished Product"
  - "Dispatch Stock"

- If no products exist, show empty state

- If lastDispatchedAt is null, show "Never"

---

### B. Add Finished Product Page
Path: app/(dashboard)/finished-products/new/page.tsx

- Client Component
- Fields:
  - Name (required, unique)
  - Initial Quantity (kg, decimal allowed)
- Decimal support (step="0.01")
- min="0"
- Server-side validation:
  - Name required
  - Name unique
  - Quantity must be >= 0
- Exit button same behavior as Raw Materials module
- On success redirect to /finished-products

---

### C. Dispatch Stock Page
Path: app/(dashboard)/finished-products/dispatch/page.tsx

- Client Component
- Dropdown: existing finished products
- Quantity to dispatch (kg, decimal allowed)
- step="0.01"
- min="0"

Validation Rules:
- Quantity must be greater than 0
- Quantity must NOT exceed available stock
- If dispatch > stock, show error:
  "Dispatch quantity cannot exceed available stock."

On submit:
- Reduce quantityInStock
- Update lastDispatchedAt = now()
- Redirect to /finished-products

Exit button same behavior as Raw Materials module.

---

## 5. Server Actions
File: actions/finished-products.ts

### createFinishedProduct(formData)
- Validate name required
- Validate quantity >= 0
- Catch P2002 duplicate error
- Insert row
- revalidatePath('/finished-products')
- redirect('/finished-products')

### dispatchFinishedProduct(formData)
- Validate quantity > 0
- Check available stock
- If dispatch > stock → return error
- Reduce quantity using decrement
- Update lastDispatchedAt
- revalidatePath('/finished-products')
- redirect('/finished-products')

### getAllFinishedProducts()
- Fetch ordered by name ASC

---

## 6. UI Rules

- Same Vega high-density styling as Raw Materials
- Quantity header should show "(kg)"
- Exit button positioned left of primary action button
- Primary button black
- Exit button outlined

---

## 7. Test Cases

- TC1: Creating new finished product shows on dashboard
- TC2: Duplicate name blocked
- TC3: Decimal values stored correctly
- TC4: Negative values blocked
- TC5: Dispatch reduces stock correctly
- TC6: Dispatch more than available stock is blocked
- TC7: lastDispatchedAt updates correctly
- TC8: Exit button does not submit form

---

## 8. Status
- [x] Phase 1 — Spec: ✅ Complete
- [ ] Phase 2 — UX Blueprint
- [ ] Phase 3 — Build
- [ ] Phase 4 — QA Audit