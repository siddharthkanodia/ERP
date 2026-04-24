"use server";

import { createClient } from "@supabase/supabase-js";

import { getAuthSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { success: false, error: "Supabase is not configured." };
  }

  // Verify current password using an isolated client so the active session
  // cookies are never overwritten. `persistSession: false` ensures no tokens
  // are stored in cookies or local storage.
  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: session.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { success: false, error: "Current password is incorrect" };
  }

  try {
    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(
      session.supabaseUserId,
      { password: newPassword }
    );
    if (updateError) {
      return { success: false, error: updateError.message };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update password.";
    return { success: false, error: message };
  }

  return { success: true };
}
