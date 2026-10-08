import { describe, expect, it, vi } from "vitest";

import {
  buildMeter,
  hasBulkUploadAccess,
  resolveActivePlanSelection,
} from "@/lib/services/entitlements";

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@gigstaxcf/db/schema", () => ({
  aiUsageEvents: {},
  subscriptions: {},
}));

vi.mock("@/lib/services/pricing-plans", () => ({
  getPricingPlanBySelection: vi.fn(),
}));

describe("entitlement helpers", () => {
  it("builds unlimited meters", () => {
    expect(
      buildMeter({
        limit: null,
        used: 42,
      })
    ).toEqual({
      limit: null,
      remaining: null,
      used: 42,
    });
  });

  it("builds capped meters with non-negative remaining", () => {
    expect(
      buildMeter({
        limit: 10,
        used: 3,
      })
    ).toEqual({
      limit: 10,
      remaining: 7,
      used: 3,
    });

    expect(
      buildMeter({
        limit: 10,
        used: 15,
      })
    ).toEqual({
      limit: 10,
      remaining: 0,
      used: 15,
    });
  });

  it("falls back to free selection when no subscription exists", () => {
    const selection = resolveActivePlanSelection({
      subscription: null,
    });

    expect(selection.planTier).toBe("free");
    expect(selection.billingInterval).toBeNull();
    expect(selection.isActivePaid).toBe(false);
    expect(selection.status).toBe("free");
  });

  it("uses paid selection when status is active and plan is paid", () => {
    const periodStart = new Date("2026-02-01T00:00:00.000Z");
    const periodEnd = new Date("2026-02-28T23:59:59.000Z");

    const selection = resolveActivePlanSelection({
      subscription: {
        billingInterval: "month",
        currentPeriodEnd: periodEnd,
        currentPeriodStart: periodStart,
        planTier: "driver",
        status: "active",
      },
    });

    expect(selection.planTier).toBe("driver");
    expect(selection.billingInterval).toBe("month");
    expect(selection.isActivePaid).toBe(true);
    expect(selection.periodStart).toEqual(periodStart);
    expect(selection.periodEnd).toEqual(periodEnd);
  });

  it("downgrades inactive paid subscription to free behavior", () => {
    const selection = resolveActivePlanSelection({
      subscription: {
        billingInterval: "month",
        currentPeriodEnd: null,
        currentPeriodStart: null,
        planTier: "driver",
        status: "canceled",
      },
    });

    expect(selection.planTier).toBe("free");
    expect(selection.billingInterval).toBeNull();
    expect(selection.isActivePaid).toBe(false);
  });

  it("treats pending checkout subscriptions as free entitlement fallback", () => {
    const selection = resolveActivePlanSelection({
      subscription: {
        billingInterval: "month",
        currentPeriodEnd: null,
        currentPeriodStart: null,
        planTier: "starter",
        status: "pending_checkout",
      },
    });

    expect(selection.planTier).toBe("free");
    expect(selection.billingInterval).toBeNull();
    expect(selection.isActivePaid).toBe(false);
  });

  it("treats null and positive bulk limits as bulk-enabled", () => {
    expect(hasBulkUploadAccess(null)).toBe(true);
    expect(hasBulkUploadAccess(5)).toBe(true);
    expect(hasBulkUploadAccess(0)).toBe(false);
  });
});
