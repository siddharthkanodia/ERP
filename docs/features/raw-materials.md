# Raw Materials Module — Feature Spec

## 1. Overview
This module manages raw materials inventory used in manufacturing.
Users can:
- View a dashboard of all raw materials
- Track quantity in stock
- See the last received date
- Add new raw material types
- Add received quantities to existing raw materials

---

## 2. Database Model (Prisma 6)

Add to prisma/schema.prisma:

model RawMaterial {
  id              String    @id @default(cuid())
  name            String    @unique
  quantityInStock Decimal   @default(0) @db.Decimal(10,2)
  lastReceivedAt  DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

---

## 3. Folder Structure

app/(dashboard)/raw-materials/
  page.tsx              <- Dashboard (table view)
  new/
    page.tsx            <- Add new raw material type
  receive/
    page.tsx            <- Receive new stock

actions/
  raw-materials.ts      <- All server actions

---

## 4. Pages

### A. Dashboard Page
Path: app/(dashboard)/raw-materials/page.tsx

- Server Component
- Fetch all raw materials via Prisma
- Display a table with columns:
  - Name
  - Quantity In Stock
  - Last Received Date (formatted with date-fns, show "Never" if null)
- Two buttons in the page header:
  - "Add Raw Material" navigates to /raw-materials/new
  - "Receive Stock" navigates to /raw-materials/receive

### B. Add Raw Material Page
Path: app/(dashboard)/raw-materials/new/page.tsx

- Client Component (form interactivity)
- Form fields:
  - Raw Material Name (text, required)
  - Initial Quantity (number, optional, defaults to 0)
- On submit: calls createRawMaterial server action
- On success: redirect to /raw-materials
- Validation Rules:
  - Name is required (cannot be empty)
  - Name must be unique — check DB before insert
  - If duplicate: show inline error "A raw material with this name already exists."
  - If empty: show inline error "Name is required."

### C. Receive Stock Page
Path: app/(dashboard)/raw-materials/receive/page.tsx

- Client Component (form interactivity)
- Form fields:
  - Raw Material (dropdown — populated from existing raw materials in DB)
  - Quantity Received (number, required)
- On submit: calls receiveRawMaterial server action
- On success: redirect to /raw-materials
- Validation Rules:
  - Quantity must be greater than 0
  - Negative values not allowed
  - Zero not allowed
  - If invalid: show inline error "Quantity must be greater than 0."

---

## 5. Server Actions
File: actions/raw-materials.ts

### createRawMaterial(formData)
- Check if a raw material with the same name already exists
- If exists: return error "A raw material with this name already exists."
- If not: insert new RawMaterial row
- revalidatePath('/raw-materials')

### receiveRawMaterial(formData)
- Validate quantity > 0
- Find raw material by ID
- Add received quantity to existing quantityInStock
- Set lastReceivedAt = now()
- revalidatePath('/raw-materials')

### getAllRawMaterials()
- Fetch all raw materials ordered by name ascending
- Used in the dashboard table and the receive stock dropdown

---

## 6. UI Components (Radix + Tailwind Vega Preset)

- Page layout: consistent with app shell sidebar + header
- Table: Radix-based, Tailwind styled
- Buttons: Radix @radix-ui/react-slot based
- Dropdown: @radix-ui/react-select
- Inline form errors: red text below the input field
- "Never" shown in Last Received Date column when lastReceivedAt is null
- Table: Quantity column header should be "Quantity In Stock (kg)"
- Forms: Input labels should include "(kg)"
- Inputs: Must support step="0.01" for decimal values

---

## 7. Test Cases

- TC1: Creating a new raw material should appear immediately in the dashboard table.
- TC2: Receiving stock should correctly add to the existing quantity in stock.
- TC3: lastReceivedAt should update to current date/time on every receive.
- TC4: Dashboard should show correct quantities after multiple receive operations.
- TC5: Dropdown in Receive Stock page should list all existing raw materials.
- TC6: Creating a raw material with a duplicate name should show an inline error and NOT insert a new row.
- TC7: Creating a raw material with an empty name should show a validation error.
- TC8: Entering a negative quantity in Receive Stock should show an inline error and NOT update the stock.
- TC9: Entering zero as quantity in Receive Stock should show an inline error and NOT update the stock.
TC10: Entering a decimal value (e.g., 10.55) should save correctly in the DB.
- TC11: All numeric inputs must block negative values via `min="0"` and server-side validation.

---

## 8. Status
- [x] Phase 1 — Spec: ✅ Complete
- [x] Phase 2 — UX Blueprint: ✅ Complete
- [ ] Phase 3 — Build: Pending
- [ ] Phase 4 — QA Audit: Pending