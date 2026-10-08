import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntitlementResult } from "@/lib/services/entitlements";
import {
  assertCanAnalyzeImage,
  assertCanBulkUpload,
} from "@/lib/services/usage-limits";

const getUserEntitlementMock =
  vi.fn<(userId: number) => Promise<EntitlementResult>>();
const consumePackCreditsAtomicMock =
  vi.fn<
    (args: {
      credits: number;
      metadata?: Record<string, unknown>;
      sourceId?: string | null;
      sourceType: string;
      userId: number;
    }) => Promise<{ balanceAfter: number; consumed: boolean }>
  >();

vi.mock(import("@/lib/services/entitlements"), () => ({
  getUserEntitlement: (userId: number) => getUserEntitlementMock(userId),
}));

vi.mock(import("@/lib/services/credit-balances"), () => ({
  consumePackCreditsAtomic: (args: {
    credits: number;
    metadata?: Record<string, unknown>;
    sourceId?: string | null;
    sourceType: string;
    userId: number;
  }) => consumePackCreditsAtomicMock(args),
}));

const entitlementFixture = (
  partial: Partial<EntitlementResult>
): EntitlementResult => ({
  ai: {
    canAnalyze: true,
    effectiveRemaining: 10,
    limit: 10,
    monthlyRemaining: 10,
    packBalance: 0,
    remaining: 10,
    used: 0,
  },
  billingInterval: null,
  bulk: {
    canUse: false,
    limit: 0,
    maxImagesPerBatch: null,
    remaining: 0,
    used: 0,
  },
  effectivePlan: {
    aiCreditLimit: 10,
    billingInterval: null,
    bulkBatchLimit: 0,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Free",
    displayName: "Free",
    features: [],
    id: 1,
    isActive: true,
    lastSyncedAt: null,
    planTier: "free",
    polarPriceId: null,
    polarProductId: null,
    priceCents: 0,
    slug: "free",
    sortOrder: 10,
    updatedAt: new Date().toISOString(),
  },
  isPaid: false,
  isPro: false,
  periodEnd: new Date(),
  periodStart: new Date(),
  planTier: "free",
  status: "free",
  ...partial,
});

describe("usage limits", () => {
  beforeEach(() => {
    getUserEntitlementMock.mockReset();
    consumePackCreditsAtomicMock.mockReset();
    consumePackCreditsAtomicMock.mockResolvedValue({
      balanceAfter: 0,
      consumed: true,
    });
  });

  it("allows analyze when credits remain", async () => {
    const entitlement = entitlementFixture({
      ai: {
        canAnalyze: true,
        effectiveRemaining: 4,
        limit: 10,
        monthlyRemaining: 4,
        packBalance: 0,
        remaining: 4,
        used: 6,
      },
    });
    getUserEntitlementMock.mockResolvedValue(entitlement);

    const result = await assertCanAnalyzeImage({
      requestedUnits: 2,
      userId: 1,
    });

    expect(result.ai.remaining).toBe(4);
  });

  it("blocks analyze when credits are exhausted", async () => {
    getUserEntitlementMock.mockResolvedValue(
      entitlementFixture({
        ai: {
          canAnalyze: false,
          effectiveRemaining: 0,
          limit: 10,
          monthlyRemaining: 0,
          packBalance: 0,
          remaining: 0,
          used: 10,
        },
      })
    );

    await expect(
      assertCanAnalyzeImage({
        requestedUnits: 1,
        userId: 1,
      })
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      message: "AI credits exhausted. Upgrade or Buy Credits to continue.",
    });
  });

  it("uses pack credits when monthly credits are insufficient", async () => {
    getUserEntitlementMock.mockResolvedValue(
      entitlementFixture({
        ai: {
          canAnalyze: true,
          effectiveRemaining: 3,
          limit: 10,
          monthlyRemaining: 1,
          packBalance: 2,
          remaining: 1,
          used: 9,
        },
      })
    );

    await expect(
      assertCanAnalyzeImage({
        requestedUnits: 3,
        userId: 1,
      })
    ).resolves.toMatchObject({
      ai: {
        monthlyRemaining: 1,
      },
    });

    expect(consumePackCreditsAtomicMock).toHaveBeenCalledWith({
      credits: 2,
      metadata: {
        requestedUnits: 3,
      },
      sourceType: "ai_pack_fallback_consume",
      userId: 1,
    });
  });

  it("blocks analyze when monthly and pack credits are insufficient", async () => {
    getUserEntitlementMock.mockResolvedValue(
      entitlementFixture({
        ai: {
          canAnalyze: false,
          effectiveRemaining: 1,
          limit: 10,
          monthlyRemaining: 1,
          packBalance: 0,
          remaining: 1,
          used: 9,
        },
      })
    );

    await expect(
      assertCanAnalyzeImage({
        requestedUnits: 2,
        userId: 1,
      })
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });

    expect(consumePackCreditsAtomicMock).not.toHaveBeenCalled();
  });

  it("blocks bulk upload when plan does not include bulk", async () => {
    getUserEntitlementMock.mockResolvedValue(
      entitlementFixture({
        bulk: {
          canUse: false,
          limit: 0,
          maxImagesPerBatch: null,
          remaining: 0,
          used: 0,
        },
      })
    );

    await expect(
      assertCanBulkUpload({
        imageCount: 5,
        userId: 1,
      })
    ).rejects.toMatchObject({
      code: "FEATURE_NOT_INCLUDED",
    });
  });

  it("blocks bulk upload when image count exceeds max batch size", async () => {
    getUserEntitlementMock.mockResolvedValue(
      entitlementFixture({
        bulk: {
          canUse: true,
          limit: 5,
          maxImagesPerBatch: 10,
          remaining: 5,
          used: 0,
        },
      })
    );

    await expect(
      assertCanBulkUpload({
        imageCount: 25,
        userId: 1,
      })
    ).rejects.toMatchObject({
      code: "FEATURE_NOT_INCLUDED",
    });
  });

  it("allows bulk upload when bulk is unlimited", async () => {
    getUserEntitlementMock.mockResolvedValue(
      entitlementFixture({
        bulk: {
          canUse: true,
          limit: null,
          maxImagesPerBatch: null,
          remaining: null,
          used: 120,
        },
      })
    );

    await expect(
      assertCanBulkUpload({
        imageCount: 500,
        userId: 1,
      })
    ).resolves.toMatchObject({
      bulk: {
        canUse: true,
        limit: null,
      },
    });
  });
});
