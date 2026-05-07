"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { comparePassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function loginUser(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (!user.isActive) {
    throw new Error("Inactive user");
  }

  const passwordMatches = await comparePassword(password, user.password);
  if (!passwordMatches) {
    throw new Error("Invalid email or password");
  }

  const token = await signToken({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
  });

  const cookieStore = await cookies();
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (user.role === "SUPER_ADMIN") {
    redirect("/super-admin/dashboard");
  }

  redirect("/dashboard");
}
