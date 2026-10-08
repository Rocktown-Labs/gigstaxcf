import { describe, expect, it } from "vitest";

import {
  deriveBillingOffers,
  resolveCurrentPlanSlug,
} from "@/lib/services/billing-offers";
import type {
  PricingPlanDto,
  PricingPlanSlug,
} from "@/lib/services/pricing-plans";

const pricingPlansFixture: PricingPlanDto[] = [
  {
    aiCreditLimit: 10,
    billingInterval: null,
    bulkBatchLimit: 0,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Legacy free plan",
    displayName: "Legacy Free",
    features: [],
    id: 1,
    isActive: false,
    lastSyncedAt: null,
    planTier: "free",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 0,
    slug: "free",
    sortOrder: 5,
    updatedAt: new Date(0).toISOString(),
  },
  {
    aiCreditLimit: 10,
    billingInterval: "month",
    bulkBatchLimit: 0,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Starter monthly",
    displayName: "Starter Monthly",
    features: [],
    id: 2,
    isActive: true,
    lastSyncedAt: null,
    planTier: "starter",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 100,
    slug: "starter-monthly",
    sortOrder: 15,
    updatedAt: new Date(0).toISOString(),
  },
  {
    aiCreditLimit: 300,
    billingInterval: "month",
    bulkBatchLimit: 5,
    bulkMaxImagesPerBatch: 50,
    currencyCode: "USD",
    description: "Driver monthly",
    displayName: "Driver Monthly",
    features: [],
    id: 3,
    isActive: true,
    lastSyncedAt: null,
    planTier: "driver",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 1499,
    slug: "driver-monthly",
    sortOrder: 20,
    updatedAt: new Date(0).toISOString(),
  },
  {
    aiCreditLimit: 300,
    billingInterval: "year",
    bulkBatchLimit: 5,
    bulkMaxImagesPerBatch: 50,
    currencyCode: "USD",
    description: "Driver yearly",
    displayName: "Driver Yearly",
    features: [],
    id: 4,
    isActive: true,
    lastSyncedAt: null,
    planTier: "driver",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 14_900,
    slug: "driver-yearly",
    sortOrder: 30,
    updatedAt: new Date(0).toISOString(),
  },
  {
    aiCreditLimit: null,
    billingInterval: "month",
    bulkBatchLimit: null,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Pro monthly",
    displayName: "Pro Driver Monthly",
    features: [],
    id: 5,
    isActive: true,
    lastSyncedAt: null,
    planTier: "pro_driver",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 2499,
    slug: "pro-driver-monthly",
    sortOrder: 40,
    updatedAt: new Date(0).toISOString(),
  },
  {
    aiCreditLimit: null,
    billingInterval: "year",
    bulkBatchLimit: null,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Pro yearly",
    displayName: "Pro Driver Yearly",
    features: [],
    id: 6,
    isActive: true,
    lastSyncedAt: null,
    planTier: "pro_driver",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 24_900,
    slug: "pro-driver-yearly",
    sortOrder: 50,
    updatedAt: new Date(0).toISOString(),
  },
];

const paidPlanSlugs: PricingPlanSlug[] = [
  "starter-monthly",
  "driver-monthly",
  "driver-yearly",
  "pro-driver-monthly",
  "pro-driver-yearly",
];

describe("billing offer derivation", () => {
  it("shows all paid offers for legacy free users", () => {
    const offers = deriveBillingOffers({
      currentPlanSlug: "free",
      plans: pricingPlansFixture,
    });

    expect(offers).toHaveLength(5);
    expect(offers.map((offer) => offer.plan.slug)).toStrictEqual([
      "starter-monthly",
      "driver-monthly",
      "driver-yearly",
      "pro-driver-monthly",
      "pro-driver-yearly",
    ]);
    expect(offers.every((offer) => offer.kind === "upgrade")).toBeTruthy();
  });

  it("shows all paid options except the current paid plan", () => {
    for (const currentPlanSlug of paidPlanSlugs) {
      const offers = deriveBillingOffers({
        currentPlanSlug,
        plans: pricingPlansFixture,
      });

      expect(offers).toHaveLength(4);
      expect(
        offers.some((offer) => offer.plan.slug === currentPlanSlug)
      ).toBeFalsy();
    }
  });

  it("labels offers as upgrade, downgrade, and switch billing", () => {
    const fromDriverMonthly = deriveBillingOffers({
      currentPlanSlug: "driver-monthly",
      plans: pricingPlansFixture,
    });
    const fromDriverMonthlyKindBySlug = new Map(
      fromDriverMonthly.map((offer) => [offer.plan.slug, offer.kind])
    );

    expect(fromDriverMonthlyKindBySlug.get("starter-monthly")).toBe(
      "downgrade"
    );
    expect(fromDriverMonthlyKindBySlug.get("driver-yearly")).toBe(
      "switch_billing"
    );
    expect(fromDriverMonthlyKindBySlug.get("pro-driver-monthly")).toBe(
      "upgrade"
    );

    const fromProYearly = deriveBillingOffers({
      currentPlanSlug: "pro-driver-yearly",
      plans: pricingPlansFixture,
    });
    const fromProYearlyKindBySlug = new Map(
      fromProYearly.map((offer) => [offer.plan.slug, offer.kind])
    );

    expect(fromProYearlyKindBySlug.get("pro-driver-monthly")).toBe(
      "switch_billing"
    );
    expect(fromProYearlyKindBySlug.get("driver-monthly")).toBe("downgrade");
    expect(fromProYearlyKindBySlug.get("starter-monthly")).toBe("downgrade");
  });

  it("sorts by transition precedence before plan sort order", () => {
    const offers = deriveBillingOffers({
      currentPlanSlug: "driver-yearly",
      plans: pricingPlansFixture,
    });

    expect(offers.map((offer) => offer.kind)).toStrictEqual([
      "upgrade",
      "upgrade",
      "switch_billing",
      "downgrade",
    ]);
    expect(offers.map((offer) => offer.plan.slug)).toStrictEqual([
      "pro-driver-monthly",
      "pro-driver-yearly",
      "driver-monthly",
      "starter-monthly",
    ]);
  });

  it("treats non-active paid status as free for visible offers", () => {
    const currentPlanSlug = resolveCurrentPlanSlug({
      billingInterval: "month",
      planTier: "driver",
      status: "canceled",
    });

    expect(currentPlanSlug).toBe("free");

    const offers = deriveBillingOffers({
      currentPlanSlug,
      plans: pricingPlansFixture,
    });
    expect(offers).toHaveLength(5);
  });
});
