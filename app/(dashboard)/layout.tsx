import { Toaster } from "sonner";

import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="h-full shrink-0 overflow-y-auto">
        <Sidebar />
      </div>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
