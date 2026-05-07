"use server";

import { comparePassword, getAuthSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type ChangePasswordResult = { success: true } | { success: false; error: string };

export async function changePassword(
  input: ChangePasswordInput
): Promise<ChangePasswordResult> {
  const session = await getAuthSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const currentPassword = input.currentPassword ?? "";
  const newPassword = input.newPassword ?? "";

  if (!currentPassword) {
    return { success: false, error: "Current password is required." };
  }
  if (newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters." };
  }
  if (currentPassword === newPassword) {
    return {
      success: false,
      error: "New password must be different from current password.",
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { password: true },
  });
  if (!dbUser) {
    return { success: false, error: "Unauthorized" };
  }

  const passwordMatches = await comparePassword(currentPassword, dbUser.password);
  if (!passwordMatches) {
    return { success: false, error: "Current password is incorrect" };
  }

  try {
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: session.id },
      data: { password: hashedPassword },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update password.";
    return { success: false, error: message };
  }

  return { success: true };
}
