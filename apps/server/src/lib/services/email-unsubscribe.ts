import { siteUrl } from "@/lib/seo";
import { serverEnv } from "@/lib/server-env";
import { updateEmailPreferencesForUser } from "@/lib/services/email-preferences";
import { upsertEmailSuppression } from "@/lib/services/email-suppressions";

export type LifecycleUnsubscribeCategory =
  | "cadence_summary"
  | "tip_reminder"
  | "trip_verification_reminder"
  | "inactivity_nudge"
  | "abandoned_onboarding_offer"
  | "onboarding_tips"
  | "weekly_goal_celebration"
  | "quarterly_tax_reminder"
  | "all_lifecycle";

interface UnsubscribeTokenPayload {
  category: LifecycleUnsubscribeCategory;
  email: string;
  exp: number;
  userId: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSecret() {
  const secret = serverEnv.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not configured");
  }

  return secret;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(input: string) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const withPadding = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }

  return bytes;
}

function stringToBase64Url(input: string) {
  return bytesToBase64Url(encoder.encode(input));
}

function base64UrlToString(input: string) {
  return decoder.decode(base64UrlToBytes(input));
}

async function createSignature(payloadBase64Url: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadBase64Url)
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let delta = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftCodePoint = left.codePointAt(index) ?? -1;
    const rightCodePoint = right.codePointAt(index) ?? -1;
    delta += Math.abs(leftCodePoint - rightCodePoint);
  }

  return delta === 0;
}

export async function createUnsubscribeToken(args: {
  category: LifecycleUnsubscribeCategory;
  email: string;
  expiresInDays?: number;
  userId: number;
}) {
  const expiresInDays = Math.max(1, Math.floor(args.expiresInDays || 30));
  const payload: UnsubscribeTokenPayload = {
    category: args.category,
    email: args.email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60,
    userId: args.userId,
  };

  const encodedPayload = stringToBase64Url(JSON.stringify(payload));
  const signature = await createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyUnsubscribeToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await createSignature(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlToString(encodedPayload)
    ) as UnsubscribeTokenPayload;
    if (!payload.userId || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (
      payload.category !== "cadence_summary" &&
      payload.category !== "tip_reminder" &&
      payload.category !== "trip_verification_reminder" &&
      payload.category !== "inactivity_nudge" &&
      payload.category !== "abandoned_onboarding_offer" &&
      payload.category !== "onboarding_tips" &&
      payload.category !== "weekly_goal_celebration" &&
      payload.category !== "quarterly_tax_reminder" &&
      payload.category !== "all_lifecycle"
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function buildLifecycleUnsubscribeUrl(token: string) {
  return `${siteUrl}/u/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function applyLifecycleUnsubscribeToken(token: string) {
  const payload = await verifyUnsubscribeToken(token);
  if (!payload) {
    return null;
  }

  if (payload.category === "all_lifecycle") {
    await Promise.all([
      updateEmailPreferencesForUser({
        patch: {
          cadenceSummaryEnabled: false,
          goalCelebrationEnabled: false,
          inactivityNudgeEnabled: false,
          onboardingOfferEnabled: false,
          onboardingTipsEnabled: false,
          quarterlyTaxReminderEnabled: false,
          tipReminderEnabled: false,
          tripVerificationReminderEnabled: false,
        },
        userId: payload.userId,
      }),
      upsertEmailSuppression({
        email: payload.email,
        metadata: {
          category: payload.category,
          userId: payload.userId,
        },
        reason: "unsubscribe",
        source: "unsubscribe_link",
      }),
    ]);
  } else if (payload.category === "cadence_summary") {
    await updateEmailPreferencesForUser({
      patch: { cadenceSummaryEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "tip_reminder") {
    await updateEmailPreferencesForUser({
      patch: { tipReminderEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "trip_verification_reminder") {
    await updateEmailPreferencesForUser({
      patch: { tripVerificationReminderEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "inactivity_nudge") {
    await updateEmailPreferencesForUser({
      patch: { inactivityNudgeEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "abandoned_onboarding_offer") {
    await updateEmailPreferencesForUser({
      patch: { onboardingOfferEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "onboarding_tips") {
    await updateEmailPreferencesForUser({
      patch: { onboardingTipsEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "weekly_goal_celebration") {
    await updateEmailPreferencesForUser({
      patch: { goalCelebrationEnabled: false },
      userId: payload.userId,
    });
  } else if (payload.category === "quarterly_tax_reminder") {
    await updateEmailPreferencesForUser({
      patch: { quarterlyTaxReminderEnabled: false },
      userId: payload.userId,
    });
  }

  return payload;
}
