interface DbErrorLike {
  cause?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  query?: string;
}

export const isMissingColumnError = (
  error: unknown,
  columnName: string
): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as DbErrorLike;
  const code = candidate.code ?? candidate.cause?.code;

  if (code !== "42703") {
    return false;
  }

  const haystack = [
    candidate.message,
    candidate.query,
    candidate.cause?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(columnName.toLowerCase());
};
