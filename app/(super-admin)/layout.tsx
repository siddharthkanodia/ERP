import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { getAuthSession } from "@/lib/auth";
import { SuperAdminSidebar } from "@/components/super-admin/sidebar";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <SuperAdminSidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
