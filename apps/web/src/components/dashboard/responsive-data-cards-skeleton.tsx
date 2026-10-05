import { cn } from "@/lib/utils";

interface ResponsiveDataCardsSkeletonProps {
  cardClassName?: string;
  cards?: number;
  className?: string;
  itemClassName?: string;
}

const DEFAULT_ITEM_CLASSNAME =
  "min-w-[86%] snap-start sm:min-w-[72%] lg:min-w-[56%]";

export function ResponsiveDataCardsSkeleton({
  cardClassName,
  cards = 3,
  className,
  itemClassName,
}: ResponsiveDataCardsSkeletonProps) {
  return (
    <div className={className}>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {Array.from({ length: cards }, (_value, index) => (
          <div
            key={index}
            className={cn(DEFAULT_ITEM_CLASSNAME, itemClassName)}
            aria-hidden
          >
            <div
              className={cn(
                "border-border/50 bg-card rounded-2xl border p-4 shadow-sm",
                cardClassName
              )}
            >
              <div className="bg-muted/60 mb-3 h-4 w-24 animate-pulse rounded" />
              <div className="bg-muted/60 mb-2 h-6 w-40 animate-pulse rounded" />
              <div className="bg-muted/60 mb-1 h-4 w-32 animate-pulse rounded" />
              <div className="bg-muted/60 h-4 w-24 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
