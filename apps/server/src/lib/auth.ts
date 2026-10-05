import { users } from "@gigstaxcf/db/schema";
import { and, eq } from "drizzle-orm";

import { isAdminEmail } from "@/lib/auth/admin-emails";
import { db } from "@/lib/db";
import { sendWelcomeEmailWorkflow } from "@/lib/workflows/send-welcome-email";
import type { AuthInstance } from "@/services";

export type WeekStartsOn = "sunday" | "monday";
export type AppUserRole = "admin" | "driver";

export interface AppSession {
  authUserId: string;
  email: string;
  isOnboarded: boolean;
  name: string;
  role: AppUserRole;
  timezone: string;
  userId: number;
  weekStartsOn: WeekStartsOn;
}

export type Session = AppSession;

interface AuthUserInfo {
  email: string;
  id: string;
  name: string;
}

const normalizeRole = (value: string | null | undefined): AppUserRole =>
  value === "admin" ? "admin" : "driver";

async function ensureAppUserForAuthUser(authUser: AuthUserInfo) {
  const resolvedRole: AppUserRole = isAdminEmail(authUser.email)
    ? "admin"
    : "driver";

  const [existing] = await db
    .select({
      email: users.email,
      id: users.id,
      isOnboarded: users.isOnboarded,
      name: users.name,
      role: users.role,
      timezone: users.timezone,
      weekStartsOn: users.weekStartsOn,
    })
    .from(users)
    .where(eq(users.authUserId, authUser.id))
    .limit(1);

  if (existing) {
    const existingRole = normalizeRole(existing.role);

    if (
      existing.email !== authUser.email ||
      existing.name !== authUser.name ||
      existingRole !== resolvedRole
    ) {
      await db
        .update(users)
        .set({
          email: authUser.email,
          name: authUser.name,
          role: resolvedRole,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
    }

    return {
      created: false as const,
      user: {
        ...existing,
        email: authUser.email,
        name: authUser.name,
        role: existingRole,
      },
    };
  }

  const now = new Date();
  const [created] = await db
    .insert(users)
    .values({
      authUserId: authUser.id,
      email: authUser.email,
      isOnboarded: false,
      name: authUser.name,
      role: resolvedRole,
      timezone: "UTC",
      updatedAt: now,
      weekStartsOn: "sunday",
    })
    .onConflictDoUpdate({
      set: {
        email: authUser.email,
        name: authUser.name,
        role: resolvedRole,
        updatedAt: now,
      },
      target: users.authUserId,
    })
    .returning({
      email: users.email,
      id: users.id,
      isOnboarded: users.isOnboarded,
      name: users.name,
      role: users.role,
      timezone: users.timezone,
      weekStartsOn: users.weekStartsOn,
    });

  if (!created) {
    throw new Error("Failed to upsert app user");
  }

  const [newlyCreatedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, created.id),
        eq(users.authUserId, authUser.id),
        eq(users.isOnboarded, false)
      )
    )
    .limit(1);

  if (newlyCreatedUser) {
    // Ported from `start(sendWelcomeEmailWorkflow, ...)` — the Vercel
    // workflow engine is replaced by direct invocation; failures must not
    // break the session request.
    void sendWelcomeEmailWorkflow({
      appUserId: created.id,
      email: created.email,
      name: created.name,
    }).catch((error) => {
      console.error("welcome_email_failed", error);
    });
  }

  return {
    created: true as const,
    user: {
      ...created,
      role: normalizeRole(created.role),
    },
  };
}

/** Resolve the app session from an incoming request's headers. */
export async function getAppSession(
  auth: AuthInstance,
  headersInit: Headers
): Promise<AppSession | null> {
  const betterSession = await auth.api.getSession({ headers: headersInit });

  if (!betterSession?.user?.id || !betterSession.user.email) {
    return null;
  }

  const { user } = await ensureAppUserForAuthUser({
    email: betterSession.user.email,
    id: betterSession.user.id,
    name: betterSession.user.name || "GigStax User",
  });

  return {
    authUserId: betterSession.user.id,
    email: user.email,
    isOnboarded: user.isOnboarded,
    name: user.name,
    role: user.role,
    timezone: user.timezone,
    userId: user.id,
    weekStartsOn: user.weekStartsOn,
  };
}
