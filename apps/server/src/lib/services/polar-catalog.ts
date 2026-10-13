import { serverEnv } from "@/lib/server-env";

export type PolarServer = "production" | "sandbox";

export type PolarSyncAction = "created" | "recreated" | "updated";

interface PolarPriceLike {
  id?: string | null;
}

interface PolarProductLike {
  id: string;
  prices: PolarPriceLike[];
}

interface PolarProductClient {
  // Method signatures (not property signatures) keep the Polar SDK's
  // `Products` class assignable (bivariance).
  create(payload: Record<string, unknown>): Promise<PolarProductLike>;
  update(args: {
    id: string;
    productUpdate: Record<string, unknown>;
  }): Promise<PolarProductLike>;
}

export function getPolarServer(): PolarServer {
  return serverEnv.POLAR_SERVER === "sandbox" ? "sandbox" : "production";
}

function getErrorMessages(error: unknown) {
  const messages = new Set<string>();

  if (typeof error === "string") {
    messages.add(error);
  }

  if (error instanceof Error) {
    messages.add(error.message);
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    for (const value of Object.values(record)) {
      if (typeof value === "string") {
        messages.add(value);
      }
    }

    try {
      messages.add(JSON.stringify(record));
    } catch {
      // Ignore circular/non-serializable error shapes and keep collected strings.
    }
  }

  return [...messages].filter(Boolean);
}

function hasPolarErrorFragment(error: unknown, fragment: string) {
  return getErrorMessages(error).some((message) => message.includes(fragment));
}

export function isPolarResourceNotFoundError(error: unknown) {
  return hasPolarErrorFragment(error, "ResourceNotFound");
}

export function isPolarMissingCheckoutProductError(error: unknown) {
  return (
    isPolarResourceNotFoundError(error) ||
    hasPolarErrorFragment(error, "Product does not exist")
  );
}

export async function syncPolarProduct(args: {
  baseProduct: Record<string, unknown>;
  client: PolarProductClient;
  currentProductId: string | null;
}): Promise<{ product: PolarProductLike; syncAction: PolarSyncAction }> {
  if (!args.currentProductId) {
    const product = await args.client.create(args.baseProduct);
    return { product, syncAction: "created" };
  }

  try {
    const product = await args.client.update({
      id: args.currentProductId,
      productUpdate: {
        description: args.baseProduct.description,
        name: args.baseProduct.name,
        prices: args.baseProduct.prices,
      },
    });

    return { product, syncAction: "updated" };
  } catch (error) {
    if (!isPolarResourceNotFoundError(error)) {
      throw error;
    }

    const product = await args.client.create(args.baseProduct);
    return { product, syncAction: "recreated" };
  }
}
