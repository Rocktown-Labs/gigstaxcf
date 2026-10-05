import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

interface DashboardPaginationControlsProps {
  className?: string;
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}

type PageToken = number | "ellipsis";

const getVisiblePageTokens = (
  page: number,
  totalPages: number
): PageToken[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_value, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages];
};

export function DashboardPaginationControls({
  className,
  onPageChange,
  page,
  totalPages,
}: DashboardPaginationControlsProps) {
  if (totalPages <= 1) {
    return null;
  }

  const goToPage = (targetPage: number) => {
    if (targetPage < 1 || targetPage > totalPages || targetPage === page) {
      return;
    }

    onPageChange(targetPage);
  };

  const desktopTokens = getVisiblePageTokens(page, totalPages);
  const previousDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className={cn("space-y-2", className)}>
      <Pagination className="hidden md:flex">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              className={cn(
                previousDisabled ? "pointer-events-none opacity-40" : ""
              )}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                goToPage(page - 1);
              }}
            />
          </PaginationItem>

          {desktopTokens.map((token, index) => {
            if (token === "ellipsis") {
              return (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }

            return (
              <PaginationItem key={token}>
                <PaginationLink
                  href="#"
                  isActive={token === page}
                  onClick={(event) => {
                    event.preventDefault();
                    goToPage(token);
                  }}
                >
                  {token}
                </PaginationLink>
              </PaginationItem>
            );
          })}

          <PaginationItem>
            <PaginationNext
              className={cn(
                nextDisabled ? "pointer-events-none opacity-40" : ""
              )}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                goToPage(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <Pagination className="md:hidden">
        <PaginationContent className="w-full justify-between">
          <PaginationItem>
            <PaginationPrevious
              className={cn(
                previousDisabled ? "pointer-events-none opacity-40" : ""
              )}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                goToPage(page - 1);
              }}
            />
          </PaginationItem>

          <PaginationItem>
            <span className="text-muted-foreground text-sm font-medium">
              Page {page} of {totalPages}
            </span>
          </PaginationItem>

          <PaginationItem>
            <PaginationNext
              className={cn(
                nextDisabled ? "pointer-events-none opacity-40" : ""
              )}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                goToPage(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
