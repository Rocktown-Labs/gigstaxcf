import { HTTPException } from "hono/http-exception";

import { getAppSession } from "@/lib/auth";
import type { AppSession } from "@/lib/auth";
import { getAuth } from "@/services";

export type { AppSession };

/** Session for the current request, or null when unauthenticated. */
export async function getSession(headers: Headers) {
  return getAppSession(await getAuth(), headers);
}

/** Authenticated session or throw 401. */
export async function requireSession(headers: Headers): Promise<AppSession> {
  const session = await getSession(headers);
  if (!session) {
    throw new HTTPException(401, {
      message: "Not authenticated",
    });
  }
  return session;
}

/** Admin session or throw 401/403. */
export async function requireAdmin(headers: Headers): Promise<AppSession> {
  const session = await requireSession(headers);
  if (session.role !== "admin") {
    throw new HTTPException(403, {
      message: "Admin access required",
    });
  }
  return session;
}

/** Positive-integer path parameter or throw 400. */
export function requireIdParam(value: string): number {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new HTTPException(400, {
      message: "Invalid id parameter",
    });
  }
  return id;
}
