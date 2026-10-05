import * as React from "react";

import { cn } from "@/lib/utils";

interface ResponsiveDataCardsProps<TItem> {
  className?: string;
  emptyState?: React.ReactNode;
  getKey: (item: TItem, index: number) => React.Key;
  itemClassName?: string;
  items: TItem[];
  renderCard: (item: TItem, index: number) => React.ReactNode;
  scrollerClassName?: string;
}

const DEFAULT_ITEM_CLASSNAME =
  "min-w-[86%] snap-start sm:min-w-[72%] lg:min-w-[56%]";

export function ResponsiveDataCards<TItem>({
  className,
  emptyState = null,
  getKey,
  itemClassName,
  items,
  renderCard,
  scrollerClassName,
}: ResponsiveDataCardsProps<TItem>) {
  if (items.length === 0) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={className}>
      <div
        className={cn(
          "-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1",
          scrollerClassName
        )}
      >
        {items.map((item, index) => (
          <div
            key={getKey(item, index)}
            className={cn(DEFAULT_ITEM_CLASSNAME, itemClassName)}
          >
            {renderCard(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
