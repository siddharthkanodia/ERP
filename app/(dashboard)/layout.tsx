import { Toaster } from "sonner";
import { Menu } from "lucide-react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden h-full shrink-0 overflow-y-auto md:block">
        <Sidebar />
      </div>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between border-b bg-zinc-50 px-3 py-2 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60">
              <Sidebar />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold tracking-tight">SME ERP</span>
          <div className="w-8" />
        </header>
        {children}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
