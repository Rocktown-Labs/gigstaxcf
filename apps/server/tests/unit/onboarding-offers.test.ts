import { beforeEach, describe, expect, it, vi } from "vitest";

const createDiscountMock = vi.fn();
const updateDiscountMock = vi.fn();
const dbExecuteMock = vi.fn();
const dbSelectMock = vi.fn();
const getPolarCheckoutDiagnosticsMock = vi.fn();
const sqlMock = vi.fn(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })
);

vi.mock("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    discounts = {
      create: createDiscountMock,
      update: updateDiscountMock,
    };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    execute: dbExecuteMock,
    select: dbSelectMock,
  },
}));

vi.mock("@gigstaxcf/db/schema", () => ({
  onboardingOfferConfigs: {
    active: "active",
    id: "id",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((value) => value),
  eq: vi.fn((left, right) => ({ left, right })),
  sql: sqlMock,
}));

vi.mock("@/lib/services/polar-catalog", () => ({
  getPolarServer: vi.fn(() => "production"),
}));

vi.mock("@/lib/services/polar-checkout-config", () => ({
  getPolarCheckoutDiagnostics: getPolarCheckoutDiagnosticsMock,
}));

const existingOfferRecord = {
  active: true,
  code: "GSTAXFREEOLD1234",
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  discountId: "disc_old",
  id: 7,
  lastSyncedAt: new Date("2026-03-01T00:00:00.000Z"),
  productId: "prod_starter",
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
};

const createdOfferRecord = {
  ...existingOfferRecord,
  code: "GSTAXFREENEW5678",
  createdAt: new Date("2026-03-09T00:00:00.000Z"),
  discountId: "disc_new",
  id: 8,
  updatedAt: new Date("2026-03-09T00:00:00.000Z"),
};

beforeEach(() => {
  process.env.POLAR_ACCESS_TOKEN = "polar_pat_test";
  process.env.POLAR_ORGANIZATION_ID = "org_test";
  vi.clearAllMocks();
  vi.resetModules();

  getPolarCheckoutDiagnosticsMock.mockResolvedValue({
    planMappings: [
      {
        productId: "prod_starter",
        slug: "starter-monthly",
      },
    ],
  });

  const selectResults = [existingOfferRecord, createdOfferRecord];

  dbSelectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => {
            const next = selectResults.shift();
            return Promise.resolve(next ? [next] : []);
          },
        }),
      }),
    }),
  });

  createDiscountMock.mockResolvedValue({
    id: "disc_new",
  });

  dbExecuteMock.mockResolvedValue({
    rows: [],
  });
  updateDiscountMock.mockResolvedValue(null);
});

describe("syncStarterOnboardingOffer", () => {
  it("keeps the previous offer active if creating the replacement discount fails", async () => {
    const { syncStarterOnboardingOffer } =
      await import("@/lib/services/onboarding-offers");

    createDiscountMock.mockRejectedValueOnce(new Error("Polar unavailable"));

    await expect(
      syncStarterOnboardingOffer({
        regenerate: true,
      })
    ).rejects.toThrow("Polar unavailable");

    expect(dbExecuteMock).not.toHaveBeenCalled();
    expect(updateDiscountMock).not.toHaveBeenCalled();
  });

  it("expires the new discount if the atomic swap fails", async () => {
    const { syncStarterOnboardingOffer } =
      await import("@/lib/services/onboarding-offers");

    dbExecuteMock.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      syncStarterOnboardingOffer({
        regenerate: true,
      })
    ).rejects.toThrow("db unavailable");

    expect(createDiscountMock).toHaveBeenCalledOnce();
    expect(dbExecuteMock).toHaveBeenCalledOnce();
    expect(updateDiscountMock).toHaveBeenCalledOnce();
    expect(updateDiscountMock).toHaveBeenCalledWith({
      discountUpdate: {
        endsAt: expect.any(Date),
      },
      id: "disc_new",
    });
  });

  it("swaps to the new active offer before expiring the old discount", async () => {
    const { syncStarterOnboardingOffer } =
      await import("@/lib/services/onboarding-offers");

    await syncStarterOnboardingOffer({
      regenerate: true,
    });

    expect(createDiscountMock).toHaveBeenCalledOnce();
    expect(dbExecuteMock).toHaveBeenCalledOnce();
    expect(updateDiscountMock).toHaveBeenCalledOnce();

    expect(createDiscountMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbExecuteMock.mock.invocationCallOrder[0]!
    );
    expect(dbExecuteMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateDiscountMock.mock.invocationCallOrder[0]!
    );
    expect(updateDiscountMock).toHaveBeenCalledWith({
      discountUpdate: {
        endsAt: expect.any(Date),
      },
      id: "disc_old",
    });
  });
});
