import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyLifecycleUnsubscribeToken,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/services/email-unsubscribe";

const { updateEmailPreferencesForUser, upsertEmailSuppression } = vi.hoisted(
  () => ({
    updateEmailPreferencesForUser: vi.fn(),
    upsertEmailSuppression: vi.fn(),
  })
);

vi.mock("@/lib/services/email-preferences", () => ({
  updateEmailPreferencesForUser,
}));

vi.mock("@/lib/services/email-suppressions", () => ({
  upsertEmailSuppression,
}));

describe("email unsubscribe tokens", () => {
  beforeEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
    updateEmailPreferencesForUser.mockReset();
    upsertEmailSuppression.mockReset();
  });

  it("creates and verifies a valid token", async () => {
    const token = await createUnsubscribeToken({
      category: "tip_reminder",
      email: "driver@example.com",
      userId: 42,
    });

    const payload = await verifyUnsubscribeToken(token);
    expect(payload).toBeTruthy();
    expect(payload?.category).toBe("tip_reminder");
    expect(payload?.email).toBe("driver@example.com");
    expect(payload?.userId).toBe(42);
  });

  it("returns null for invalid token", async () => {
    const payload = await verifyUnsubscribeToken("invalid.token.value");
    expect(payload).toBeNull();
  });

  it("applies category-specific unsubscribe without suppression entry", async () => {
    const token = await createUnsubscribeToken({
      category: "cadence_summary",
      email: "driver@example.com",
      userId: 7,
    });

    await applyLifecycleUnsubscribeToken(token);
    expect(updateEmailPreferencesForUser).toHaveBeenCalledWith({
      patch: { cadenceSummaryEnabled: false },
      userId: 7,
    });
    expect(upsertEmailSuppression).not.toHaveBeenCalled();
  });

  it("applies all-lifecycle unsubscribe and records suppression", async () => {
    const token = await createUnsubscribeToken({
      category: "all_lifecycle",
      email: "driver@example.com",
      userId: 9,
    });

    await applyLifecycleUnsubscribeToken(token);
    expect(updateEmailPreferencesForUser).toHaveBeenCalledWith({
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
      userId: 9,
    });
    expect(upsertEmailSuppression).toHaveBeenCalledTimes(1);
  });

  it("applies onboarding-offer unsubscribe", async () => {
    const token = await createUnsubscribeToken({
      category: "abandoned_onboarding_offer",
      email: "driver@example.com",
      userId: 12,
    });

    await applyLifecycleUnsubscribeToken(token);
    expect(updateEmailPreferencesForUser).toHaveBeenCalledWith({
      patch: { onboardingOfferEnabled: false },
      userId: 12,
    });
  });
});
