import { NextResponse, type NextRequest } from "next/server";

import { verifyTokenEdge } from "@/lib/edge-auth";

function toLoginRedirect(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

function toDashboardRedirect(request: NextRequest) {
  const dashboardUrl = request.nextUrl.clone();
  dashboardUrl.pathname = "/dashboard";
  dashboardUrl.search = "";
  return NextResponse.redirect(dashboardUrl);
}

function toSuperAdminDashboardRedirect(request: NextRequest) {
  const superAdminUrl = request.nextUrl.clone();
  superAdminUrl.pathname = "/super-admin/dashboard";
  superAdminUrl.search = "";
  return NextResponse.redirect(superAdminUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    // Supabase-backed password reset flow — reached while logged out of the app.
    pathname === "/auth/forgot-password" ||
    pathname === "/auth/reset-password" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return toLoginRedirect(request);
  }

  const decoded = await verifyTokenEdge(token);
  if (!decoded) {
    return toLoginRedirect(request);
  }

  const role = typeof decoded === "object" && decoded ? decoded.role : null;
  const impersonatedCompanyId =
    typeof decoded === "object" &&
    decoded &&
    typeof decoded.impersonatedCompanyId === "string"
      ? decoded.impersonatedCompanyId
      : null;

  const isSuperAdmin = typeof role === "string" && role === "SUPER_ADMIN";
  const isAdmin = typeof role === "string" && role === "ADMIN";
  const isManager = typeof role === "string" && role === "MANAGER";
  const isOperator = typeof role === "string" && role === "OPERATOR";
  const isSuperAdminRoute =
    pathname === "/super-admin" || pathname.startsWith("/super-admin/");

  if (isSuperAdminRoute && !isSuperAdmin) {
    return toDashboardRedirect(request);
  }

  // SUPER_ADMIN access rules
  if (isSuperAdmin) {
    if (isSuperAdminRoute) {
      return NextResponse.next();
    }

    if (!impersonatedCompanyId) {
      return toSuperAdminDashboardRedirect(request);
    }

    return NextResponse.next();
  }

  // ADMIN has unrestricted company access
  if (isAdmin) {
    return NextResponse.next();
  }

  const isReportsRoute = pathname === "/reports" || pathname.startsWith("/reports/");
  const isAttendanceRoute =
    pathname === "/attendance" || pathname.startsWith("/attendance/");
  const isEmployeesRoute = pathname === "/employees" || pathname.startsWith("/employees/");
  const isFinishedGoodsRoute =
    pathname === "/finished-products" || pathname.startsWith("/finished-products/");
  const isWasteRoute =
    pathname === "/finished-products/waste" ||
    pathname.startsWith("/finished-products/waste/");
  const isSettingsRoute = pathname === "/settings" || pathname.startsWith("/settings/");

  // Existing MANAGER/OPERATOR restrictions
  if (isOperator) {
    if (
      isReportsRoute ||
      isAttendanceRoute ||
      isEmployeesRoute ||
      isFinishedGoodsRoute ||
      isWasteRoute ||
      isSettingsRoute
    ) {
      return toDashboardRedirect(request);
    }
  }

  if (isManager) {
    if (isReportsRoute || isSettingsRoute) {
      return toDashboardRedirect(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|auth/callback).*)",
  ],
};
