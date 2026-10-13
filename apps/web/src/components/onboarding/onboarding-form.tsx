import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { validateVerificationAddress } from "@/lib/radar/verification-address";
import {
  getAnnualSavingsLabel,
  getOnboardingVisiblePlans,
} from "@/lib/services/onboarding-pricing";
import { cn } from "@/lib/utils";
import {
  addressSchema,
  legalNameSchema,
  phoneSchema,
  sanitizePhoneInput,
} from "@/lib/validations";
import { getWeekStartsOn } from "@/lib/week";

type WeekStartsOn = "monday" | "sunday";
type BillingInterval = "month" | "year";
type PlanTier = "starter" | "driver" | "pro_driver";
type SetupTab = "profile" | "platforms";
type OnboardingSection = "account" | "plan";
type StepOneField = "address" | "legalName" | "phone";
type AddressStatus = "idle" | "rate-limited" | "validated" | "validating";

interface OnboardingPlatform {
  colorHex: string;
  displayName: string;
  id: number;
  isCustom: boolean;
  selected: boolean;
  slug: string;
}

interface OnboardingResponse {
  availablePlatforms?: OnboardingPlatform[];
  emailPreferences?: {
    cadenceSummaryEnabled?: boolean;
    goalCelebrationEnabled?: boolean;
    inactivityNudgeEnabled?: boolean;
    onboardingOfferEnabled?: boolean;
    onboardingTipsEnabled?: boolean;
    quarterlyTaxReminderEnabled?: boolean;
    tipReminderEnabled?: boolean;
    tripVerificationReminderEnabled?: boolean;
  };
  verificationProfile?: {
    address?: string;
    legalName?: string;
    phone?: string;
  };
  selectedPlatforms?: OnboardingPlatform[];
  subscription?: {
    billingInterval?: BillingInterval | null;
    planTier?: PlanTier;
    status?: string;
  };
  pricingPlans?: OnboardingPricingPlan[];
  user?: {
    email?: string;
    isOnboarded?: boolean;
    locationText?: string | null;
    name?: string;
    timezone?: string;
    weekStartsOn?: WeekStartsOn;
  };
}

interface OnboardingPricingPlan {
  aiCreditLimit: number | null;
  billingInterval: BillingInterval | null;
  bulkBatchLimit: number | null;
  bulkMaxImagesPerBatch: number | null;
  currencyCode: string;
  description: string;
  displayName: string;
  features: string[];
  isActive: boolean;
  planTier: PlanTier;
  priceCents: number;
  slug: string;
  sortOrder: number;
}

const DEFAULT_SELECTED_SLUGS = [
  "walmart_spark",
  "uber_eats",
  "uber",
  "lyft",
  "doordash",
  "amazon_flex",
];

const DEFAULT_CUSTOM_COLOR = "#22c55e";
const EMPTY_FIELD_ERRORS: Record<StepOneField, string> = {
  address: "",
  legalName: "",
  phone: "",
};

const DEFAULT_ONBOARDING_EMAIL_PREFERENCES = {
  cadenceSummaryEnabled: false,
  goalCelebrationEnabled: true,
  inactivityNudgeEnabled: true,
  onboardingOfferEnabled: true,
  onboardingTipsEnabled: true,
  quarterlyTaxReminderEnabled: true,
  tipReminderEnabled: true,
  tripVerificationReminderEnabled: false,
} as const;

const ONBOARDING_EMAIL_OPTIONS = [
  {
    description: "Recaps based on the stub cadence you choose.",
    key: "cadenceSummaryEnabled",
    label: "Cadence summaries",
  },
  {
    description: "A heads-up when tips still need to be verified.",
    key: "tipReminderEnabled",
    label: "Tip verification reminders",
  },
  {
    description: "A weekly digest when trip mileage still needs review.",
    key: "tripVerificationReminderEnabled",
    label: "Trip verification digest",
  },
  {
    description: "Celebrate closed weeks when you hit your earnings goal.",
    key: "goalCelebrationEnabled",
    label: "Goal celebrations",
  },
  {
    description: "Helpful nudges if logging slows down.",
    key: "inactivityNudgeEnabled",
    label: "Inactivity nudges",
  },
  {
    description: "Feature tips for getting the most out of screenshots and AI.",
    key: "onboardingTipsEnabled",
    label: "Getting started tips",
  },
  {
    description: "Quarterly reminders to review and log tax miles.",
    key: "quarterlyTaxReminderEnabled",
    label: "Quarterly mileage reminders",
  },
] as const;

type EmailPreferenceKey = (typeof ONBOARDING_EMAIL_OPTIONS)[number]["key"];

const PLAN_FEATURE_LABELS: Record<string, string> = {
  ai_analysis: "AI screenshot analysis",
  basic_dashboard: "Core earnings dashboard",
  bulk_upload: "Bulk screenshot uploads",
  exports: "Export tools",
  full_analytics: "Full earnings analytics",
  image_attachment: "Image and receipt attachments",
  manual_entry: "Manual delivery logging",
  mid_analytics: "Mid-level analytics",
  priority_queue: "Priority processing",
  tax_tools: "Tax-ready tools",
};

const normalizeHexColor = (value: string, fallback = DEFAULT_CUSTOM_COLOR) => {
  const normalized = value.trim();
  const prefixed = normalized.startsWith("#") ? normalized : `#${normalized}`;

  if (!/^#(?<hex>[0-9a-fA-F]{6})$/u.test(prefixed)) {
    return fallback;
  }

  return prefixed.toLowerCase();
};

const slugifyCustomPlatformName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .slice(0, 48);

const detectTimezone = () => {
  if (typeof Intl === "undefined") {
    return "UTC";
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const formatPrice = (priceCents: number, currencyCode: string) =>
  new Intl.NumberFormat("en-US", {
    currency: currencyCode || "USD",
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(priceCents / 100);

function buildPlanHighlights(plan: OnboardingPricingPlan) {
  const aiCredits =
    plan.aiCreditLimit === null
      ? "Unlimited AI credits"
      : `${plan.aiCreditLimit} AI credits`;
  const intervalLabel = plan.billingInterval === "year" ? "yearly" : "monthly";
  const bulkUploads =
    plan.bulkBatchLimit === null
      ? "Unlimited bulk uploads"
      : plan.bulkBatchLimit === 0
        ? "Manual logging and receipt uploads"
        : `${plan.bulkBatchLimit} bulk upload batches`;
  const batchSize =
    plan.bulkMaxImagesPerBatch === null
      ? "Unlimited images per batch"
      : `${plan.bulkMaxImagesPerBatch} images per batch`;

  const featureHighlights = plan.features
    .map((feature) => PLAN_FEATURE_LABELS[feature] || feature)
    .filter((feature, index, values) => values.indexOf(feature) === index)
    .slice(0, 2);

  return [
    `${aiCredits} ${intervalLabel}`,
    bulkUploads,
    batchSize,
    ...featureHighlights,
  ].slice(0, 4);
}

function buildInitialPlatforms(
  availablePlatforms: OnboardingPlatform[] | undefined,
  selectedPlatforms: OnboardingPlatform[] | undefined
): OnboardingPlatform[] {
  const available = [...(availablePlatforms || [])];
  const selected = selectedPlatforms || [];
  const selectedBySlug = new Map(
    selected.map((platform) => [platform.slug, platform])
  );

  const withSelections = available.map((platform) => {
    const selectedPlatform = selectedBySlug.get(platform.slug);

    return {
      ...platform,
      colorHex: normalizeHexColor(
        selectedPlatform?.colorHex || platform.colorHex
      ),
      selected: Boolean(selectedPlatform),
    };
  });

  if (selected.length === 0 && withSelections.length > 0) {
    const preselected = new Set(DEFAULT_SELECTED_SLUGS);

    for (const platform of withSelections) {
      if (preselected.has(platform.slug)) {
        platform.selected = true;
      }
    }

    if (!withSelections.some((platform) => platform.selected)) {
      const [firstPlatform] = withSelections;

      if (firstPlatform) {
        firstPlatform.selected = true;
      }
    }
  }

  return withSelections;
}

function validateStepOneField(field: StepOneField, value: string) {
  const getMessage = (success: boolean, message?: string) =>
    success ? "" : message || "Enter a valid value";

  switch (field) {
    case "legalName": {
      const result = legalNameSchema.safeParse(value);
      return getMessage(result.success, result.error?.issues[0]?.message);
    }
    case "phone": {
      const result = phoneSchema.safeParse(value);
      return getMessage(result.success, result.error?.issues[0]?.message);
    }
    case "address": {
      const result = addressSchema.safeParse(value);
      return getMessage(result.success, result.error?.issues[0]?.message);
    }
    default: {
      return "";
    }
  }
}

function PricingCard({
  billingInterval,
  isSelected,
  onSelect,
  plan,
  savingsLabel,
}: {
  billingInterval: BillingInterval;
  isSelected: boolean;
  onSelect: () => void;
  plan: OnboardingPricingPlan;
  savingsLabel: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex h-full flex-col rounded-[1.75rem] border p-6 text-left transition-all duration-200",
        isSelected
          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(57,255,20,0.2),0_30px_70px_-40px_rgba(57,255,20,0.8)]"
          : "border-border/60 bg-card/70 hover:border-primary/30 hover:bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.22em] uppercase">
            {plan.displayName}
          </p>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-foreground text-4xl font-extrabold tracking-tight">
              {formatPrice(plan.priceCents, plan.currencyCode)}
            </span>
            <span className="text-muted-foreground pb-1 text-sm font-medium">
              /{billingInterval === "year" ? "year" : "month"}
            </span>
          </div>
        </div>
        {isSelected ? (
          <span className="border-primary/40 bg-primary/15 text-primary inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold">
            Selected
          </span>
        ) : null}
      </div>

      {billingInterval === "year" && savingsLabel ? (
        <p className="text-primary mt-3 text-xs font-semibold tracking-[0.18em] uppercase">
          {savingsLabel}
        </p>
      ) : null}

      <p className="text-muted-foreground mt-4 text-sm leading-6">
        {plan.description}
      </p>

      <ul className="text-foreground/90 mt-6 space-y-3 text-sm">
        {buildPlanHighlights(plan).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

interface OnboardingFormProps {
  checkoutSuccess: boolean;
}

export function OnboardingForm({ checkoutSuccess }: OnboardingFormProps) {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [openSection, setOpenSection] = useState<OnboardingSection>("account");
  const [setupTab, setSetupTab] = useState<SetupTab>("profile");
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>("sunday");
  const [timezone, setTimezone] = useState(() => detectTimezone());
  const [locationText, setLocationText] = useState("");
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [platforms, setPlatforms] = useState<OnboardingPlatform[]>([]);
  const [customPlatformName, setCustomPlatformName] = useState("");
  const [customPlatformColor, setCustomPlatformColor] =
    useState(DEFAULT_CUSTOM_COLOR);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("starter");
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isRedirectingCheckout, setIsRedirectingCheckout] = useState(false);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressStatus, setAddressStatus] = useState<AddressStatus>("idle");
  const [cadenceSummaryEnabled, setCadenceSummaryEnabled] = useState(false);
  const [goalCelebrationEnabled, setGoalCelebrationEnabled] = useState(true);
  const [inactivityNudgeEnabled, setInactivityNudgeEnabled] = useState(true);
  const [onboardingOfferEnabled, setOnboardingOfferEnabled] = useState(true);
  const [onboardingTipsEnabled, setOnboardingTipsEnabled] = useState(true);
  const [quarterlyTaxReminderEnabled, setQuarterlyTaxReminderEnabled] =
    useState(true);
  const [tipReminderEnabled, setTipReminderEnabled] = useState(true);
  const [tripVerificationReminderEnabled, setTripVerificationReminderEnabled] =
    useState(false);
  const [fieldErrors, setFieldErrors] =
    useState<Record<StepOneField, string>>(EMPTY_FIELD_ERRORS);

  const onboardingQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/onboarding");
      if (!response.ok) {
        throw new Error("Failed to load onboarding state");
      }

      return (await response.json()) as OnboardingResponse;
    },
    queryKey: ["onboarding-state"],
    refetchInterval: checkoutSuccess ? 3000 : false,
  });

  useEffect(() => {
    const user = onboardingQuery.data?.user;
    if (user?.isOnboarded) {
      navigate({ to: "/dashboard" });
    }
  }, [navigate, onboardingQuery.data?.user]);

  // Hydrate form state from the server snapshot. Following the React
  // "adjust state when inputs change" pattern: derive during render and
  // update synchronously, guarded so it only re-runs when the snapshot or
  // checkout status changes.
  const [hydrationInputs, setHydrationInputs] = useState({
    checkoutSuccess,
    data: onboardingQuery.data,
  });
  const hydrationChanged =
    hydrationInputs.data !== onboardingQuery.data ||
    hydrationInputs.checkoutSuccess !== checkoutSuccess;

  if (hydrationChanged) {
    setHydrationInputs({
      checkoutSuccess,
      data: onboardingQuery.data,
    });
    hydrateFromSnapshot();
  }

  function hydrateFromSnapshot() {
    if (!onboardingQuery.data?.user) {
      return;
    }

    const { user } = onboardingQuery.data;
    if (user.timezone) {
      setTimezone(user.timezone);
    }

    const { emailPreferences } = onboardingQuery.data;
    setCadenceSummaryEnabled(
      emailPreferences?.cadenceSummaryEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.cadenceSummaryEnabled
    );
    setGoalCelebrationEnabled(
      emailPreferences?.goalCelebrationEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.goalCelebrationEnabled
    );
    setInactivityNudgeEnabled(
      emailPreferences?.inactivityNudgeEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.inactivityNudgeEnabled
    );
    setOnboardingOfferEnabled(
      emailPreferences?.onboardingOfferEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.onboardingOfferEnabled
    );
    setOnboardingTipsEnabled(
      emailPreferences?.onboardingTipsEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.onboardingTipsEnabled
    );
    setQuarterlyTaxReminderEnabled(
      emailPreferences?.quarterlyTaxReminderEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.quarterlyTaxReminderEnabled
    );
    setTipReminderEnabled(
      emailPreferences?.tipReminderEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.tipReminderEnabled
    );
    setTripVerificationReminderEnabled(
      emailPreferences?.tripVerificationReminderEnabled ??
        DEFAULT_ONBOARDING_EMAIL_PREFERENCES.tripVerificationReminderEnabled
    );

    if (user.locationText) {
      setLocationText(user.locationText);
    }
    if (onboardingQuery.data.verificationProfile?.legalName || user.name) {
      setLegalName(
        onboardingQuery.data.verificationProfile?.legalName || user.name || ""
      );
    }
    if (onboardingQuery.data.verificationProfile?.phone) {
      setPhone(onboardingQuery.data.verificationProfile.phone);
    }
    if (onboardingQuery.data.verificationProfile?.address) {
      setAddress(onboardingQuery.data.verificationProfile.address);
    }

    setWeekStartsOn(getWeekStartsOn(user.weekStartsOn, "sunday"));
    setPlatforms(
      buildInitialPlatforms(
        onboardingQuery.data.availablePlatforms,
        onboardingQuery.data.selectedPlatforms
      )
    );

    const { subscription } = onboardingQuery.data;
    if (
      subscription?.planTier &&
      (subscription.planTier === "starter" ||
        subscription.planTier === "driver" ||
        subscription.planTier === "pro_driver")
    ) {
      setSelectedPlan(subscription.planTier);
      setBillingInterval(subscription.billingInterval || "month");
      setStep(2);
      setOpenSection("plan");
    }

    if (checkoutSuccess) {
      setInfoMessage(
        "Finishing your plan activation. This page will continue automatically once billing is confirmed."
      );
      setStep(2);
      setOpenSection("plan");
    }
  }

  const selectedCount = useMemo(
    () => platforms.filter((platform) => platform.selected).length,
    [platforms]
  );

  const pricingPlans = useMemo(() => {
    const plans = onboardingQuery.data?.pricingPlans || [];
    if (plans.length > 0) {
      return [...plans].sort((left, right) => left.sortOrder - right.sortOrder);
    }

    return [] as OnboardingPricingPlan[];
  }, [onboardingQuery.data?.pricingPlans]);

  const visiblePlans = useMemo(
    () => getOnboardingVisiblePlans(pricingPlans, billingInterval),
    [billingInterval, pricingPlans]
  );

  const [planSelectionInputs, setPlanSelectionInputs] = useState({
    billingInterval,
    selectedPlan,
  });
  if (
    planSelectionInputs.billingInterval !== billingInterval ||
    planSelectionInputs.selectedPlan !== selectedPlan
  ) {
    setPlanSelectionInputs({ billingInterval, selectedPlan });
    if (billingInterval === "year" && selectedPlan === "starter") {
      setSelectedPlan("driver");
    }
  }

  const selectedPlanConfig = useMemo(
    () =>
      pricingPlans.find(
        (plan) =>
          plan.planTier === selectedPlan &&
          plan.billingInterval === billingInterval
      ),
    [billingInterval, pricingPlans, selectedPlan]
  );

  const selectedPlanName = selectedPlanConfig?.displayName || "Selected Plan";

  const emailPreferenceState: Record<EmailPreferenceKey, boolean> = useMemo(
    () => ({
      cadenceSummaryEnabled,
      goalCelebrationEnabled,
      inactivityNudgeEnabled,
      onboardingTipsEnabled,
      quarterlyTaxReminderEnabled,
      tipReminderEnabled,
      tripVerificationReminderEnabled,
    }),
    [
      cadenceSummaryEnabled,
      goalCelebrationEnabled,
      inactivityNudgeEnabled,
      onboardingTipsEnabled,
      quarterlyTaxReminderEnabled,
      tipReminderEnabled,
      tripVerificationReminderEnabled,
    ]
  );

  const setEmailPreference = (key: EmailPreferenceKey, value: boolean) => {
    switch (key) {
      case "cadenceSummaryEnabled": {
        setCadenceSummaryEnabled(value);
        break;
      }
      case "goalCelebrationEnabled": {
        setGoalCelebrationEnabled(value);
        break;
      }
      case "inactivityNudgeEnabled": {
        setInactivityNudgeEnabled(value);
        break;
      }
      case "onboardingTipsEnabled": {
        setOnboardingTipsEnabled(value);
        break;
      }
      case "quarterlyTaxReminderEnabled": {
        setQuarterlyTaxReminderEnabled(value);
        break;
      }
      case "tipReminderEnabled": {
        setTipReminderEnabled(value);
        break;
      }
      case "tripVerificationReminderEnabled": {
        setTripVerificationReminderEnabled(value);
        break;
      }
      default: {
        break;
      }
    }
  };

  const saveSetupMutation = useMutation({
    mutationFn: async (values: { verificationAddress: string }) => {
      const selectedPlatforms = platforms
        .filter((platform) => platform.selected)
        .map((platform) => ({
          colorHex: normalizeHexColor(platform.colorHex),
          displayName: platform.isCustom ? platform.displayName : undefined,
          slug: platform.slug,
        }));

      if (selectedPlatforms.length === 0) {
        throw new Error("Select at least one platform to continue.");
      }

      const response = await apiFetch("/api/onboarding", {
        body: JSON.stringify({
          emailPreferences: {
            cadenceSummaryEnabled,
            goalCelebrationEnabled,
            inactivityNudgeEnabled,
            onboardingOfferEnabled,
            onboardingTipsEnabled,
            quarterlyTaxReminderEnabled,
            tipReminderEnabled,
            tripVerificationReminderEnabled,
          },
          locationText: locationText.trim() || undefined,
          platformSelections: selectedPlatforms,
          timezone,
          verificationProfile: {
            address: values.verificationAddress,
            legalName: legalName.trim(),
            phone: phone.trim(),
          },
          weekStartsOn,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save onboarding settings");
      }
    },
  });

  const selectPlanMutation = useMutation({
    mutationFn: async (plan: {
      billingInterval?: BillingInterval;
      planTier: PlanTier;
    }) => {
      const response = await apiFetch("/api/onboarding", {
        body: JSON.stringify(plan),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        completed?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save plan selection");
      }

      return payload;
    },
  });

  const setFieldError = (field: StepOneField, message: string) => {
    setFieldErrors((current) => ({
      ...current,
      [field]: message,
    }));
  };

  const validateProfileFields = () => {
    const nextErrors: Record<StepOneField, string> = {
      address: validateStepOneField("address", address),
      legalName: validateStepOneField("legalName", legalName),
      phone: validateStepOneField("phone", phone),
    };

    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((value) => value.length === 0);
  };

  const handleContinueToPlatforms = () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!validateProfileFields()) {
      return;
    }

    setSetupTab("platforms");
  };

  const runAddressValidation = async (
    value: string,
    options?: { silentRateLimit?: boolean }
  ) => {
    const localError = validateStepOneField("address", value);
    if (localError) {
      setFieldError("address", localError);
      setAddressStatus("idle");
      return null;
    }

    try {
      setAddressStatus("validating");
      const validation = await validateVerificationAddress(value);

      if (!validation.address) {
        setFieldError(
          "address",
          "Enter a full street address so GigStax can verify your tax profile."
        );
        setAddressStatus("idle");
        return null;
      }

      setAddress(validation.address);
      setLocationText(validation.locationText || "");
      setFieldError("address", "");

      if (validation.rateLimited) {
        setAddressStatus("rate-limited");
        if (!options?.silentRateLimit) {
          setInfoMessage(
            "Radar is rate limited right now, so GigStax will save the address exactly as you typed it."
          );
        }
      } else if (validation.validated) {
        setAddressStatus("validated");
      } else {
        setAddressStatus("idle");
      }

      return validation;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to validate the verification address right now.";
      setFieldError("address", message);
      setAddressStatus("idle");
      return null;
    }
  };

  const handleAddressBlur = async () => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setFieldError("address", validateStepOneField("address", address));
      setAddressStatus("idle");
      return;
    }

    await runAddressValidation(trimmedAddress, { silentRateLimit: true });
  };

  const handleContinueToPlan = async () => {
    setErrorMessage("");
    setInfoMessage("");

    const isProfileValid = validateProfileFields();
    if (!isProfileValid) {
      setSetupTab("profile");
      setOpenSection("account");
      return;
    }

    if (selectedCount === 0) {
      setSetupTab("platforms");
      setErrorMessage("Select at least one platform to continue.");
      return;
    }

    try {
      setIsValidatingAddress(true);
      const validation = await runAddressValidation(address.trim());
      if (!validation?.address) {
        setSetupTab("profile");
        setOpenSection("account");
        return;
      }

      await saveSetupMutation.mutateAsync({
        verificationAddress: validation.address,
      });
      setStep(2);
      setOpenSection("plan");
      setInfoMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to continue."
      );
      setOpenSection("account");
    }
    setIsValidatingAddress(false);
  };

  const handlePlanSubmit = async () => {
    setErrorMessage("");
    setInfoMessage("");

    try {
      const result = await selectPlanMutation.mutateAsync({
        billingInterval,
        planTier: selectedPlan,
      });

      // The onboarding API never returned a `redirectTo` payload, so a
      // completed flow always lands on the dashboard.
      if (result.completed) {
        navigate({ to: "/dashboard" });
        return;
      }

      if (result.checkoutUrl) {
        setIsRedirectingCheckout(true);
        window.location.assign(result.checkoutUrl);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding."
      );
    }
  };

  const togglePlatform = (slug: string) => {
    setPlatforms((current) =>
      current.map((platform) =>
        platform.slug === slug
          ? { ...platform, selected: !platform.selected }
          : platform
      )
    );
  };

  const updatePlatformColor = (slug: string, colorHex: string) => {
    setPlatforms((current) =>
      current.map((platform) =>
        platform.slug === slug
          ? { ...platform, colorHex: normalizeHexColor(colorHex) }
          : platform
      )
    );
  };

  const removeCustomPlatform = (slug: string) => {
    setPlatforms((current) =>
      current.filter((platform) => platform.slug !== slug)
    );
  };

  const addCustomPlatform = () => {
    setErrorMessage("");

    const name = customPlatformName.trim();
    if (name.length < 2) {
      setErrorMessage("Custom platform name must be at least 2 characters.");
      return;
    }

    const baseSlug = slugifyCustomPlatformName(name);
    if (!baseSlug) {
      setErrorMessage("Use letters and numbers for custom platform names.");
      return;
    }

    setPlatforms((current) => {
      const alreadyExists = current.some(
        (platform) =>
          platform.displayName.toLowerCase() === name.toLowerCase() ||
          platform.slug.startsWith(baseSlug)
      );

      if (alreadyExists) {
        return current;
      }

      const nextPlatform: OnboardingPlatform = {
        colorHex: normalizeHexColor(customPlatformColor),
        displayName: name,
        id: -Date.now(),
        isCustom: true,
        selected: true,
        slug: `custom_${baseSlug}_${Date.now().toString(36)}`,
      };

      return [...current, nextPlatform];
    });

    setCustomPlatformName("");
    setCustomPlatformColor(DEFAULT_CUSTOM_COLOR);
  };

  const handleBillingIntervalChange = (nextInterval: BillingInterval) => {
    setBillingInterval(nextInterval);
    if (nextInterval === "year" && selectedPlan === "starter") {
      setSelectedPlan("driver");
    }
  };

  const { isLoading } = onboardingQuery;
  const isSaving =
    isValidatingAddress ||
    saveSetupMutation.isPending ||
    selectPlanMutation.isPending ||
    isRedirectingCheckout;

  return (
    <Card className="border-border/50 bg-card/90 w-full max-w-5xl overflow-hidden rounded-[2rem] shadow-[0_30px_120px_-60px_rgba(0,0,0,0.8)] backdrop-blur">
      <CardHeader className="border-border/50 space-y-3 border-b pb-7">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Welcome to GigStax
        </CardTitle>
        <CardDescription className="text-muted-foreground text-base">
          Set up your profile, choose your active platforms, and pick the plan
          that matches your route volume.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="border-border/60 bg-muted/20 text-muted-foreground mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading onboarding...
          </div>
        ) : null}

        {errorMessage ? (
          <div className="border-destructive/20 bg-destructive/10 text-destructive mb-4 rounded-xl border p-3 text-sm">
            {errorMessage}
          </div>
        ) : null}

        {infoMessage ? (
          <div className="border-primary/20 bg-primary/10 text-primary mb-4 rounded-xl border p-3 text-sm">
            {infoMessage}
          </div>
        ) : null}

        <Accordion
          type="single"
          collapsible
          value={openSection}
          onValueChange={(nextValue) => {
            if (nextValue === "account" || nextValue === "plan") {
              if (nextValue === "plan" && step === 1) {
                return;
              }

              setOpenSection(nextValue);
            }
          }}
          className="border-border/50 bg-background/70 overflow-hidden rounded-[1.75rem] border"
        >
          <AccordionItem value="account" className="border-border/40">
            <AccordionTrigger className="px-4 py-5 text-base font-semibold hover:no-underline sm:px-6">
              <span className="flex items-center gap-3">
                <span className="border-primary/30 bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold">
                  1
                </span>
                <span>
                  <span className="text-foreground block text-base font-semibold">
                    Account Setup
                  </span>
                  <span className="text-muted-foreground block text-sm font-normal">
                    Profile details, GigStax defaults, and active platforms.
                  </span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-6 sm:px-6">
              <Tabs
                value={setupTab}
                onValueChange={(value) => setSetupTab(value as SetupTab)}
                className="space-y-6"
              >
                <TabsList className="bg-muted/40 h-auto w-full justify-start rounded-2xl p-1">
                  <TabsTrigger
                    value="profile"
                    className="h-11 rounded-xl px-4 text-sm font-semibold"
                  >
                    Profile
                  </TabsTrigger>
                  <TabsTrigger
                    value="platforms"
                    className="h-11 rounded-xl px-4 text-sm font-semibold"
                  >
                    Platforms
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                    <div className="border-border/50 bg-card/70 space-y-4 rounded-[1.5rem] border p-5">
                      <div className="space-y-1">
                        <h3 className="text-foreground text-lg font-semibold">
                          Identity
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          Income stubs and tax summaries use this verification
                          profile.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="legal-name">Legal name</Label>
                          <Input
                            id="legal-name"
                            autoComplete="name"
                            placeholder="Your legal name"
                            value={legalName}
                            onBlur={() =>
                              setFieldError(
                                "legalName",
                                validateStepOneField("legalName", legalName)
                              )
                            }
                            onChange={(event) => {
                              setLegalName(event.target.value);
                              if (fieldErrors.legalName) {
                                setFieldError(
                                  "legalName",
                                  validateStepOneField(
                                    "legalName",
                                    event.target.value
                                  )
                                );
                              }
                            }}
                          />
                          {fieldErrors.legalName ? (
                            <p className="text-destructive text-xs">
                              {fieldErrors.legalName}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              Use the name you want on income stubs and
                              tax-ready records.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="verification-phone">Phone</Label>
                          <Input
                            id="verification-phone"
                            autoComplete="tel"
                            inputMode="tel"
                            placeholder="(555) 555-5555"
                            value={phone}
                            onBlur={() =>
                              setFieldError(
                                "phone",
                                validateStepOneField("phone", phone)
                              )
                            }
                            onChange={(event) => {
                              const nextValue = sanitizePhoneInput(
                                event.target.value
                              );
                              setPhone(nextValue);
                              if (fieldErrors.phone) {
                                setFieldError(
                                  "phone",
                                  validateStepOneField("phone", nextValue)
                                );
                              }
                            }}
                          />
                          {fieldErrors.phone ? (
                            <p className="text-destructive text-xs">
                              {fieldErrors.phone}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              Digits, spaces, parentheses, periods, and dashes
                              are allowed.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="verification-address">
                            Street address
                          </Label>
                          <Input
                            id="verification-address"
                            autoComplete="street-address"
                            placeholder="Street, City, State"
                            value={address}
                            onBlur={handleAddressBlur}
                            onChange={(event) => {
                              setAddress(event.target.value);
                              setAddressStatus("idle");
                              if (fieldErrors.address) {
                                setFieldError(
                                  "address",
                                  validateStepOneField(
                                    "address",
                                    event.target.value
                                  )
                                );
                              }
                            }}
                          />
                          {fieldErrors.address ? (
                            <p className="text-destructive text-xs">
                              {fieldErrors.address}
                            </p>
                          ) : addressStatus === "validated" ? (
                            <p className="text-primary text-xs">
                              Address verified by GigStax.
                            </p>
                          ) : addressStatus === "rate-limited" ? (
                            <p className="text-xs text-amber-400">
                              GigStax could not verify the address right now, so
                              it will be saved exactly as entered.
                            </p>
                          ) : addressStatus === "validating" ? (
                            <p className="text-muted-foreground text-xs">
                              Checking address with GigStax...
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              Use a full street address so trip and tax records
                              stay aligned.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-border/50 bg-card/70 space-y-4 rounded-[1.5rem] border p-5">
                      <div className="space-y-1">
                        <h3 className="text-foreground text-lg font-semibold">
                          Preferences
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          Calendar defaults and email updates for your account.
                        </p>
                      </div>

                      <div className="border-border/50 bg-background/60 space-y-3 rounded-xl border p-4">
                        <div className="space-y-2">
                          <Label htmlFor="week-start-select">
                            First day of the week
                          </Label>
                          <Select
                            value={weekStartsOn}
                            onValueChange={(value) =>
                              setWeekStartsOn(getWeekStartsOn(value, "sunday"))
                            }
                          >
                            <SelectTrigger
                              id="week-start-select"
                              className="h-11"
                            >
                              <SelectValue placeholder="Choose week start" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sunday">Sunday</SelectItem>
                              <SelectItem value="monday">Monday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="border-border/50 bg-muted/20 text-muted-foreground rounded-xl border p-3 text-xs">
                          Verification email:{" "}
                          <span className="text-foreground font-semibold">
                            {onboardingQuery.data?.user?.email ||
                              "Account email"}
                          </span>
                        </div>
                        <div className="border-border/50 bg-muted/20 text-muted-foreground rounded-xl border p-3 text-xs">
                          Timezone detected:{" "}
                          <span className="text-foreground font-semibold">
                            {timezone}
                          </span>
                        </div>
                        {locationText ? (
                          <div className="border-border/50 bg-muted/20 text-muted-foreground rounded-xl border p-3 text-xs">
                            Local context from GigStax:{" "}
                            <span className="text-foreground font-semibold">
                              {locationText}
                            </span>
                          </div>
                        ) : null}
                        <div className="border-border/50 bg-muted/20 space-y-3 rounded-xl border p-4">
                          <div className="space-y-1">
                            <p className="text-foreground text-sm font-semibold">
                              Email preferences
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Pick the product emails you want from the start.
                              You can change them later in settings.
                            </p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {ONBOARDING_EMAIL_OPTIONS.map((option) => {
                              const checkboxId = `onboarding-email-${option.key}`;

                              return (
                                <div
                                  key={option.key}
                                  className="border-border/50 bg-background/60 flex items-start justify-between gap-3 rounded-xl border px-3 py-3 text-sm"
                                >
                                  <Label
                                    htmlFor={checkboxId}
                                    className="space-y-1 pr-2"
                                  >
                                    <span className="text-foreground block font-medium">
                                      {option.label}
                                    </span>
                                    <span className="text-muted-foreground block text-xs leading-5">
                                      {option.description}
                                    </span>
                                  </Label>
                                  <Checkbox
                                    id={checkboxId}
                                    checked={emailPreferenceState[option.key]}
                                    onCheckedChange={(checked) =>
                                      setEmailPreference(
                                        option.key,
                                        checked === true
                                      )
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      className="h-12 rounded-xl px-6 font-semibold"
                      onClick={handleContinueToPlatforms}
                    >
                      Continue to Platforms
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="platforms" className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-foreground text-lg font-semibold">
                      Platforms you use
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Choose your active apps and set a color for each so your
                      dashboard stays split correctly.
                    </p>
                  </div>

                  <div
                    data-testid="onboarding-platform-grid"
                    className="grid grid-cols-2 gap-3 xl:grid-cols-3"
                  >
                    {platforms.map((platform) => (
                      <div
                        key={platform.slug}
                        className={cn(
                          "rounded-[1.35rem] border p-4 transition-colors",
                          platform.selected
                            ? "border-primary/50 bg-primary/8 shadow-[0_0_0_1px_rgba(57,255,20,0.12)]"
                            : "border-border/60 bg-card/70"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex min-w-0 flex-1 items-start gap-3">
                            <Checkbox
                              checked={platform.selected}
                              onCheckedChange={() =>
                                togglePlatform(platform.slug)
                              }
                              className="mt-0.5"
                            />
                            <span className="text-foreground min-w-0 text-sm font-semibold">
                              {platform.displayName}
                            </span>
                          </label>

                          {platform.isCustom ? (
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                removeCustomPlatform(platform.slug)
                              }
                              aria-label={`Remove ${platform.displayName}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-4 space-y-2">
                          <span className="text-muted-foreground text-xs font-medium">
                            Color
                          </span>
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              value={normalizeHexColor(platform.colorHex)}
                              onChange={(event) =>
                                updatePlatformColor(
                                  platform.slug,
                                  event.target.value
                                )
                              }
                              className="border-border/60 h-10 w-14 rounded-lg p-1"
                              disabled={!platform.selected}
                            />
                            <span className="text-muted-foreground text-xs">
                              {normalizeHexColor(platform.colorHex)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-border/60 bg-card/70 rounded-[1.5rem] border p-4">
                    <p className="text-foreground mb-3 text-sm font-semibold">
                      Add a custom platform
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[1fr,92px,auto]">
                      <Input
                        placeholder="e.g. Curri, Favor, Veho"
                        value={customPlatformName}
                        onChange={(event) =>
                          setCustomPlatformName(event.target.value)
                        }
                      />
                      <Input
                        type="color"
                        value={customPlatformColor}
                        onChange={(event) =>
                          setCustomPlatformColor(
                            normalizeHexColor(event.target.value)
                          )
                        }
                        className="h-11 w-full p-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl"
                        onClick={addCustomPlatform}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-xs">
                      {selectedCount} platform{selectedCount === 1 ? "" : "s"}{" "}
                      selected
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 rounded-xl px-6"
                        onClick={() => setSetupTab("profile")}
                      >
                        Back to Profile
                      </Button>
                      <Button
                        type="button"
                        className="h-12 rounded-xl px-6 font-semibold"
                        onClick={handleContinueToPlan}
                        disabled={isSaving}
                      >
                        {isValidatingAddress
                          ? "Validating address..."
                          : saveSetupMutation.isPending
                            ? "Saving..."
                            : "Continue to Plan"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="plan" className="border-border/40">
            <AccordionTrigger
              className="px-4 py-5 text-base font-semibold hover:no-underline sm:px-6"
              disabled={step === 1}
            >
              <span className="flex items-center gap-3">
                <span className="border-primary/30 bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold">
                  2
                </span>
                <span>
                  <span className="text-foreground block text-base font-semibold">
                    Plan & Billing
                  </span>
                  <span className="text-muted-foreground block text-sm font-normal">
                    Pick monthly or annual billing and continue to Polar
                    checkout.
                  </span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-6 sm:px-6">
              <div className="space-y-6">
                <div className="border-border/60 bg-card/70 flex flex-col gap-4 rounded-[1.5rem] border p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-primary text-sm font-semibold tracking-[0.16em] uppercase">
                      Billing cadence
                    </p>
                    <h3 className="text-foreground mt-2 text-2xl font-bold tracking-tight">
                      Choose the plan that matches your routes
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
                      Start with Starter if you want lightweight tracking.
                      Switch to annual billing when you want the lower effective
                      rate on Driver or Pro Driver.
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-2 lg:items-end">
                    <div className="border-border/60 bg-muted/30 inline-flex rounded-full border p-1">
                      <button
                        type="button"
                        className={cn(
                          "rounded-full px-4 py-2 text-sm font-semibold transition",
                          billingInterval === "month"
                            ? "bg-primary text-primary-foreground shadow-[0_0_18px_-8px_rgba(57,255,20,0.8)]"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => handleBillingIntervalChange("month")}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded-full px-4 py-2 text-sm font-semibold transition",
                          billingInterval === "year"
                            ? "bg-primary text-primary-foreground shadow-[0_0_18px_-8px_rgba(57,255,20,0.8)]"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => handleBillingIntervalChange("year")}
                      >
                        Annual
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  data-testid="onboarding-plan-grid"
                  className={cn(
                    "grid gap-4",
                    visiblePlans.length >= 3
                      ? "xl:grid-cols-3"
                      : "lg:grid-cols-2"
                  )}
                >
                  {visiblePlans.map((plan) => (
                    <PricingCard
                      key={plan.slug}
                      billingInterval={billingInterval}
                      isSelected={selectedPlan === plan.planTier}
                      onSelect={() => setSelectedPlan(plan.planTier)}
                      plan={plan}
                      savingsLabel={getAnnualSavingsLabel(pricingPlans, plan)}
                    />
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-[auto,1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl px-6"
                    onClick={() => {
                      setOpenSection("account");
                      setSetupTab("platforms");
                    }}
                    disabled={isSaving}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-12 rounded-xl px-6 font-semibold"
                    disabled={isSaving || !selectedPlanConfig}
                    onClick={handlePlanSubmit}
                  >
                    {isRedirectingCheckout
                      ? "Redirecting..."
                      : `Checkout ${selectedPlanName}`}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
