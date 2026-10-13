const BASE_URL = import.meta.env.VITE_SERVER_URL ?? "";

/** Absolute URL for an API path (server-injected origin + path). */
export function apiUrl(path: string) {
  return `${BASE_URL}${path}`;
}

/**
 * fetch() wrapper for the Hono API: absolute server URL + credentialed
 * cookies (better-auth session lives on the API origin).
 */
export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
}

export async function apiJson<T>(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  return (await response.json()) as T;
}

export class ApiError extends Error {
  readonly name = "ApiError";
  readonly status: number;

  constructor(status: number, body: string) {
    super(`API request failed (${status}): ${body}`);
    this.status = status;
  }
}
