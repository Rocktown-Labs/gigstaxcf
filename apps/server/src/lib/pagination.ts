export interface ParsedPagination {
  page: number;
  pageSize: number;
}

interface ParsePaginationParams {
  defaultPageSize: number;
  maxPageSize: number;
  pageParam: string | null;
  pageSizeParam: string | null;
}

interface ParsePaginationError {
  error: string;
}

interface ParsePaginationSuccess {
  pagination: ParsedPagination;
}

const toInteger = (value: string | null) => {
  if (!value) {
    return null;
  }

  if (!/^\d+$/u.test(value)) {
    return Number.NaN;
  }

  return Number.parseInt(value, 10);
};

export const getPaginationErrorMessage = (field: "page" | "pageSize") =>
  `Invalid ${field} query param`;

export function parsePaginationParams(
  args: ParsePaginationParams
): ParsePaginationError | ParsePaginationSuccess {
  const pageRaw = toInteger(args.pageParam);
  const pageSizeRaw = toInteger(args.pageSizeParam);

  if (pageRaw !== null && (!Number.isFinite(pageRaw) || pageRaw < 1)) {
    return { error: getPaginationErrorMessage("page") };
  }

  if (
    pageSizeRaw !== null &&
    (!Number.isFinite(pageSizeRaw) || pageSizeRaw < 1)
  ) {
    return { error: getPaginationErrorMessage("pageSize") };
  }

  const page = pageRaw ?? 1;
  const pageSize = Math.min(
    pageSizeRaw ?? args.defaultPageSize,
    args.maxPageSize
  );

  return {
    pagination: {
      page,
      pageSize,
    },
  };
}

export interface PaginationState {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function buildPaginationState(args: {
  page: number;
  pageSize: number;
  totalItems: number;
}): PaginationState {
  const totalItems = Math.max(0, args.totalItems);
  const totalPages = Math.max(1, Math.ceil(totalItems / args.pageSize));
  const page = Math.min(Math.max(1, args.page), totalPages);

  return {
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    page,
    pageSize: args.pageSize,
    totalItems,
    totalPages,
  };
}
