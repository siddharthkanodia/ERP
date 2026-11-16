import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export function Spinner({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground",
        className
      )}
    >
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span>{label ?? "Loading..."}</span>
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("overflow-hidden rounded-xl border bg-card", className)}
    >
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

type PageSkeletonVariant = "table" | "cards" | "form" | "dashboard";

export function PageSkeleton({
  variant = "table",
  maxWidth = "max-w-6xl",
  rows,
  columns,
}: {
  variant?: PageSkeletonVariant;
  maxWidth?: string;
  rows?: number;
  columns?: number;
}) {
  return (
    <section
      className={cn("mx-auto w-full px-4 py-6 sm:px-6", maxWidth)}
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        {variant !== "form" && <Skeleton className="h-9 w-32" />}
      </header>

      {variant === "table" && <TableSkeleton rows={rows} columns={columns} />}

      {variant === "cards" && <CardGridSkeleton count={rows ?? 3} />}

      {variant === "dashboard" && (
        <div className="space-y-6">
          <CardGridSkeleton count={5} className="grid-cols-2 lg:grid-cols-5" />
          <TableSkeleton rows={rows ?? 5} columns={columns ?? 4} />
        </div>
      )}

      {variant === "form" && (
        <div className="max-w-2xl space-y-5 rounded-xl border bg-card p-6">
          {Array.from({ length: rows ?? 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-28" />
        </div>
      )}
    </section>
  );
}
