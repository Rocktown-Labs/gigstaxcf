export function BulkDraftSkeleton({
  label,
}: {
  label: "Queued" | "Processing";
}) {
  return (
    <div className="border-border/50 bg-background/40 space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div className="bg-muted/70 h-4 w-36 animate-pulse rounded" />
        <span className="text-primary text-xs font-semibold tracking-wide uppercase">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-muted/60 h-10 animate-pulse rounded" />
        <div className="bg-muted/60 h-10 animate-pulse rounded" />
        <div className="bg-muted/60 h-10 animate-pulse rounded" />
      </div>
      <div className="bg-muted/60 h-20 animate-pulse rounded" />
    </div>
  );
}
