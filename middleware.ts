// Next.js 15.x only picks up `middleware.ts` (exporting `middleware` or a
// default function). The `proxy.ts` convention exists only from Next 16, so on
// the pinned 15.x runtime `proxy.ts` is never executed on its own. This shim
// wires the gating logic in `proxy.ts` up as middleware.
//
// When upgrading to Next 16+, delete this file — Next 16 errors if both
// `middleware.ts` and `proxy.ts` exist.
//
// `config` must be a literal declared in this file: Next statically analyzes
// it and ignores a re-exported `config` (falling back to matching every path).
// Keep this matcher in sync with the one in `proxy.ts`.
export { proxy as middleware } from "./proxy";

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|auth/callback).*)",
  ],
};
