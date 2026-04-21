import { CompanyRole, GlobalRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createServerClient } from "@/lib/supabase/server";

export type AuthSession = {
  userId: string;
  supabaseUserId: string;
  email: string;
  globalRole: GlobalRole;
  companyId: string | null;
  companyRole: CompanyRole | null;
};

export async function getAuthSession(): Promise<AuthSession | null> {
  const supabase = await createServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  const dbUser = await prisma.user.findUnique({
    where: { supabaseUserId: supabaseUser.id },
  });
  if (!dbUser) return null;

  const membership = await prisma.companyMembership.findFirst({
    where: { userId: dbUser.id },
    orderBy: { createdAt: "asc" },
  });

  if (dbUser.globalRole === GlobalRole.USER && !membership) {
    return null;
  }

  return {
    userId: dbUser.id,
    supabaseUserId: dbUser.supabaseUserId,
    email: dbUser.email ?? supabaseUser.email ?? "",
    globalRole: dbUser.globalRole,
    companyId: membership?.companyId ?? null,
    companyRole: membership?.role ?? null,
  };
}
