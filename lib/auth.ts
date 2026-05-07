import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: {
  userId: string;
  role: string;
  companyId?: string | null;
  impersonatedCompanyId?: string | null;
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function getAuthSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const payloadUserId =
    typeof payload.userId === "string" ? payload.userId : null;
  const payloadCompanyId =
    typeof payload.companyId === "string" ? payload.companyId : null;
  const payloadImpersonatedCompanyId =
    typeof payload.impersonatedCompanyId === "string"
      ? payload.impersonatedCompanyId
      : null;

  if (!payloadUserId) return null;

  const user = await prisma.user.findUnique({
    where: { id: payloadUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) return null;

  return {
    ...user,
    companyId: payloadCompanyId ?? user.companyId,
    impersonatedCompanyId: payloadImpersonatedCompanyId,
  };
}
