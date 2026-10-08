import { describe, expect, it } from "vitest";

import {
  AbandonedOnboardingOfferEmail,
  CadenceSummaryEmail,
  InactivityNudgeEmail,
  OnboardingTipsEmail,
  QuarterlyTaxReminderEmail,
  ResetPasswordEmail,
  SubscriptionStatusEmail,
  WelcomeEmail,
  WeeklyGoalCelebrationEmail,
} from "@/emails";
import { renderEmailTemplate } from "@/emails/render-email";

describe("email template rendering", () => {
  it("renders welcome email html and text", async () => {
    const rendered = await renderEmailTemplate(
      WelcomeEmail({
        dashboardHref: "https://gigstax.com/dashboard",
        name: "Taylor",
      })
    );

    expect(rendered.html).toContain("Welcome to GigStax");
    expect(rendered.html).toContain("Taylor");
    expect(rendered.html).toContain("Account ready");
    expect(rendered.html).toContain("icon-dark-32x32.png");
    expect(rendered.text).toContain("Open Dashboard");
  });

  it("renders cadence summary totals", async () => {
    const rendered = await renderEmailTemplate(
      CadenceSummaryEmail({
        bestDayGross: "$120.00",
        bestDayLabel: "Friday, February 27, 2026",
        cadenceLabel: "Weekly",
        dashboardHref: "https://gigstax.com/dashboard/stubs",
        expenses: "$25.00",
        gross: "$300.00",
        managePreferencesHref: "https://gigstax.com/dashboard/settings",
        net: "$275.00",
        periodEnd: "2026-02-28",
        periodStart: "2026-02-22",
        topPlatform: "Uber Eats",
        unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=test",
        ytdNet: "$1,275.00",
      })
    );

    expect(rendered.html).toContain("Cadence Summary");
    expect(rendered.html).toContain("$300.00");
    expect(rendered.html).toContain("Manage preferences");
    expect(rendered.html).toContain(
      "https://gigstax.com/u/unsubscribe?token=test"
    );
    expect(rendered.text).toContain("Uber Eats");
    expect(rendered.text).toContain("Friday, February 27, 2026");
  });

  it("renders reset password template", async () => {
    const rendered = await renderEmailTemplate(
      ResetPasswordEmail({
        resetUrl: "https://gigstax.com/reset?token=abc",
      })
    );

    expect(rendered.html).toContain("Reset Password");
    expect(rendered.html).toContain("Security");
    expect(rendered.text).toContain("Reset Password");
  });

  it("renders subscription status details", async () => {
    const rendered = await renderEmailTemplate(
      SubscriptionStatusEmail({
        billingInterval: "year",
        periodEnd: "2026-12-31",
        planLabel: "Pro Driver",
        status: "past_due",
      })
    );

    expect(rendered.html).toContain("Subscription Update");
    expect(rendered.html).toContain("Pro Driver");
    expect(rendered.text).toContain("past_due");
  });

  it("renders inactivity nudge dashboard link", async () => {
    const rendered = await renderEmailTemplate(
      InactivityNudgeEmail({
        dashboardHref: "https://gigstax.com/dashboard",
        deliveriesHref: "https://gigstax.com/dashboard/deliveries",
        managePreferencesHref: "https://gigstax.com/dashboard/settings",
        unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=test",
      })
    );

    expect(rendered.html).toContain("Keep Your Earnings Streak Going");
    expect(rendered.html).toContain("Open your dashboard");
    expect(rendered.text).toContain("Log a Delivery");
  });

  it("renders onboarding offer email with discount code", async () => {
    const rendered = await renderEmailTemplate(
      AbandonedOnboardingOfferEmail({
        code: "GSTAXFREEAB12CD34",
        managePreferencesHref: "https://gigstax.com/dashboard/settings",
        onboardingHref: "https://gigstax.com/onboarding",
        unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=test",
      })
    );

    expect(rendered.html).toContain("GSTAXFREEAB12CD34");
    expect(rendered.text).toContain("Finish Setup");
  });

  it("renders onboarding tips email", async () => {
    const rendered = await renderEmailTemplate(
      OnboardingTipsEmail({
        dashboardHref: "https://gigstax.com/dashboard",
        deliveriesHref: "https://gigstax.com/dashboard/deliveries",
        managePreferencesHref: "https://gigstax.com/dashboard/settings",
        unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=test",
      })
    );

    expect(rendered.html).toContain("Getting the most out of GigStax");
    expect(rendered.text).toContain("screenshot");
  });

  it("renders weekly goal celebration email", async () => {
    const rendered = await renderEmailTemplate(
      WeeklyGoalCelebrationEmail({
        dashboardHref: "https://gigstax.com/dashboard/goals",
        managePreferencesHref: "https://gigstax.com/dashboard/settings",
        periodEnd: "2026-03-08",
        periodStart: "2026-03-02",
        targetAmount: "$900.00",
        totalAmount: "$1,042.15",
        unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=test",
      })
    );

    expect(rendered.html).toContain("Weekly goal hit");
    expect(rendered.text).toContain("$1,042.15");
  });

  it("renders quarterly tax reminder email", async () => {
    const rendered = await renderEmailTemplate(
      QuarterlyTaxReminderEmail({
        dashboardHref: "https://gigstax.com/dashboard/deliveries",
        managePreferencesHref: "https://gigstax.com/dashboard/settings",
        quarterLabel: "Q1 2026",
        unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=test",
      })
    );

    expect(rendered.html).toContain("Quarterly mileage reminder");
    expect(rendered.text).toContain("Q1 2026");
  });
});
