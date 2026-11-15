# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (Next.js App Router, Turbopack)
npm run build    # production build
npm run start    # run the production build
npm run lint      # ESLint (flat config in eslint.config.mjs)
```

There is no test suite in this repository (no test runner configured, no `*.test.*`/`*.spec.*` files) — don't assume one exists.

Prisma (schema lives at `prisma/schema.prisma`):

```bash
npx prisma generate           # regenerate the Prisma client — required after a fresh npm install
npx prisma migrate status     # check whether the DB matches the schema before assuming it does
npx prisma migrate dev --name <name>   # create + apply a new migration locally
npx prisma migrate deploy     # apply pending migrations (prod/CI, uses DIRECT_URL)
npx prisma studio             # browse data
npx prisma db seed            # runs prisma/seed.ts (invoked via ts-node, see the "prisma.seed" entry in package.json)
```

One-off scripts in `scripts/` (`create-admin.ts`, `migrate-weights.ts`, `reset-data.ts`, `seed-super-admin.ts`) are not wired to any npm script — run them directly, matching the seed script's invocation style:
```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/<name>.ts
```

**Before any of the above will actually reach the database:** the Supabase project backing this app is on the free tier, which auto-pauses after ~7 days with no database activity. If this repo has been dormant, resume the project from the Supabase dashboard first — `prisma migrate status`, `npm run dev`, everything else will just fail to connect otherwise.

## Architecture

**Session/auth model — read this before touching anything auth-related.** The app's real session is a custom JWT (signed with `jose`, HS256) stored in an `auth_token` httpOnly cookie, verified at the edge in `proxy.ts` (via `lib/edge-auth.ts`) and in server code via `lib/auth.ts`'s `getAuthSession()`. **Supabase Auth is not the session system** — it's used only for the forgot/reset-password email flow (`lib/supabase/{client,server}.ts`), and that flow is not linked back to the `User.password` bcrypt hash that `loginUser()` actually checks. Don't assume a Supabase session implies an authenticated app session, or vice versa.

**Multi-tenancy is enforced entirely in application code, not the database.** Every business table carries `companyId`; there is no Postgres RLS or schema-per-tenant isolation. `session.companyId` (from the JWT) must be threaded into the `where` clause of every Prisma query in `actions/*.ts` — there's no framework-level guarantee of this, it's a convention every action must follow by hand.

**Super admin impersonation reuses the same session cookie.** A `SUPER_ADMIN` "enters" a company by re-signing the `auth_token` cookie with `companyId` and `impersonatedCompanyId` both set to the target company (`actions/super-admin.ts`). `proxy.ts` then requires `impersonatedCompanyId` to be set before it lets a SUPER_ADMIN reach any route outside `/super-admin`. There's no separate impersonation session/table — it's purely a cookie re-sign.

**`proxy.ts` is intentional, not a typo.** It's Next.js's renamed `middleware.ts` convention (Next.js deprecated the "middleware" file name in favor of "proxy" starting around 15.2, mandatory from 16). Role-based route gating happens here, before any Server Component runs, and is a *separate* enforcement point from whatever a given server action independently checks — the two are not always symmetric (e.g. several report actions check only that a session/`companyId` exists, not the caller's role, even though the sidebar hides Reports from non-ADMIN users).

**No API routes for mutations.** All writes go through `"use server"` functions in `actions/<module>.ts`; pages fetch data directly via Prisma in Server Components and call actions directly from client forms. After a mutation, actions call `revalidatePath()` — there's no client-side cache invalidation layer beyond that.

**Ledgers are recomputed, not append-only.** Raw Materials, Production Floor, and Finished Products/Waste each pair a "current stock" field with a ledger table (`openingBalance`/`closingBalance` per entry). Several write paths (dispatch, floor-ledger edit/delete) rebuild historical balances across the whole ledger chain rather than treating past entries as immutable — don't assume a `FinishedProductLedger`/`RawMaterialLedger`/`ProductionFloorLedger` row, once written, stays untouched.

**Two parallel auth-route trees exist by design:** `app/(auth)/login` and `app/auth/{forgot-password,reset-password,callback,logout}` are separate route groups with separate layouts, not a nesting mistake. `app/(dashboard)` holds all tenant-facing pages, `app/(super-admin)` holds platform-admin pages (plus a dead, unlinked duplicate route tree at `app/(super-admin)/companies` — don't extend that one).

**Full functional specs already exist** — before re-deriving a module's validation rules, business logic, or edge cases from scratch, check `docs/features/*.md` first. It's an as-built reference (routes, exact server-action validation strings, ledger math, access control per role) generated directly from this codebase, module by module, with a `README.md` index and a `tools-and-platforms.md` covering the full dependency/env-var list. Treat it as more current than anything in the sibling `erp_docs` repo, which predates several of this app's actual behaviors (e.g. it still describes work orders with an `IN_PROGRESS` status; the real enum is `OPEN`).

## Conventions

- Prisma is pinned to 6.x — **never use Prisma 7 syntax**; this is intentional (Prisma 7 has breaking changes the project isn't migrating to yet).
- Server Components by default for data fetching; `'use client'` only when hooks/interactivity are needed.
- Server Actions for all mutations — no separate API route handlers.
- New modules follow the existing layout: pages under `app/(dashboard)/<module-name>/`, server actions in `actions/<module-name>.ts`, Radix-based primitives in `components/ui/`. (`.cursorrules` also calls for a `components/shared/` folder for cross-module components; in practice shared components currently just sit at the top level of `components/`, e.g. `sidebar.tsx`, `user-menu.tsx` — there is no `components/shared/` directory today.)
- The project's original intended workflow per module (per `.cursorrules`) was: write a spec into `docs/features/<module>.md` → UX blueprint → build → QA audit. `docs/features/` now holds the as-built result of that for every existing module.

## Known gotchas

- `package.json` pins `next` to `^15.1.11` but `eslint-config-next` to `16.1.7` — the lint ruleset is ahead of the actual runtime version. This was a deliberate pin (see git history: "pin next.js to 15.1.0" alongside the middleware→proxy migration), not an oversight to "fix" by bumping Next itself without checking why.
- `prisma/migrations/` currently contains only one migration (`20260423_remove_weight_in_grams`) — migration history is thin. Run `prisma migrate status` before assuming the live database matches `schema.prisma`.
- `lib/supabase/admin.ts` (`createAdminClient`) requires `SUPABASE_SERVICE_ROLE_KEY`, which is not currently set in `.env` — harmless only because nothing in the codebase calls that function today.
- `.env` is git-ignored and not tracked in this repo; there is no committed record of real credential values anywhere in version control.
