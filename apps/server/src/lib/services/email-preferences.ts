import { emailPreferences } from "@gigstaxcf/db/schema";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";

export interface EmailPreferencesRecord {
  cadenceSummaryEnabled: boolean;
  goalCelebrationEnabled: boolean;
  inactivityNudgeEnabled: boolean;
  onboardingOfferEnabled: boolean;
  onboardingTipsEnabled: boolean;
  quarterlyTaxReminderEnabled: boolean;
  tipReminderEnabled: boolean;
  tripVerificationReminderEnabled: boolean;
  updatedAt: string;
  userId: number;
}

function toEmailPreferencesRecord(
  value: typeof emailPreferences.$inferSelect
): EmailPreferencesRecord {
  return {
    cadenceSummaryEnabled: value.cadenceSummaryEnabled,
    goalCelebrationEnabled: value.goalCelebrationEnabled,
    inactivityNudgeEnabled: value.inactivityNudgeEnabled,
    onboardingOfferEnabled: value.onboardingOfferEnabled,
    onboardingTipsEnabled: value.onboardingTipsEnabled,
    quarterlyTaxReminderEnabled: value.quarterlyTaxReminderEnabled,
    tipReminderEnabled: value.tipReminderEnabled,
    tripVerificationReminderEnabled: value.tripVerificationReminderEnabled,
    updatedAt: value.updatedAt.toISOString(),
    userId: value.userId,
  };
}

export async function getOrCreateEmailPreferences(userId: number) {
  const [existing] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);

  if (existing) {
    return toEmailPreferencesRecord(existing);
  }

  const [created] = await db
    .insert(emailPreferences)
    .values({
      updatedAt: new Date(),
      userId,
    })
    .onConflictDoNothing({ target: emailPreferences.userId })
    .returning();

  if (created) {
    return toEmailPreferencesRecord(created);
  }

  const [resolved] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);

  if (!resolved) {
    throw new Error("Failed to load email preferences");
  }

  return toEmailPreferencesRecord(resolved);
}

export async function updateEmailPreferencesForUser(args: {
  patch: {
    cadenceSummaryEnabled?: boolean;
    goalCelebrationEnabled?: boolean;
    inactivityNudgeEnabled?: boolean;
    onboardingOfferEnabled?: boolean;
    onboardingTipsEnabled?: boolean;
    quarterlyTaxReminderEnabled?: boolean;
    tipReminderEnabled?: boolean;
    tripVerificationReminderEnabled?: boolean;
  };
  userId: number;
}) {
  const existing = await getOrCreateEmailPreferences(args.userId);
  const now = new Date();

  const [updated] = await db
    .update(emailPreferences)
    .set({
      cadenceSummaryEnabled:
        args.patch.cadenceSummaryEnabled ?? existing.cadenceSummaryEnabled,
      goalCelebrationEnabled:
        args.patch.goalCelebrationEnabled ?? existing.goalCelebrationEnabled,
      inactivityNudgeEnabled:
        args.patch.inactivityNudgeEnabled ?? existing.inactivityNudgeEnabled,
      onboardingOfferEnabled:
        args.patch.onboardingOfferEnabled ?? existing.onboardingOfferEnabled,
      onboardingTipsEnabled:
        args.patch.onboardingTipsEnabled ?? existing.onboardingTipsEnabled,
      quarterlyTaxReminderEnabled:
        args.patch.quarterlyTaxReminderEnabled ??
        existing.quarterlyTaxReminderEnabled,
      tipReminderEnabled:
        args.patch.tipReminderEnabled ?? existing.tipReminderEnabled,
      tripVerificationReminderEnabled:
        args.patch.tripVerificationReminderEnabled ??
        existing.tripVerificationReminderEnabled,
      updatedAt: now,
    })
    .where(eq(emailPreferences.userId, args.userId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update email preferences");
  }

  return toEmailPreferencesRecord(updated);
}
