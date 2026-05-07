import { jwtVerify, type JWTPayload } from "jose";

type EdgeTokenPayload = JWTPayload & {
  userId?: string;
  role?: string;
  companyId?: string | null;
  impersonatedCompanyId?: string | null;
};

export async function verifyTokenEdge(token: string): Promise<EdgeTokenPayload | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as EdgeTokenPayload;
  } catch {
    return null;
  }
}
