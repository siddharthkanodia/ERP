# PRD: Authentication, Users, Account & Settings

**Part of:** Kanodia Packaging Manufacturing ERP
**Module status:** Live in production
**Scope:** Login/logout, password reset, JWT session model, edge middleware role gating, staff user management (`/settings/users`), self-service password change (`/account/change-password`)
**Source of truth:** `proxy.ts`, `lib/auth.ts`, `lib/edge-auth.ts`, `lib/supabase/*`, `actions/auth.ts`, `actions/account.ts`, `actions/users.ts`, `app/(auth)/**`, `app/auth/**`, `app/(dashboard)/account/**`, `app/(dashboard)/settings/**`, `components/auth/login-form.tsx`, `components/users/*`, `components/user-menu.tsx`

> This document describes only what the current code does. Sections marked **Known Issues / Unused Code** flag gaps, inconsistencies, or dead code found during review — they are observations, not assumptions about intent.

---

## 1. Overview

The app uses a custom, home-grown session system layered on top of a Prisma `User` table — not Supabase Auth for the actual app session (Supabase Auth is used only for the forgot/reset-password email flow). A signed JWT stored in an HTTP-only cookie carries the user's identity, role, and tenant (`companyId`), and Next.js edge middleware (`proxy.ts`) uses that JWT to gate every route by role before any page renders.

## 2. Routes / Pages

| Route | File | Type | Purpose |
|---|---|---|---|
| `/login` | `app/(auth)/login/page.tsx` | Server component wrapping client `LoginForm` in `<Suspense>` | Login form |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` | Client component | Requests a Supabase password-reset email |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Client component | Sets a new password via an active Supabase session |
| `/auth/callback` | `app/auth/callback/route.ts` | Route handler (GET) | Exchanges a Supabase recovery/OAuth `code` for a session |
| `/auth/logout` | `app/auth/logout/route.ts` | Route handler (POST) | Supabase `signOut()`, redirects to `/login` |
| `/` | `app/page.tsx` | Server component | Unconditionally `redirect("/login")` — no session check |
| `/account/change-password` | `app/(dashboard)/account/change-password/page.tsx` | Server component wrapping client form | Self-service password change |
| `/settings/users` | `app/(dashboard)/settings/users/page.tsx` | Server component | Staff user list + invite + role/status management, ADMIN only |

`app/(auth)/layout.tsx` and `app/auth/layout.tsx` are two separate, near-identical centered-card layouts (both titled "SME ERP") for two different route groups — see Known Issues.

## 3. Data Model (relevant fields)

- `User`: `id`, `companyId` (nullable), `name`, `email` (globally unique), `password` (bcrypt hash), `role` (`UserRole`: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OPERATOR`), `isActive`, timestamps.
- `CompanyMembership` (`companyId` + `userId` + `CompanyRole`) exists in the schema but is **never read or written** by any code in this module (or anywhere in the app — confirmed by repo-wide search). All role logic runs off `User.role` directly.
- `GlobalRole` enum (`SUPER_ADMIN`, `USER`) exists in the schema but is **never referenced** by any application code — confirmed by repo-wide search.

## 4. JWT & Session

- Library: `jose` (`SignJWT` / `jwtVerify`), algorithm HS256, secret from `JWT_SECRET` env var (no fallback — throws at import time if unset).
- Payload: `{ userId, role, companyId?, impersonatedCompanyId? }`.
- Expiry: hardcoded `"7d"` (`.setExpirationTime("7d")`), not configurable.
- Cookie: name `auth_token`; `httpOnly: true`; `sameSite: "lax"`; `secure` only when `NODE_ENV === "production"`; `path: "/"`. **No `maxAge`/`expires` set on the cookie itself** — only the JWT's internal `exp` claim bounds validity, so many browsers will treat it as a session cookie (cleared on browser close) even though the token itself would remain valid for up to 7 days elsewhere.
- `lib/edge-auth.ts` duplicates verification for the Edge runtime (`verifyTokenEdge`), since `proxy.ts` runs at the edge.
- `getAuthSession()` (`lib/auth.ts`) re-fetches the `User` row from the DB on every call and returns `null` if `!user.isActive` — meaning deactivating a user invalidates their session immediately, even with a valid, unexpired token.
- `session.companyId` is computed as `payloadCompanyId ?? user.companyId` — the JWT's own `companyId` takes priority over the live DB value. If a user's `companyId` changes in the DB after the token was issued, their session keeps the token's stale value until they log in again (unless the token had no `companyId`).
- `verifyToken` / `verifyTokenEdge` swallow all errors (`catch { return null }`) — expired, malformed, and wrong-secret tokens are indistinguishable to the caller.

## 5. Login (`actions/auth.ts` — `loginUser`)

Inputs: `email` (trimmed, lower-cased), `password`.

| Condition | Result |
|---|---|
| No user found for email | `Error: "Invalid email or password"` |
| `user.isActive === false` | `Error: "Inactive user"` (checked **before** the password comparison) |
| Password does not match | `Error: "Invalid email or password"` |
| Success | Signs JWT, sets `auth_token` cookie, redirects to `/super-admin/dashboard` if `role === "SUPER_ADMIN"`, else `/dashboard` |

No rate limiting or lockout on repeated failed attempts exists anywhere in this action.

## 6. Password Reset (Supabase-based, separate from the Prisma `User` table)

There is no server action in this codebase for forgot/reset password — the flow runs entirely through Supabase Auth's client SDK, bypassing `lib/auth.ts` and the `User` table:

1. `/auth/forgot-password` calls `supabase.auth.resetPasswordForEmail(email, ...)`. Email delivery is entirely Supabase-hosted; no custom email code exists in this repo.
2. The emailed link lands on `/auth/callback`, which exchanges the code for a Supabase session.
3. `/auth/reset-password` checks `supabase.auth.getSession()` and calls `supabase.auth.updateUser({ password })`.

No token-expiry value is configured anywhere in this repo; whatever expiry applies is Supabase's own hosted default.

## 7. Self-Service Password Change (`/account/change-password`, `actions/account.ts`)

`changePassword({ currentPassword, newPassword })`:

| Condition | Result |
|---|---|
| No session | `{success:false, error:"Unauthorized"}` |
| `currentPassword` empty | `{success:false, error:"Current password is required."}` |
| `newPassword.length < 8` | `{success:false, error:"New password must be at least 8 characters."}` |
| `currentPassword === newPassword` | `{success:false, error:"New password must be different from current password."}` |
| Current password incorrect | `{success:false, error:"Current password is incorrect"}` (no trailing period — inconsistent with the other messages) |
| DB error | `{success:false, error: error.message \|\| "Failed to update password."}` |
| Success | bcrypt-hashes and updates `User.password` |

Client-side (`change-password-form.tsx`) duplicates the length/match/different-from-current checks for instant feedback; server re-validates independently.

No `revalidatePath` call, and no cookie/session rotation on success — an old JWT for the same user stays valid (up to its 7-day expiry) on any other device even after a password change.

## 8. Staff User Management (`/settings/users`, `actions/users.ts`)

All actions require `requireAdminSession()`:
```
session must exist, session.companyId must be truthy, session.role must equal exactly "ADMIN"
```
`SUPER_ADMIN` is explicitly **not** permitted to call these actions (even the real `role` on a SUPER_ADMIN's session is always `"SUPER_ADMIN"`, never changed by impersonation) — see Known Issues.

| Action | Inputs | Validation | Effect |
|---|---|---|---|
| `getUsers()` | — | — | Lists users for `session.companyId`, ordered by `createdAt desc` |
| `createUser({name, email, role})` | name, email, role | `"Name is required."`; `"Email is required."`; `"Invalid role."` (role must be one of `ADMIN`/`MANAGER`/`OPERATOR` — `SUPER_ADMIN` is rejected here); duplicate email (Prisma `P2002`) → `"A user with this email already exists."`; other DB error → `"Failed to create user."` | Creates a `User` scoped to the admin's company with a **hardcoded default password `Welcome123!`** (shown verbatim in the invite dialog's own UI copy). `revalidatePath("/settings/users")` |
| `toggleUserStatus(userId, isActive)` | — | — | `updateMany` scoped to `{id, companyId}` — silently no-ops if the id doesn't belong to the admin's company (no thrown error). `revalidatePath("/settings/users")` |
| `updateUserRole(userId, newRole)` | — | `"Invalid role."` if not `ADMIN`/`MANAGER`/`OPERATOR` | Same company-scoped `updateMany`. `revalidatePath("/settings/users")` |

There is **no** password-reset or "resend invite" action for an ADMIN to reset another user's forgotten password — only the user themself can change their own password via `/account/change-password`, and only after they already know their current one.

Page-level guard (`app/(dashboard)/settings/users/page.tsx`): `redirect("/login")` if no session; `redirect("/dashboard")` if `!session.companyId || session.role !== "ADMIN"`.

## 9. Access Control — Edge Middleware (`proxy.ts`)

Exact routing logic (paraphrased from code, conditions preserved):

```
if route is under /super-admin AND user is not SUPER_ADMIN → redirect to /dashboard
if user is SUPER_ADMIN:
    if route is under /super-admin → allow
    if no impersonatedCompanyId set → redirect to /super-admin/dashboard
    else → allow
if user is ADMIN → allow (unrestricted within their own company)
if user is OPERATOR AND route is under /reports, /attendance, /employees, /finished-products, /finished-products/waste, or /settings → redirect to /dashboard
if user is MANAGER AND route is under /reports or /settings → redirect to /dashboard
```

Route matching is `pathname === X || pathname.startsWith(X + "/")`. No token, or an invalid/unverifiable token → redirect to `/login`. The middleware matcher excludes `api`, `_next/static`, `_next/image`, `favicon.ico`, and `auth/callback`.

`/account/change-password` is **not** covered by any of the above restrictions — it is reachable by every authenticated role (OPERATOR included).

## 10. Access Control Summary

| Area | SUPER_ADMIN | ADMIN | MANAGER | OPERATOR |
|---|---|---|---|---|
| `/settings/users` (page + actions) | Blocked (route-level: middleware allows only if impersonating; action-level: `requireAdminSession` rejects role !== ADMIN even while impersonating) | Allowed | Blocked by middleware | Blocked by middleware |
| `/account/change-password` | Allowed | Allowed | Allowed | Allowed |
| `/login`, `/auth/*` | Allowed (unauthenticated) | Allowed | Allowed | Allowed |

## 11. Edge Cases (as coded)

- An inactive user attempting to log in gets a different error (`"Inactive user"`) than a wrong-password attempt (`"Invalid email or password"`), which reveals account existence.
- A user deactivated mid-session is logged out effectively immediately, because `getAuthSession()` re-checks `isActive` against the DB on every call, not just at login.
- Role strings passed to `createUser` are upper-cased before validation; `updateUserRole`'s call sites in the UI always pass an already-correct-case literal, so the normalization path is not exercised by the UI today.
- `changePassword` succeeding does not invalidate the user's existing JWT on other devices/browsers.
- Visiting `/` never checks for an existing valid session — an already-logged-in user hitting `/` is still sent to `/login`.

## 12. Known Issues / Unused Code

- **Two disconnected identity systems.** The Prisma `User` + JWT/bcrypt system (used for the actual app session) and Supabase Auth (used only for forgot/reset-password) are not linked in code — no file syncs a Supabase Auth password change back into `User.password`. Whether the reset-password flow actually results in a working `loginUser()` login could not be determined from the code alone.
- **`SUPER_ADMIN` cannot manage users via `/settings/users`.** `requireAdminSession()` requires `role === "ADMIN"` exactly; a SUPER_ADMIN impersonating a company still carries `role: "SUPER_ADMIN"` on their session and is rejected with `"Forbidden"`.
- **Hardcoded default password `"Welcome123!"`** for every newly created staff user, printed verbatim in the invite dialog's own copy. No forced-password-change-on-first-login flow exists.
- **No admin-initiated password reset** for other users — only self-service change is implemented.
- **`auth_token` cookie has no `maxAge`/`expires`** — only the JWT's own `exp` claim (7 days) bounds it.
- **`CompanyMembership` model and `CompanyRole` enum are unused** by any application code (schema-only).
- **`GlobalRole` enum is unused** by any application code (schema-only); all role checks use `UserRole` on `User.role`.
- **No `AuditLog` rows are written** for login, user creation, role changes, or password changes, despite an `AuditLog` model existing in the schema.
- **Two nearly-identical auth layout files** (`app/(auth)/layout.tsx` and `app/auth/layout.tsx`) exist for two separate route groups.
- **No rate limiting / lockout** on login or password-reset requests.

## 13. Source Files

`proxy.ts`, `lib/auth.ts`, `lib/edge-auth.ts`, `lib/supabase/{admin,client,server}.ts`, `actions/{auth,account,users}.ts`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/auth/{layout.tsx,callback/route.ts,forgot-password/page.tsx,reset-password/page.tsx,logout/route.ts}`, `app/(dashboard)/account/change-password/{page.tsx,change-password-form.tsx}`, `app/(dashboard)/settings/users/page.tsx`, `app/(dashboard)/layout.tsx`, `components/auth/login-form.tsx`, `components/users/{invite-user-dialog.tsx,user-list-table.tsx}`, `components/user-menu.tsx`, `app/page.tsx`, `prisma/schema.prisma`.
