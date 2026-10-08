import { describe, expect, it, vi } from "vitest";

const discountGetMock = vi.fn();
const discountListMock = vi.fn();
const discountUpdateMock = vi.fn();
const getActiveOnboardingOfferConfigMock = vi.fn();
const getAdminPricingPlansMock = vi.fn();
const listCreditPacksMock = vi.fn();

vi.mock("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    discounts = {
      get: discountGetMock,
      list: discountListMock,
      update: discountUpdateMock,
    };
  },
}));

vi.mock("@/lib/services/onboarding-offers", () => ({
  getActiveOnboardingOfferConfig: getActiveOnboardingOfferConfigMock,
}));

vi.mock("@/lib/services/polar-admin", () => ({
  getAdminPricingPlans: getAdminPricingPlansMock,
}));

vi.mock("@/lib/services/credit-packs", () => ({
  listCreditPacks: listCreditPacksMock,
}));

vi.mock("@/lib/services/polar-catalog", () => ({
  getPolarServer: vi.fn(() => "production"),
}));

const createDiscount = (overrides: Record<string, unknown> = {}) => ({
  amount: null,
  basisPoints: 2500,
  code: "SPRING25",
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  currency: null,
  duration: "once",
  durationInMonths: null,
  endsAt: null,
  id: "disc_123",
  maxRedemptions: null,
  modifiedAt: null,
  name: "Spring 25%",
  products: [],
  redemptionsCount: 0,
  startsAt: null,
  type: "percentage",
  ...overrides,
});

const setup = () => {
  process.env.POLAR_ACCESS_TOKEN = "polar_pat_test";
  process.env.POLAR_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

  vi.clearAllMocks();
  vi.resetModules();

  getActiveOnboardingOfferConfigMock.mockResolvedValue(null);
  getAdminPricingPlansMock.mockResolvedValue([
    {
      billingInterval: "month",
      currencyCode: "USD",
      displayName: "Driver Monthly",
      isActive: true,
      planTier: "driver",
      polarProductId: "prod_active",
      priceCents: 1499,
      slug: "driver-monthly",
    },
  ]);
  listCreditPacksMock.mockResolvedValue([]);
  discountUpdateMock.mockResolvedValue(
    createDiscount({
      id: "disc_123",
      products: [{ id: "prod_archived", name: "Archived Driver Monthly" }],
    })
  );
};

describe("polar discounts service", () => {
  it("marks discounts that start in the future as inactive", async () => {
    setup();
    const { getAdminDiscountState } =
      await import("@/lib/services/polar-discounts");

    discountListMock.mockResolvedValueOnce(
      (async function* discountPages() {
        yield {
          result: {
            items: [
              createDiscount({
                startsAt: new Date("2099-01-01T00:00:00.000Z"),
              }),
            ],
          },
        };
      })()
    );

    const state = await getAdminDiscountState();

    expect(state.discounts[0]?.isActive).toBeFalsy();
  });

  it("allows updates for discounts that already target archived products", async () => {
    setup();
    const { updateAdminDiscount } =
      await import("@/lib/services/polar-discounts");

    discountGetMock.mockResolvedValueOnce(
      createDiscount({
        id: "disc_123",
        products: [{ id: "prod_archived", name: "Archived Driver Monthly" }],
      })
    );

    await expect(
      updateAdminDiscount({
        discountId: "disc_123",
        input: {
          amount: null,
          appliesToAllProducts: false,
          basisPoints: 2500,
          code: "SAVE25",
          duration: "once",
          durationInMonths: null,
          endsAt: null,
          maxRedemptions: null,
          name: "Save 25%",
          productIds: ["prod_archived"],
          startsAt: null,
          type: "percentage",
        },
      })
    ).resolves.toMatchObject({
      id: "disc_123",
      productIds: ["prod_archived"],
    });

    expect(discountUpdateMock).toHaveBeenCalledWith({
      discountUpdate: expect.objectContaining({
        products: ["prod_archived"],
      }),
      id: "disc_123",
    });
  });
});
