import { Polar } from "@polar-sh/sdk";
import type { Discount } from "@polar-sh/sdk/models/components/discount.js";
import type { DiscountCreate } from "@polar-sh/sdk/models/components/discountcreate.js";
import type { DiscountUpdate } from "@polar-sh/sdk/models/components/discountupdate.js";

import { serverEnv } from "@/lib/server-env";
import type { CreditPackDto } from "@/lib/services/credit-packs";
import { listCreditPacks } from "@/lib/services/credit-packs";
import { getActiveOnboardingOfferConfig } from "@/lib/services/onboarding-offers";
import { getAdminPricingPlans } from "@/lib/services/polar-admin";
import { getPolarServer } from "@/lib/services/polar-catalog";

export interface AdminDiscountTarget {
  id: string;
  kind: "pack" | "plan";
  label: string;
  priceLabel: string;
  slug: string;
}

export interface AdminDiscountRecord {
  amount: number | null;
  appliesToAllProducts: boolean;
  basisPoints: number | null;
  code: string | null;
  createdAt: string;
  currency: string | null;
  duration: "forever" | "once" | "repeating";
  durationInMonths: number | null;
  endsAt: string | null;
  id: string;
  isActive: boolean;
  managedBy: "onboarding_offer" | null;
  maxRedemptions: number | null;
  modifiedAt: string | null;
  name: string;
  productIds: string[];
  productNames: string[];
  redemptionsCount: number;
  startsAt: string | null;
  type: "fixed" | "percentage";
}

export interface AdminDiscountInput {
  amount: number | null;
  appliesToAllProducts: boolean;
  basisPoints: number | null;
  code: string | null;
  duration: "forever" | "once" | "repeating";
  durationInMonths: number | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  name: string;
  productIds: string[];
  startsAt: string | null;
  type: "fixed" | "percentage";
}

export interface AdminDiscountState {
  discounts: AdminDiscountRecord[];
  polarConfigured: boolean;
  polarServer: "production" | "sandbox";
  targets: AdminDiscountTarget[];
}

const polarAccessToken = serverEnv.POLAR_ACCESS_TOKEN || "";
const polarOrganizationId = serverEnv.POLAR_ORGANIZATION_ID || "";
const polarServer = getPolarServer();
const isOrganizationAccessToken = polarAccessToken.startsWith("polar_oat_");
const POLAR_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const polarClient = polarAccessToken
  ? new Polar({
      accessToken: polarAccessToken,
      server: polarServer,
    })
  : null;

function getPolarConfigError() {
  if (!polarAccessToken) {
    return "POLAR_ACCESS_TOKEN is not configured";
  }

  if (isOrganizationAccessToken) {
    return null;
  }

  const normalizedOrganizationId = polarOrganizationId.trim();
  if (!normalizedOrganizationId) {
    return "POLAR_ORGANIZATION_ID is not configured";
  }

  if (!POLAR_UUID_REGEX.test(normalizedOrganizationId)) {
    return "POLAR_ORGANIZATION_ID is invalid";
  }

  return null;
}

function withOrganizationId<T extends Record<string, unknown>>(payload: T): T {
  if (isOrganizationAccessToken) {
    return payload;
  }

  if (!polarOrganizationId.trim()) {
    throw new Error("POLAR_ORGANIZATION_ID is not configured");
  }

  return {
    ...payload,
    organizationId: polarOrganizationId.trim(),
  };
}

function formatMoney(cents: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      currency: currencyCode || "USD",
      style: "currency",
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatPackTarget(pack: CreditPackDto): AdminDiscountTarget {
  return {
    id: pack.polarProductId as string,
    kind: "pack",
    label: pack.displayName,
    priceLabel: formatMoney(pack.priceCents, pack.currencyCode),
    slug: pack.slug,
  };
}

function formatPlanTarget(
  plan: Awaited<ReturnType<typeof getAdminPricingPlans>>[number]
): AdminDiscountTarget {
  const intervalLabel = plan.billingInterval ? `/${plan.billingInterval}` : "";

  return {
    id: plan.polarProductId as string,
    kind: "plan",
    label: plan.displayName,
    priceLabel: `${formatMoney(plan.priceCents, plan.currencyCode)}${intervalLabel}`,
    slug: plan.slug,
  };
}

async function getDiscountTargets(): Promise<AdminDiscountTarget[]> {
  const [plans, packs] = await Promise.all([
    getAdminPricingPlans(),
    listCreditPacks({ activeOnly: false }),
  ]);

  const planTargets = plans
    .filter(
      (plan) =>
        plan.isActive &&
        plan.planTier !== "free" &&
        plan.polarProductId &&
        plan.billingInterval
    )
    .map(formatPlanTarget);

  const packTargets = packs
    .filter((pack) => pack.isActive && pack.polarProductId)
    .map(formatPackTarget);

  return [...planTargets, ...packTargets].toSorted((left, right) =>
    left.label.localeCompare(right.label)
  );
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function toAdminDiscountRecord(args: {
  discount: Discount;
  managedDiscountId: string | null;
}): AdminDiscountRecord {
  const { discount, managedDiscountId } = args;
  const now = Date.now();
  const startsAt = discount.startsAt ? discount.startsAt.getTime() : null;
  const endsAt = discount.endsAt ? discount.endsAt.getTime() : null;
  const hasStarted = startsAt === null || startsAt <= now;
  const hasNotEnded = endsAt === null || endsAt > now;

  return {
    amount: "amount" in discount ? discount.amount : null,
    appliesToAllProducts: discount.products.length === 0,
    basisPoints: "basisPoints" in discount ? discount.basisPoints : null,
    code: discount.code,
    createdAt: discount.createdAt.toISOString(),
    currency: "currency" in discount ? discount.currency : null,
    duration: discount.duration,
    durationInMonths:
      "durationInMonths" in discount ? discount.durationInMonths : null,
    endsAt: toIsoString(discount.endsAt),
    id: discount.id,
    isActive: hasStarted && hasNotEnded,
    managedBy:
      managedDiscountId && managedDiscountId === discount.id
        ? "onboarding_offer"
        : null,
    maxRedemptions: discount.maxRedemptions,
    modifiedAt: toIsoString(discount.modifiedAt),
    name: discount.name,
    productIds: discount.products.map((product) => product.id),
    productNames: discount.products.map((product) => product.name),
    redemptionsCount: discount.redemptionsCount,
    startsAt: toIsoString(discount.startsAt),
    type: discount.type,
  };
}

function ensureNonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function ensureIntegerInRange(args: {
  field: string;
  max?: number;
  min?: number;
  nullable?: boolean;
  value: unknown;
}) {
  const { field, max, min, nullable, value } = args;

  if (value === null || value === undefined || value === "") {
    if (nullable) {
      return null;
    }

    throw new Error(`${field} is required`);
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${field} must be a whole number`);
  }

  if (min !== undefined && value < min) {
    throw new Error(`${field} must be at least ${min}`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`${field} must be no more than ${max}`);
  }

  return value;
}

function ensureNullableDateString(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a valid datetime`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`${field} must be a valid datetime`);
  }

  return parsed.toISOString();
}

export function parseAdminDiscountInput(body: unknown): AdminDiscountInput {
  const payload =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const { type } = payload;
  if (type !== "fixed" && type !== "percentage") {
    throw new Error("type must be fixed or percentage");
  }

  const { duration } = payload;
  if (
    duration !== "once" &&
    duration !== "forever" &&
    duration !== "repeating"
  ) {
    throw new Error("duration must be once, forever, or repeating");
  }

  const appliesToAllProducts = payload.appliesToAllProducts === true;
  const productIds = Array.isArray(payload.productIds)
    ? payload.productIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    : [];

  if (!appliesToAllProducts && productIds.length === 0) {
    throw new Error("Select at least one product target");
  }

  const input: AdminDiscountInput = {
    amount:
      type === "fixed"
        ? ensureIntegerInRange({
            field: "amount",
            min: 1,
            value: payload.amount,
          })
        : null,
    appliesToAllProducts,
    basisPoints:
      type === "percentage"
        ? ensureIntegerInRange({
            field: "basisPoints",
            max: 10_000,
            min: 1,
            value: payload.basisPoints,
          })
        : null,
    code:
      payload.code === null || payload.code === undefined || payload.code === ""
        ? null
        : ensureNonEmptyString(payload.code, "code"),
    duration,
    durationInMonths:
      duration === "repeating"
        ? ensureIntegerInRange({
            field: "durationInMonths",
            min: 1,
            value: payload.durationInMonths,
          })
        : null,
    endsAt: ensureNullableDateString(payload.endsAt, "endsAt"),
    maxRedemptions: ensureIntegerInRange({
      field: "maxRedemptions",
      min: 1,
      nullable: true,
      value: payload.maxRedemptions,
    }),
    name: ensureNonEmptyString(payload.name, "name"),
    productIds,
    startsAt: ensureNullableDateString(payload.startsAt, "startsAt"),
    type,
  };

  return input;
}

async function assertValidProductTargets(input: AdminDiscountInput) {
  if (input.appliesToAllProducts) {
    return;
  }

  const targets = await getDiscountTargets();
  const validTargets = new Set(targets.map((target) => target.id));
  const invalidTargets = input.productIds.filter(
    (productId) => !validTargets.has(productId)
  );

  if (invalidTargets.length > 0) {
    throw new Error("One or more selected products are not synced in Polar");
  }
}

async function assertValidProductTargetsForUpdate(args: {
  discountId: string;
  input: AdminDiscountInput;
}) {
  const { discountId, input } = args;

  if (input.appliesToAllProducts) {
    return;
  }

  const targets = await getDiscountTargets();
  const validTargets = new Set(targets.map((target) => target.id));
  const invalidTargets = input.productIds.filter(
    (productId) => !validTargets.has(productId)
  );

  if (invalidTargets.length === 0) {
    return;
  }

  const existingDiscount = await polarClient?.discounts.get({ id: discountId });
  const existingProductIds = new Set(
    existingDiscount?.products.map((product) => product.id)
  );
  const stillInvalidTargets = invalidTargets.filter(
    (productId) => !existingProductIds.has(productId)
  );

  if (stillInvalidTargets.length > 0) {
    throw new Error("One or more selected products are not synced in Polar");
  }
}

function buildDiscountCreatePayload(input: AdminDiscountInput): DiscountCreate {
  const basePayload = {
    code: input.code,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    maxRedemptions: input.maxRedemptions,
    name: input.name,
    products: input.appliesToAllProducts ? null : input.productIds,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
  };

  if (input.type === "fixed" && input.duration === "repeating") {
    return withOrganizationId({
      ...basePayload,
      amount: input.amount as number,
      currency: "usd",
      duration: "repeating",
      durationInMonths: input.durationInMonths as number,
      type: "fixed",
    });
  }

  if (input.type === "fixed") {
    return withOrganizationId({
      ...basePayload,
      amount: input.amount as number,
      currency: "usd",
      duration: input.duration,
      type: "fixed",
    });
  }

  if (input.duration === "repeating") {
    return withOrganizationId({
      ...basePayload,
      basisPoints: input.basisPoints as number,
      duration: "repeating",
      durationInMonths: input.durationInMonths as number,
      type: "percentage",
    });
  }

  return withOrganizationId({
    ...basePayload,
    basisPoints: input.basisPoints as number,
    duration: input.duration,
    type: "percentage",
  });
}

function buildDiscountUpdatePayload(input: AdminDiscountInput): DiscountUpdate {
  return {
    amount: input.type === "fixed" ? input.amount : null,
    basisPoints: input.type === "percentage" ? input.basisPoints : null,
    code: input.code,
    currency: input.type === "fixed" ? "usd" : null,
    duration: input.duration,
    durationInMonths:
      input.duration === "repeating" ? input.durationInMonths : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    maxRedemptions: input.maxRedemptions,
    name: input.name,
    products: input.appliesToAllProducts ? null : input.productIds,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    type: input.type,
  };
}

function ensureEditableDiscount(
  discountId: string,
  managedDiscountId: string | null
) {
  if (managedDiscountId && managedDiscountId === discountId) {
    throw new Error(
      "This discount is managed by the Starter onboarding offer controls."
    );
  }
}

async function getManagedOnboardingOfferDiscountId() {
  const activeOffer = await getActiveOnboardingOfferConfig();
  return activeOffer?.discountId || null;
}

export async function getAdminDiscountState(): Promise<AdminDiscountState> {
  const [targets, managedDiscountId] = await Promise.all([
    getDiscountTargets(),
    getManagedOnboardingOfferDiscountId(),
  ]);

  const configError = getPolarConfigError();
  if (!polarClient || configError) {
    return {
      discounts: [],
      polarConfigured: false,
      polarServer,
      targets,
    };
  }

  const iterator = await polarClient.discounts.list(
    withOrganizationId({
      limit: 100,
      sorting: ["-created_at"],
    })
  );

  const discounts: Discount[] = [];
  for await (const page of iterator) {
    discounts.push(...page.result.items);
  }

  return {
    discounts: discounts.map((discount) =>
      toAdminDiscountRecord({ discount, managedDiscountId })
    ),
    polarConfigured: true,
    polarServer,
    targets,
  };
}

export async function createAdminDiscount(input: AdminDiscountInput) {
  const configError = getPolarConfigError();
  if (!polarClient || configError) {
    throw new Error(configError || "Polar integration is not configured");
  }

  await assertValidProductTargets(input);

  const created = await polarClient.discounts.create(
    buildDiscountCreatePayload(input)
  );

  const managedDiscountId = await getManagedOnboardingOfferDiscountId();
  return toAdminDiscountRecord({ discount: created, managedDiscountId });
}

export async function updateAdminDiscount(args: {
  discountId: string;
  input: AdminDiscountInput;
}) {
  const configError = getPolarConfigError();
  if (!polarClient || configError) {
    throw new Error(configError || "Polar integration is not configured");
  }

  const managedDiscountId = await getManagedOnboardingOfferDiscountId();
  ensureEditableDiscount(args.discountId, managedDiscountId);
  await assertValidProductTargetsForUpdate(args);

  const updated = await polarClient.discounts.update({
    discountUpdate: buildDiscountUpdatePayload(args.input),
    id: args.discountId,
  });

  return toAdminDiscountRecord({ discount: updated, managedDiscountId });
}

export async function expireAdminDiscount(discountId: string) {
  const configError = getPolarConfigError();
  if (!polarClient || configError) {
    throw new Error(configError || "Polar integration is not configured");
  }

  const managedDiscountId = await getManagedOnboardingOfferDiscountId();
  ensureEditableDiscount(discountId, managedDiscountId);

  const updated = await polarClient.discounts.update({
    discountUpdate: {
      endsAt: new Date(),
    },
    id: discountId,
  });

  return toAdminDiscountRecord({ discount: updated, managedDiscountId });
}

export async function deleteAdminDiscount(discountId: string) {
  const configError = getPolarConfigError();
  if (!polarClient || configError) {
    throw new Error(configError || "Polar integration is not configured");
  }

  const managedDiscountId = await getManagedOnboardingOfferDiscountId();
  ensureEditableDiscount(discountId, managedDiscountId);

  await polarClient.discounts.delete({ id: discountId });
}
