# Tools, Platforms & Configuration

**Part of:** Kanodia Packaging Manufacturing ERP
**Scope:** Every runtime dependency, dev tool, and hosted platform this codebase relies on, where each is configured, and every environment variable it reads.

> **On credentials:** this document lists every environment variable / credential *name* the app depends on, what it's for, and where its real value currently lives. It deliberately does **not** contain any actual secret value (connection strings, API keys, JWT secret, passwords). See §5 for why, and where to find the real values when you need them.

---

## 1. Hosted Platforms

| Platform | Role | Evidence in this repo |
|---|---|---|
| **Vercel** | Application hosting/build (Next.js) | No `vercel.json` in the repo — deployment is Vercel's zero-config Next.js detection. `.gitignore` excludes `.vercel`. (Hosting details beyond this are documented in `erp_docs/technical/deployment.md`, not verifiable from this codebase alone.) |
| **Supabase** | Managed PostgreSQL (via Prisma) + Supabase Auth (forgot/reset-password email flow only) | `prisma/schema.prisma` datasource; `lib/supabase/{client,server,admin}.ts`; `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` referenced directly in code |
| **Wix** (domain registrar) | Holds `kanodiapackaging.com`; `erp.kanodiapackaging.com` is a CNAME to Vercel | Referenced only in `erp_docs/technical/tech-stack.md` — not verifiable from this codebase |

## 2. Core Framework & Language

| Tool | Version (from `package.json`) | Purpose | Config file(s) |
|---|---|---|---|
| Next.js | `^15.1.11` (App Router) | Framework, routing, server actions, edge middleware | `next.config.ts` (currently empty/default), `proxy.ts`, `app/**` |
| React | `^19.0.0` | UI | — |
| TypeScript | `^5` | Language | `tsconfig.json` — `strict: true`, path alias `@/*` → project root, `moduleResolution: "bundler"` |
| Turbopack | bundled with Next.js | Dev/build bundler | invoked via `next dev` / `next build` in `package.json` scripts |
| `babel-plugin-react-compiler` | `1.0.0` | Listed as a devDependency, but git history (`bf153b7 fix: upgrade next, remove reactCompiler`) indicates it was removed from active use; `next.config.ts` has no reference to it today | — |

## 3. Database & ORM

| Tool | Version | Purpose | Config |
|---|---|---|---|
| PostgreSQL | — (Supabase-managed) | Primary datastore | `prisma/schema.prisma` `datasource db` block |
| Prisma | `^6.19.3` (`@prisma/client` + `prisma`) | ORM / migrations / seed | `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/seed.ts` (run via `ts-node`, configured under `"prisma": {"seed": ...}` in `package.json`) |
| PgBouncer | — | Connection pooling for the app's runtime connection (`DATABASE_URL`, port 6543, transaction mode per `erp_docs`) vs. direct connection for migrations (`DIRECT_URL`, port 5432) — this split is standard Prisma+Supabase practice; not independently verifiable from application code beyond the two separate env vars Prisma's `datasource` block expects | `prisma/schema.prisma`: `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")` |

## 4. Auth & Session

| Tool | Version | Purpose | Config |
|---|---|---|---|
| `jose` | `^6.2.3` | Signs/verifies the app's own JWT session cookie (HS256), both in Node (`lib/auth.ts`) and at the Edge (`lib/edge-auth.ts`, used by `proxy.ts`) | `lib/auth.ts`, `lib/edge-auth.ts` |
| `bcryptjs` | `^3.0.3` | Password hashing for the `User.password` column | `lib/auth.ts` |
| `@supabase/supabase-js` | `^2.104.0` | Supabase JS client — used for the admin client (`lib/supabase/admin.ts`, currently unused — see §6) and indirectly via `@supabase/ssr` | `lib/supabase/admin.ts` |
| `@supabase/ssr` | `^0.10.2` | Cookie-aware Supabase client for server/browser contexts — used **only** by the forgot/reset-password flow (see `auth-and-access.md`) | `lib/supabase/{server,client}.ts` |

## 5. Environment Variables

Every variable actually referenced by application code, plus every variable present in the local `.env` file (names only — no values are reproduced here). Location of the real value is described, not the value itself.

| Variable | Referenced in code? | Purpose | Where the real value lives |
|---|---|---|---|
| `DATABASE_URL` | Yes — `prisma/schema.prisma` | Pooled (PgBouncer) Postgres connection string used by the running app | Local `.env` (not committed — see below); production value set in Vercel's project environment variables (not accessible from this codebase) |
| `DIRECT_URL` | Yes — `prisma/schema.prisma` | Direct (non-pooled) Postgres connection string, used for migrations | Same as above |
| `JWT_SECRET` | Yes — `lib/auth.ts`, `lib/edge-auth.ts` | Signs/verifies the app's own session JWT. Code does `process.env.JWT_SECRET!` with **no fallback** — the app fails to even start if this is unset | Same as above |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes — `lib/supabase/{admin,server,client}.ts` | Supabase project URL. `NEXT_PUBLIC_` prefix means this is bundled into client-side JS and is not secret | Same as above |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes — `lib/supabase/{server,client}.ts` | Supabase anonymous/public API key, used for the forgot/reset-password flow. Also `NEXT_PUBLIC_`, i.e. intentionally exposed to the browser by design (Supabase's anon key is meant to be public; access control is enforced by Supabase's own row-level security, not by keeping this value secret) | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes — `lib/supabase/admin.ts` (`createAdminClient`) | Would grant full admin access to the Supabase project, bypassing RLS | **Not present in the local `.env` file today.** `createAdminClient()` has no caller anywhere in the codebase (confirmed by repository-wide search), so this gap currently has no runtime effect — see §6 |
| `NEXT_AUTH_SECRET` | **No** — zero references found anywhere in application code | Unknown / apparently leftover | Present in local `.env` but unused — see §6 |
| `NEXTAUTH_URL` | **No** — zero references found anywhere in application code | Unknown / apparently leftover | Present in local `.env` but unused — see §6 |

## 6. Known Issues / Gaps

- **`SUPABASE_SERVICE_ROLE_KEY` is required by `lib/supabase/admin.ts` but absent from the local `.env`.** This is currently harmless only because `createAdminClient()` is never called anywhere in the app — if it were wired up later without also adding this variable, it would throw `"SUPABASE_SERVICE_ROLE_KEY is not configured."` at call time.
- **`NEXT_AUTH_SECRET` and `NEXTAUTH_URL` exist in `.env` but are not referenced anywhere in the codebase.** There is no `next-auth` package in `package.json` either. These appear to be leftover from an earlier auth approach before the custom `jose`-based JWT system was built (per `auth-and-access.md`).
- **`next.config.ts` is currently empty** (`{ /* config options here */ }`) — no custom Next.js configuration (image domains, redirects, headers, etc.) is active.
- **No `vercel.json`** exists in the repo — any deployment-specific configuration (redirects, headers, cron jobs) would have to be set through the Vercel dashboard rather than checked into source control, and is therefore not visible to this review.
- **Known dependency vulnerabilities** (per `erp_docs/decisions/ADR-001-tech-stack.md`, an accepted trade-off, not verified independently here): the `xlsx` package has a known vulnerability with no available fix; the `postcss` version bundled transitively by Next.js has a moderate vulnerability that cannot be fixed without downgrading Next.js.

## 7. On Credentials — Why Values Aren't Here, and Where They Actually Are

This document intentionally stops at variable *names*. Writing real secret values (a database connection string, `JWT_SECRET`, or the Supabase anon key) into a file under `docs/features/` would put them in a location that (unlike `.env`, which is excluded via `.gitignore` and confirmed **not** tracked by git in this repo) is likely to be committed to source control and kept in git history indefinitely, visible to anyone with repo access, and effectively impossible to fully revoke just by deleting the file later.

Where the real values live today:

- **Local development:** `manufacturing-erp/.env` (git-ignored, confirmed not tracked).
- **Production:** whatever Vercel project this repo is deployed to — set as environment variables in that project's dashboard settings. This codebase has no record of those production values; they cannot be reconstructed from anything in this repo.
- **Supabase project settings** (dashboard → Project Settings → API) is the canonical source for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and (if ever needed) `SUPABASE_SERVICE_ROLE_KEY`.

If you specifically need a single, internal, access-controlled reference sheet of actual secret values (for onboarding a new developer, for example), the safer places for that are a password manager with shared/team vaults (1Password, Bitwarden, etc.) or your hosting platform's own secret store — not a markdown file in the repository. Let me know if you'd like help setting one of those up, or if you'd like this document restructured differently.

## 8. Other Dependencies (reference)

| Category | Tools |
|---|---|
| UI primitives | Radix UI (`@radix-ui/react-{label,select,separator,slot,switch}`, `radix-ui` `^1.4.3`), shadcn/ui (`style: "radix-vega"` per `components.json`, base color `neutral`) |
| Styling | Tailwind CSS `^4` (`postcss.config.mjs` → `@tailwindcss/postcss`), `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge` |
| Icons | `lucide-react` `^0.577.0` |
| Charts | `recharts` `^3.8.0` |
| Dates | `date-fns` `^4.1.0`, `react-day-picker` `^9.14.0` |
| Notifications | `sonner` `^2.0.7` |
| Spreadsheet export | `xlsx` (SheetJS) `^0.18.5` — see known vulnerability note in §6 |
| Linting | ESLint `^9`, `eslint-config-next` `16.1.7` (`eslint.config.mjs`) |
| Scripting | `ts-node` `^10.9.2` (used by `prisma/seed.ts` and the one-off scripts in `scripts/`) |

## 9. Source Files

`package.json`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `.env` (names only), `prisma/schema.prisma`, `lib/auth.ts`, `lib/edge-auth.ts`, `lib/supabase/{admin,server,client}.ts`, `proxy.ts`.
