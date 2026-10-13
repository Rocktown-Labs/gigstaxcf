import { describe, expect, it } from "vitest";

import { normalizeExtractionPayload } from "@/lib/services/extraction";

describe("normalizeExtractionPayload", () => {
  it("normalizes earning payload values and platform slugs", () => {
    const normalized = normalizeExtractionPayload({
      bonusAmount: "3.5",
      distanceMiles: "6.7",
      dropoffAddress: "  456 Customer Rd, Harrisonburg, VA  ",
      durationSeconds: "1800",
      entryType: "earning",
      fareAmount: "9",
      pickupAddress: "  123 Store St, Harrisonburg, VA  ",
      platformSlug: "Uber Eats",
      tipEstimatedAmount: "22.87",
      tipFinalAmount: null,
      tipStatus: "pending",
      totalEstimatedAmount: "31.87",
    });

    expect(normalized.entryType).toBe("earning");
    expect(normalized.platformSlug).toBe("uber_eats");
    expect(normalized.fareAmount).toBe(9);
    expect(normalized.bonusAmount).toBe(3.5);
    expect(normalized.pickupAddress).toBe("123 Store St, Harrisonburg, VA");
    expect(normalized.dropoffAddress).toBe("456 Customer Rd, Harrisonburg, VA");
    expect(normalized.tipStatus).toBe("pending");
    expect(normalized.tipEstimatedAmount).toBe(22.87);
    expect(normalized.totalEstimatedAmount).toBe(31.87);
    expect(normalized.expenseCategory).toBeNull();
  });

  it("normalizes expense payload and unknown category to other", () => {
    const normalized = normalizeExtractionPayload({
      entryType: "expense",
      expenseAmount: "48.99",
      expenseCategory: "car wash",
      notes: "Gas + car wash",
      tipStatus: "none",
    });

    expect(normalized.entryType).toBe("expense");
    expect(normalized.expenseAmount).toBe(48.99);
    expect(normalized.expenseCategory).toBe("other");
    expect(normalized.platformSlug).toBeNull();
    expect(normalized.pickupAddress).toBeNull();
    expect(normalized.dropoffAddress).toBeNull();
    expect(normalized.notes).toBe("Gas + car wash");
  });

  it("coerces invalid numeric and status values safely", () => {
    const normalized = normalizeExtractionPayload({
      bonusAmount: "-1",
      distanceMiles: "abc",
      entryType: "earning",
      platformSlug: "unknown app",
      tipStatus: "weird",
    });

    expect(normalized.bonusAmount).toBeNull();
    expect(normalized.distanceMiles).toBeNull();
    expect(normalized.platformSlug).toBe("other");
    expect(normalized.tipStatus).toBe("none");
  });
});
