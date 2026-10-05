export type OnboardingBillingInterval = "month" | "year";
export type OnboardingPlanTier = "starter" | "driver" | "pro_driver";

export interface OnboardingPricingPlanLike {
  billingInterval: OnboardingBillingInterval | null;
  currencyCode: string;
  planTier: OnboardingPlanTier;
  priceCents: number;
  slug: string;
}

function formatPrice(priceCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    currency: currencyCode || "USD",
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(priceCents / 100);
}

export function getOnboardingVisiblePlans<T extends OnboardingPricingPlanLike>(
  plans: T[],
  billingInterval: OnboardingBillingInterval
) {
  return plans.filter((plan) => {
    if (plan.billingInterval !== billingInterval) {
      return false;
    }

    if (billingInterval === "year" && plan.planTier === "starter") {
      return false;
    }

    return true;
  });
}

export function getAnnualSavingsLabel<T extends OnboardingPricingPlanLike>(
  plans: T[],
  targetPlan: T
) {
  if (targetPlan.billingInterval !== "year") {
    return null;
  }

  const monthlyPlan = plans.find(
    (plan) =>
      plan.planTier === targetPlan.planTier && plan.billingInterval === "month"
  );

  if (
    !monthlyPlan ||
    monthlyPlan.priceCents <= 0 ||
    targetPlan.priceCents <= 0
  ) {
    return null;
  }

  const discount = monthlyPlan.priceCents * 12 - targetPlan.priceCents;
  if (discount <= 0) {
    return null;
  }

  return `Save ${formatPrice(discount, targetPlan.currencyCode)}/yr`;
}
