import { describe, expect, it, vi } from "vitest";

import {
  isPolarMissingCheckoutProductError,
  isPolarResourceNotFoundError,
  syncPolarProduct,
} from "@/lib/services/polar-catalog";

describe("polar catalog helpers", () => {
  it("classifies missing Polar resources", () => {
    expect(
      isPolarResourceNotFoundError(
        new Error('API error occurred: {"error":"ResourceNotFound"}')
      )
    ).toBe(true);
    expect(
      isPolarMissingCheckoutProductError(
        new Error('API error occurred: {"msg":"Product does not exist."}')
      )
    ).toBe(true);
    expect(
      isPolarMissingCheckoutProductError({
        body$: JSON.stringify({
          detail: [
            {
              input: "05fdbb32-43f8-4747-8b2a-dc90c460fab2",
              msg: "Product does not exist.",
            },
          ],
          error: "PolarRequestValidationError",
        }),
        error: "PolarRequestValidationError",
      })
    ).toBe(true);
  });

  it("recreates products when update hits ResourceNotFound", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "prod_new",
      prices: [{ id: "price_new" }],
    });
    const update = vi
      .fn()
      .mockRejectedValue(
        new Error('API error occurred: {"error":"ResourceNotFound"}')
      );

    const result = await syncPolarProduct({
      baseProduct: {
        name: "Starter Monthly",
        prices: [{ priceAmount: 100 }],
      },
      client: { create, update },
      currentProductId: "prod_old",
    });

    expect(update).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(result).toEqual({
      product: {
        id: "prod_new",
        prices: [{ id: "price_new" }],
      },
      syncAction: "recreated",
    });
  });

  it("does not resend recurring interval on product updates", async () => {
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue({
      id: "prod_existing",
      prices: [{ id: "price_existing" }],
    });

    await syncPolarProduct({
      baseProduct: {
        description: "Starter plan",
        name: "Starter Monthly",
        prices: [{ priceAmount: 100 }],
        recurringInterval: "month",
      },
      client: { create, update },
      currentProductId: "prod_existing",
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      id: "prod_existing",
      productUpdate: {
        description: "Starter plan",
        name: "Starter Monthly",
        prices: [{ priceAmount: 100 }],
      },
    });
  });
});
