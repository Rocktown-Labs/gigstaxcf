import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/lib/db");
vi.unmock("@gigstaxcf/db/schema");
vi.unmock("@/lib/logging/logger");

describe("polar checkout config diagnostics", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.POLAR_SERVER = "production";
    process.env.POLAR_STARTER_MONTHLY_PRODUCT_ID =
      "11111111-1111-1111-8111-111111111111";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("reports when env checkout IDs override synced database IDs", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                polarProductId: "22222222-2222-1222-8222-222222222222",
                slug: "starter-monthly",
              },
            ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([]),
          }),
        }),
      });

    vi.doMock("@/lib/db", () => ({
      db: {
        select,
      },
    }));
    vi.doMock("@gigstaxcf/db/schema", () => ({
      creditPacks: {
        id: "id",
        isActive: "isActive",
        polarProductId: "polarProductId",
        slug: "slug",
        sortOrder: "sortOrder",
      },
      pricingPlans: {
        polarProductId: "polarProductId",
        slug: "slug",
      },
    }));
    vi.doMock("@/lib/logging/logger", () => ({
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    }));

    const { getPolarCheckoutDiagnostics } =
      await import("@/lib/services/polar-checkout-config");

    const diagnostics = await getPolarCheckoutDiagnostics();
    const starter = diagnostics.planMappings.find(
      (mapping) => mapping.slug === "starter-monthly"
    );

    expect(diagnostics.polarServer).toBe("production");
    expect(starter).toMatchObject({
      dbProductId: "22222222-2222-1222-8222-222222222222",
      envProductId: "11111111-1111-1111-8111-111111111111",
      productId: "11111111-1111-1111-8111-111111111111",
      source: "env",
    });
    expect(diagnostics.warnings).toContain(
      "starter-monthly is using POLAR_STARTER_MONTHLY_PRODUCT_ID and overriding a different database product ID."
    );
  });
});
