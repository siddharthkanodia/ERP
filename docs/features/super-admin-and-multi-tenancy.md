# PRD: Super Admin & Multi-Tenancy

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Platform-level company (tenant) management, super admin accounts, impersonation
**Source of truth:** `app/(super-admin)/**`, `actions/super-admin.ts`, `components/super-admin/*`, `scripts/seed-super-admin.ts`, `scripts/create-admin.ts`

> This document describes only what the current code does. See §8 for dead/duplicate code found during review.

## 1. Overview

Multi-tenancy is application-level, not database-level: every business table carries `companyId`, and a `SUPER_ADMIN` role sits above all tenant `Company` records. A super admin manages companies and other super admins, and can "impersonate" any company to operate inside its tenant-scoped app as if logged in there.

## 2. Routes / Pages

All pages are async server components that **each independently** re-check the session (no reliance on a shared layout guard alone):
```
if (!session) redirect("/login");
if (session.role !== "SUPER_ADMIN") redirect("/dashboard");
```

| Route | File | Purpose |
|---|---|---|
| `/super-admin/dashboard` | `app/(super-admin)/super-admin/dashboard/page.tsx` | 3 stat cards: total companies, active companies, total users |
| `/super-admin/companies` | `app/(super-admin)/super-admin/companies/page.tsx` | Company list, "Enter" (impersonate) per row, Edit link, "+ New Company" |
| `/super-admin/companies/new` | `app/(super-admin)/super-admin/companies/new/page.tsx` | New-company form (inline server action) |
| `/super-admin/companies/[id]/edit` | `app/(super-admin)/super-admin/companies/[id]/edit/page.tsx` | Edit form + "Danger Zone" delete dialog |
| `/super-admin/super-admins` | `app/(super-admin)/super-admin/super-admins/page.tsx` | Super admin list + create dialog |

`components/super-admin/sidebar.tsx` (client, `usePathname`) links only to these three `/super-admin/...` destinations.

## 3. Data Model (relevant fields)

- `Company`: `id`, `name`, `industry?`, `phone?`, `address?`, `logoUrl?`, `isActive`, timestamps.
- `User.role = "SUPER_ADMIN"` has `companyId: null`.
- `CompanyMembership` is declared in the schema (`onDelete: Restrict` on both its `company` and `user` relations) but is never created or read by any code in this module — see §8.

## 4. Server Actions (`actions/super-admin.ts`)

Shared guard used by every action:
```
requireSuperAdmin(): session must exist and session.role === "SUPER_ADMIN", else throw "Forbidden"
```

| Action | Inputs | Validation (exact strings) | Effect |
|---|---|---|---|
| `getCompanies()` | — | — | All companies, `createdAt desc`, with user count per company |
| `getCompanyById(companyId)` | companyId | — | Single company lookup, no format validation on the id |
| `createCompany({name, industry?, phone?, address?, adminName, adminEmail, adminPassword})` | see left | `"Company name is required."`; `"Admin name is required."`; `"Admin email is required."`; `"Admin password must be at least 8 characters."`; duplicate admin email (`P2002`) → `"Admin email already exists."`; other error → `"Failed to create company."` | In one transaction: creates `Company`, then creates one `User` with `role:"ADMIN"`, `isActive:true`, tied to the new company by `companyId`. `revalidatePath("/companies")` and `revalidatePath("/super-admin/companies")` |
| `updateCompany(companyId, {name, industry?, phone?, address?, isActive})` | see left | `"Company name is required."` only — no validation on `industry`/`phone`/`address` | Updates the four text fields plus the `isActive` soft activate/deactivate flag. `revalidatePath("/super-admin/companies")` and the edit page path |
| `getSuperAdmins()` | — | — | All users with `role:"SUPER_ADMIN"` |
| `createSuperAdmin({name, email, password})` | see left | `"Name is required."`; `"Email is required."`; `"Password must be at least 8 characters."`; duplicate email (`P2002`) → `"A user with this email already exists."`; other error → `"Failed to create super admin."` | Creates a `User` with `role:"SUPER_ADMIN"`, `companyId:null`. `revalidatePath("/super-admin/super-admins")` |
| `impersonateCompany(companyId)` | companyId | Company must exist, else `"Company not found."` | See §5 |
| `stopImpersonating()` | — | — | See §5 |
| `deleteCompany(companyId)` | companyId | — | See §6. Returns `{error: "..."}` shape (not `{success:false, error}` like every other action here) |

## 5. Impersonation — exact mechanism

Impersonation is implemented entirely by re-signing the same `auth_token` cookie — there is no separate session record.

- **Enter:** `impersonateCompany(companyId)` signs a new JWT with `companyId: targetCompanyId` **and** `impersonatedCompanyId: targetCompanyId`, sets it as the `auth_token` cookie, and redirects to `/dashboard`. The super admin's own `User` row (`companyId: null`) is not touched.
- **Read:** `getAuthSession()` returns `companyId: payloadCompanyId ?? user.companyId`, so every tenant-scoped query elsewhere in the app (which filters by `session.companyId`) transparently operates on the impersonated company. `session.impersonatedCompanyId` is also exposed.
- **Middleware:** `proxy.ts` requires a SUPER_ADMIN to have `impersonatedCompanyId` set before it will allow any non-`/super-admin` route; otherwise it redirects to `/super-admin/dashboard`.
- **UI:** `components/sidebar.tsx` reads `session.impersonatedCompanyId`, looks up the company name, and renders a "Viewing as {name}" banner with a form that posts to `stopImpersonating`.
- **Exit:** `stopImpersonating()` re-signs the cookie with `companyId: null` and no `impersonatedCompanyId`, then redirects to `/super-admin/companies`.

No `AuditLog` row is written on entering or exiting impersonation (contrast with `deleteCompany`, which does write one — see §6). There is no confirmation step before entering impersonation.

## 6. Company Deletion — hard delete

`deleteCompany(companyId)` is a **hard delete**, not a soft one. Inside a single `prisma.$transaction` array, in this exact order, everything scoped to `companyId` is deleted:

`workOrderRawMaterial → workOrder → productionEntry → productionFloorLedger → productionFloorStock → rawMaterialLedger → finishedProductLedger → finishedProductVariant → finishedProduct → rawMaterial → leave → attendance → employee → department`

Then `User.updateMany({companyId: null})` — **users belonging to the company are not deleted**, only detached (their `companyId` becomes `null`; they remain able to log in with whatever role they had). Then `auditLog.deleteMany({companyId})`, then `company.delete()`. On success, one new `AuditLog` row is written: `{action: "COMPANY_DELETED", companyId: null, metadata: {deletedCompanyId}}`. Any thrown error during the transaction is caught and surfaced as `{error: "Failed to delete company. Please try again."}`.

The UI (`DeleteCompanyDialog`) requires the operator to type the literal word `DELETE` before the confirm button enables — this is a client-side-only guard; `deleteCompany` itself does not require any confirmation text.

## 7. Access Control Summary

| Area | SUPER_ADMIN | ADMIN / MANAGER / OPERATOR |
|---|---|---|
| `/super-admin/*` pages | Allowed | Blocked — middleware redirects to `/dashboard`; page-level check redirects too |
| `actions/super-admin.ts` (any action) | Allowed | Blocked — `requireSuperAdmin()` throws `"Forbidden"` |
| Impersonating a company | Allowed, unrestricted, no confirmation step | N/A |

## 8. Known Issues / Unused Code

- **Duplicate, unprefixed route tree.** `app/(super-admin)/companies/page.tsx`, `.../companies/new/page.tsx`, and `app/(super-admin)/super-admins/page.tsx` are near-duplicates of the `/super-admin/...`-prefixed pages, are **not** linked from `components/super-admin/sidebar.tsx`, and are **not** matched by `proxy.ts`'s `isSuperAdminRoute` check (only the per-page React redirect protects them). `createCompany`'s `revalidatePath("/companies")` call is the only remaining wiring suggesting this was once the primary route tree.
- **`CompanyMembership` and `CompanyRole` are unused** by any application code. Because the model's foreign keys use `onDelete: Restrict`, if any row were ever created for a company, `deleteCompany`'s `company.delete()` step would throw and the whole deletion (and its generic error message) would fail — a latent risk if this model is ever wired up without updating `deleteCompany`.
- **`GlobalRole` enum is unused** by any application code.
- **Impersonation has no audit trail** — no `AuditLog` row is written on enter or exit, unlike company deletion.
- **Users orphaned by company deletion are left active.** `deleteCompany` nulls their `companyId` but does not deactivate them (`isActive`/`role` untouched) — such a user can still log in with `companyId: null`.
- **`deleteCompany`'s return shape is inconsistent** with the rest of the file: it returns `{error: string}` on failure while every other action here returns `{success: false, error: string}`.
- **`getCompanies()` returns a redundant `companyId` field** (`companyId: company.id`) alongside `id`, apparently only to support the dead unprefixed `/companies` route's link construction.
- **No re-authentication or confirmation step** before impersonation begins, in contrast to the "type DELETE to confirm" pattern used for company deletion.
- **`scripts/seed-super-admin.ts`** hardcodes a bootstrap super admin (`kanodia.sid@gmail.com` / `admin123`) via a Prisma `upsert`, run outside the app. **`scripts/create-admin.ts`** hardcodes a company-scoped `ADMIN` (`admin@test.com` / `password123`) for the first company found — unrelated to super admin creation but present in the same `scripts/` folder.

## 9. Source Files

`app/(super-admin)/**`, `actions/super-admin.ts`, `components/super-admin/{sidebar,create-super-admin-dialog,delete-company-dialog}.tsx`, `scripts/seed-super-admin.ts`, `scripts/create-admin.ts`, `prisma/schema.prisma`.
