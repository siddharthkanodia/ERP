import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ChartCardProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function ChartCard({
  title,
  action,
  children,
  className,
  contentClassName,
}: ChartCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action ? <div className="flex items-center gap-1">{action}</div> : null}
      </header>
      <div className={cn("min-w-0 flex-1 px-4 py-4", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
