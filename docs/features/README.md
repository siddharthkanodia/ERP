# Feature Documentation — Manufacturing ERP (As-Built)

This folder documents the application **as it is actually implemented** in this codebase, derived directly from `actions/*.ts`, `app/**`, `components/**`, `lib/**`, and `prisma/schema.prisma` — not from prior design docs. It supersedes the previous contents of this folder. The separate `erp_docs` repository (business context, ADRs, and the original PRDs) is left untouched; where this documentation and those original PRDs disagree, the code — and therefore this documentation — reflects current reality.

Every document follows the same structure: Overview, Routes/Pages, Data Model, Server Actions (with exact validation error strings), Business Rules, Access Control, Edge Cases, and a **Known Issues / Unused Code** appendix listing dead code, duplicated logic, and unresolved inconsistencies found during review. Nothing in these documents is speculative — anything not explicitly determinable from the code is called out as such rather than assumed.

## Modules

| Module | File | Covers |
|---|---|---|
| Auth & Access | [auth-and-access.md](./auth-and-access.md) | Login, JWT/session, edge middleware role gating, staff user management, self-service password change |
| Super Admin & Multi-Tenancy | [super-admin-and-multi-tenancy.md](./super-admin-and-multi-tenancy.md) | Company (tenant) CRUD, super admin accounts, impersonation |
| Raw Materials | [raw-materials.md](./raw-materials.md) | Warehouse raw material master data, receiving stock, ledger |
| Production Floor | [production-floor.md](./production-floor.md) | Issuing raw materials to the floor, consuming floor stock, floor ledger |
| Production (Work Orders) | [production.md](./production.md) | Work orders, raw-material type linkage, production entries, status lifecycle |
| Finished Products | [finished-products.md](./finished-products.md) | Finished goods master data, variants, dispatch, ledger, delete |
| Waste Management | [waste-management.md](./waste-management.md) | Waste types, waste entries, waste dispatch (built on the Finished Products model) |
| Employees, Attendance & Leave | [employees-attendance-leave.md](./employees-attendance-leave.md) | Employee/department master data, daily attendance, leave records |
| Reports & Dashboard | [reports-and-dashboard.md](./reports-and-dashboard.md) | The six reports under `/reports`, the `/dashboard` home screen, sidebar role gating |
| Tools & Platforms | [tools-and-platforms.md](./tools-and-platforms.md) | Every runtime dependency, dev tool, and hosted platform (Vercel, Supabase, Prisma, etc.), all env var *names* and what reads them — deliberately excludes actual secret values; see that document's §7 for why |

## Cross-cutting notes

- **Multi-tenancy**: every business table carries `companyId`; enforced in server actions, not at the database schema level (see Auth & Access, and Super Admin & Multi-Tenancy).
- **Two schema elements are declared but unused by any application code anywhere**: the `CompanyMembership` model / `CompanyRole` enum, and the `GlobalRole` enum. Both are noted where relevant rather than repeated in every document.
- **Ledger balances are not append-only** in several modules (Raw Materials, Production Floor, Finished Products/Waste) — dispatches, receipts, and edits routinely trigger a full recompute of historical `openingBalance`/`closingBalance` values rather than leaving past entries untouched.

_Last generated: 2026-09-21, from the codebase at commit `7fa483c`._
