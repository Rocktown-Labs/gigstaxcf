import { serverEnv } from "@/lib/server-env";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function getAdminEmailAllowlist() {
  return new Set(
    (serverEnv.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter((value) => value.length > 0)
  );
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  return getAdminEmailAllowlist().has(normalized);
}
