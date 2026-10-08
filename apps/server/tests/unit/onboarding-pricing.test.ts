import { describe, expect, it } from "vitest";

import {
  getAnnualSavingsLabel,
  getOnboardingVisiblePlans,
} from "@/lib/services/onboarding-pricing";
import type { OnboardingPricingPlanLike } from "@/lib/services/onboarding-pricing";

const basePlans: OnboardingPricingPlanLike[] = [
  {
    billingInterval: "month",
    currencyCode: "USD",
    planTier: "starter",
    priceCents: 100,
    slug: "starter-monthly",
  },
  {
    billingInterval: "month",
    currencyCode: "USD",
    planTier: "driver",
    priceCents: 1499,
    slug: "driver-monthly",
  },
  {
    billingInterval: "year",
    currencyCode: "USD",
    planTier: "driver",
    priceCents: 14_900,
    slug: "driver-yearly",
  },
  {
    billingInterval: "month",
    currencyCode: "USD",
    planTier: "pro_driver",
    priceCents: 2499,
    slug: "pro-driver-monthly",
  },
  {
    billingInterval: "year",
    currencyCode: "USD",
    planTier: "pro_driver",
    priceCents: 24_900,
    slug: "pro-driver-yearly",
  },
];

describe("onboarding pricing helpers", () => {
  it("hides the starter tier when annual billing is selected", () => {
    expect(
      getOnboardingVisiblePlans(basePlans, "year").map((plan) => plan.slug)
    ).toEqual(["driver-yearly", "pro-driver-yearly"]);
  });

  it("keeps the monthly plans visible including starter", () => {
    expect(
      getOnboardingVisiblePlans(basePlans, "month").map((plan) => plan.slug)
    ).toEqual(["starter-monthly", "driver-monthly", "pro-driver-monthly"]);
  });

  it("computes the yearly savings label from the matching monthly tier", () => {
    const driverYearly = basePlans.find(
      (plan) => plan.slug === "driver-yearly"
    );

    expect(driverYearly).toBeDefined();
    expect(getAnnualSavingsLabel(basePlans, driverYearly!)).toBe(
      "Save $30.88/yr"
    );
  });

  it("does not return a savings label for non-yearly plans", () => {
    const starterMonthly = basePlans.find(
      (plan) => plan.slug === "starter-monthly"
    );

    expect(starterMonthly).toBeDefined();
    expect(getAnnualSavingsLabel(basePlans, starterMonthly!)).toBeNull();
  });
});
