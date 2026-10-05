import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  dashboardPageMainNarrowClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { validateVerificationAddress } from "@/lib/radar/verification-address";
import { getWeekStartsOn } from "@/lib/week";

type WeekStartsOn = "monday" | "sunday";

interface SettingsPlatform {
  colorHex: string;
  displayName: string;
  id: number;
  isCustom: boolean;
  selected: boolean;
  slug: string;
}

interface SettingsResponse {
  availablePlatforms?: SettingsPlatform[];
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
  selectedPlatforms?: SettingsPlatform[];
  verificationProfile?: {
    address?: string;
    legalName?: string;
    phone?: string;
  };
  user?: {
    email?: string;
    name?: string;
    timezone?: string;
    weekStartsOn?: unknown;
  };
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

const EMAIL_PREFERENCE_OPTIONS = [
  {
    description: "Period recaps based on your selected stub cadence.",
    key: "cadenceSummaryEnabled",
    label: "Cadence summaries",
  },
  {
    description: "Celebrate closed weeks when you hit your goal.",
    key: "goalCelebrationEnabled",
    label: "Goal celebrations",
  },
  {
    description: "Prompts when pending tips still need final values.",
    key: "tipReminderEnabled",
    label: "Tip verification reminders",
  },
  {
    description: "Helpful nudges when logging activity slows down.",
    key: "inactivityNudgeEnabled",
    label: "Inactivity nudges",
  },
  {
    description: "Feature tips for better screenshot and AI workflows.",
    key: "onboardingTipsEnabled",
    label: "Getting started tips",
  },
  {
    description: "Optional weekly backlog reminder for mileage logging.",
    key: "tripVerificationReminderEnabled",
    label: "Weekly trip verification digest",
  },
  {
    description: "Quarterly prompts to review and log tax miles.",
    key: "quarterlyTaxReminderEnabled",
    label: "Quarterly mileage reminders",
  },
] as const;

type EmailPreferenceKey = (typeof EMAIL_PREFERENCE_OPTIONS)[number]["key"];

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

const buildInitialPlatforms = (
  availablePlatforms: SettingsPlatform[] | undefined,
  selectedPlatforms: SettingsPlatform[] | undefined
) => {
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
      withSelections[0].selected = true;
    }
  }

  return withSelections;
};

const buildPlatformSelections = (platforms: SettingsPlatform[]) =>
  platforms
    .filter((platform) => platform.selected)
    .map((platform) => ({
      colorHex: normalizeHexColor(platform.colorHex),
      displayName: platform.isCustom ? platform.displayName : undefined,
      slug: platform.slug,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));

const buildPreferencesSnapshot = (args: {
  address: string;
  cadenceSummaryEnabled: boolean;
  goalCelebrationEnabled: boolean;
  inactivityNudgeEnabled: boolean;
  legalName: string;
  onboardingOfferEnabled: boolean;
  onboardingTipsEnabled: boolean;
  platforms: SettingsPlatform[];
  phone: string;
  quarterlyTaxReminderEnabled: boolean;
  tipReminderEnabled: boolean;
  tripVerificationReminderEnabled: boolean;
  timezone: string;
  weekStartsOn: WeekStartsOn;
}) =>
  JSON.stringify({
    emailPreferences: {
      cadenceSummaryEnabled: args.cadenceSummaryEnabled,
      goalCelebrationEnabled: args.goalCelebrationEnabled,
      inactivityNudgeEnabled: args.inactivityNudgeEnabled,
      onboardingOfferEnabled: args.onboardingOfferEnabled,
      onboardingTipsEnabled: args.onboardingTipsEnabled,
      quarterlyTaxReminderEnabled: args.quarterlyTaxReminderEnabled,
      tipReminderEnabled: args.tipReminderEnabled,
      tripVerificationReminderEnabled: args.tripVerificationReminderEnabled,
    },
    platformSelections: buildPlatformSelections(args.platforms),
    timezone: args.timezone.trim(),
    verificationProfile: {
      address: args.address.trim(),
      legalName: args.legalName.trim(),
      phone: args.phone.trim(),
    },
    weekStartsOn: args.weekStartsOn,
  });

export function SettingsPageClient() {
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>("sunday");
  const [timezone, setTimezone] = useState("UTC");
  const [accountEmail, setAccountEmail] = useState("");
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [platforms, setPlatforms] = useState<SettingsPlatform[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [customPlatformName, setCustomPlatformName] = useState("");
  const [customPlatformColor, setCustomPlatformColor] =
    useState(DEFAULT_CUSTOM_COLOR);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [cadenceSummaryEnabled, setCadenceSummaryEnabled] = useState(false);
  const [goalCelebrationEnabled, setGoalCelebrationEnabled] = useState(true);
  const [tipReminderEnabled, setTipReminderEnabled] = useState(true);
  const [inactivityNudgeEnabled, setInactivityNudgeEnabled] = useState(true);
  const [onboardingOfferEnabled, setOnboardingOfferEnabled] = useState(true);
  const [onboardingTipsEnabled, setOnboardingTipsEnabled] = useState(true);
  const [quarterlyTaxReminderEnabled, setQuarterlyTaxReminderEnabled] =
    useState(true);
  const [tripVerificationReminderEnabled, setTripVerificationReminderEnabled] =
    useState(false);

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
      case "tipReminderEnabled": {
        setTipReminderEnabled(value);
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
      case "tripVerificationReminderEnabled": {
        setTripVerificationReminderEnabled(value);
        break;
      }
      case "quarterlyTaxReminderEnabled": {
        setQuarterlyTaxReminderEnabled(value);
        break;
      }
      default: {
        break;
      }
    }
  };

  const selectedCount = useMemo(
    () => platforms.filter((platform) => platform.selected).length,
    [platforms]
  );
  const hasChanges = useMemo(() => {
    if (!savedSnapshot) {
      return false;
    }

    return (
      buildPreferencesSnapshot({
        address,
        cadenceSummaryEnabled,
        goalCelebrationEnabled,
        inactivityNudgeEnabled,
        legalName,
        onboardingOfferEnabled,
        onboardingTipsEnabled,
        phone,
        platforms,
        quarterlyTaxReminderEnabled,
        timezone,
        tipReminderEnabled,
        tripVerificationReminderEnabled,
        weekStartsOn,
      }) !== savedSnapshot
    );
  }, [
    address,
    cadenceSummaryEnabled,
    goalCelebrationEnabled,
    inactivityNudgeEnabled,
    legalName,
    onboardingOfferEnabled,
    onboardingTipsEnabled,
    phone,
    platforms,
    quarterlyTaxReminderEnabled,
    savedSnapshot,
    tipReminderEnabled,
    tripVerificationReminderEnabled,
    timezone,
    weekStartsOn,
  ]);

  const { isLoading } = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/user");
      if (!response.ok) {
        throw new Error("Failed to load profile");
      }

      const payload = (await response.json()) as SettingsResponse;
      const nextWeekStartsOn = getWeekStartsOn(
        payload.user?.weekStartsOn,
        "sunday"
      );
      const nextTimezone = payload.user?.timezone || "UTC";
      const nextPlatforms = buildInitialPlatforms(
        payload.availablePlatforms,
        payload.selectedPlatforms
      );
      const nextLegalName =
        payload.verificationProfile?.legalName || payload.user?.name || "";
      const nextPhone = payload.verificationProfile?.phone || "";
      const nextAddress = payload.verificationProfile?.address || "";
      const nextAccountEmail = payload.user?.email || "";
      const nextCadenceSummaryEnabled =
        payload.emailPreferences?.cadenceSummaryEnabled === true;
      const nextGoalCelebrationEnabled =
        payload.emailPreferences?.goalCelebrationEnabled ?? true;
      const nextTipReminderEnabled =
        payload.emailPreferences?.tipReminderEnabled ?? true;
      const nextInactivityNudgeEnabled =
        payload.emailPreferences?.inactivityNudgeEnabled ?? true;
      const nextOnboardingOfferEnabled =
        payload.emailPreferences?.onboardingOfferEnabled ?? true;
      const nextOnboardingTipsEnabled =
        payload.emailPreferences?.onboardingTipsEnabled ?? true;
      const nextQuarterlyTaxReminderEnabled =
        payload.emailPreferences?.quarterlyTaxReminderEnabled ?? true;
      const nextTripVerificationReminderEnabled =
        payload.emailPreferences?.tripVerificationReminderEnabled ?? false;
      setWeekStartsOn(nextWeekStartsOn);
      setTimezone(nextTimezone);
      setAccountEmail(nextAccountEmail);
      setLegalName(nextLegalName);
      setPhone(nextPhone);
      setAddress(nextAddress);
      setCadenceSummaryEnabled(nextCadenceSummaryEnabled);
      setGoalCelebrationEnabled(nextGoalCelebrationEnabled);
      setTipReminderEnabled(nextTipReminderEnabled);
      setInactivityNudgeEnabled(nextInactivityNudgeEnabled);
      setOnboardingOfferEnabled(nextOnboardingOfferEnabled);
      setOnboardingTipsEnabled(nextOnboardingTipsEnabled);
      setQuarterlyTaxReminderEnabled(nextQuarterlyTaxReminderEnabled);
      setTripVerificationReminderEnabled(nextTripVerificationReminderEnabled);
      setPlatforms(nextPlatforms);
      setSavedSnapshot(
        buildPreferencesSnapshot({
          address: nextAddress,
          cadenceSummaryEnabled: nextCadenceSummaryEnabled,
          goalCelebrationEnabled: nextGoalCelebrationEnabled,
          inactivityNudgeEnabled: nextInactivityNudgeEnabled,
          legalName: nextLegalName,
          onboardingOfferEnabled: nextOnboardingOfferEnabled,
          onboardingTipsEnabled: nextOnboardingTipsEnabled,
          phone: nextPhone,
          platforms: nextPlatforms,
          quarterlyTaxReminderEnabled: nextQuarterlyTaxReminderEnabled,
          timezone: nextTimezone,
          tipReminderEnabled: nextTipReminderEnabled,
          tripVerificationReminderEnabled: nextTripVerificationReminderEnabled,
          weekStartsOn: nextWeekStartsOn,
        })
      );

      return payload;
    },
    queryKey: ["user-profile"],
  });

  const { mutateAsync: updatePreferences, isPending } = useMutation({
    mutationFn: async (values: {
      emailPreferences: {
        cadenceSummaryEnabled: boolean;
        goalCelebrationEnabled: boolean;
        inactivityNudgeEnabled: boolean;
        onboardingOfferEnabled: boolean;
        onboardingTipsEnabled: boolean;
        quarterlyTaxReminderEnabled: boolean;
        tipReminderEnabled: boolean;
        tripVerificationReminderEnabled: boolean;
      };
      platformSelections: {
        colorHex: string;
        displayName?: string;
        slug?: string;
      }[];
      verificationProfile: {
        address: string;
        legalName: string;
        phone: string;
      };
      timezone: string;
      weekStartsOn: WeekStartsOn;
    }) => {
      const response = await apiFetch("/api/user", {
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        availablePlatforms?: SettingsPlatform[];
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
        error?: string;
        selectedPlatforms?: SettingsPlatform[];
        verificationProfile?: {
          address?: string;
          legalName?: string;
          phone?: string;
        };
        user?: {
          email?: string;
          name?: string;
          timezone?: string;
          weekStartsOn?: unknown;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update preferences");
      }

      return payload;
    },
  });

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

  const handleSavePreferences = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (selectedCount === 0) {
      setErrorMessage("Select at least one platform.");
      return;
    }
    if (!legalName.trim() || !phone.trim() || !address.trim()) {
      setErrorMessage("Legal name, phone, and address are required.");
      return;
    }

    try {
      setIsValidatingAddress(true);
      const validation = await validateVerificationAddress(address);
      const nextVerificationAddress = validation.address;

      if (!nextVerificationAddress) {
        setErrorMessage(
          "Enter a full street address so GigStax can verify your tax profile."
        );
        return;
      }

      if (nextVerificationAddress !== address) {
        setAddress(nextVerificationAddress);
      }

      const payload = await updatePreferences({
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
        platformSelections: buildPlatformSelections(platforms),
        timezone,
        verificationProfile: {
          address: nextVerificationAddress,
          legalName,
          phone,
        },
        weekStartsOn,
      });
      const nextWeekStartsOn = getWeekStartsOn(
        payload.user?.weekStartsOn,
        weekStartsOn
      );
      const nextTimezone = payload.user?.timezone || timezone;
      const nextLegalName = payload.verificationProfile?.legalName || legalName;
      const nextPhone = payload.verificationProfile?.phone || phone;
      const nextAddress =
        payload.verificationProfile?.address || nextVerificationAddress;
      const nextCadenceSummaryEnabled =
        payload.emailPreferences?.cadenceSummaryEnabled ??
        cadenceSummaryEnabled;
      const nextGoalCelebrationEnabled =
        payload.emailPreferences?.goalCelebrationEnabled ??
        goalCelebrationEnabled;
      const nextTipReminderEnabled =
        payload.emailPreferences?.tipReminderEnabled ?? tipReminderEnabled;
      const nextInactivityNudgeEnabled =
        payload.emailPreferences?.inactivityNudgeEnabled ??
        inactivityNudgeEnabled;
      const nextOnboardingOfferEnabled =
        payload.emailPreferences?.onboardingOfferEnabled ??
        onboardingOfferEnabled;
      const nextOnboardingTipsEnabled =
        payload.emailPreferences?.onboardingTipsEnabled ??
        onboardingTipsEnabled;
      const nextQuarterlyTaxReminderEnabled =
        payload.emailPreferences?.quarterlyTaxReminderEnabled ??
        quarterlyTaxReminderEnabled;
      const nextTripVerificationReminderEnabled =
        payload.emailPreferences?.tripVerificationReminderEnabled ??
        tripVerificationReminderEnabled;
      const nextPlatforms = payload.availablePlatforms
        ? buildInitialPlatforms(
            payload.availablePlatforms,
            payload.selectedPlatforms
          )
        : platforms;
      setWeekStartsOn(nextWeekStartsOn);
      setTimezone(nextTimezone);
      setLegalName(nextLegalName);
      setPhone(nextPhone);
      setAddress(nextAddress);
      setCadenceSummaryEnabled(nextCadenceSummaryEnabled);
      setGoalCelebrationEnabled(nextGoalCelebrationEnabled);
      setTipReminderEnabled(nextTipReminderEnabled);
      setInactivityNudgeEnabled(nextInactivityNudgeEnabled);
      setOnboardingOfferEnabled(nextOnboardingOfferEnabled);
      setOnboardingTipsEnabled(nextOnboardingTipsEnabled);
      setQuarterlyTaxReminderEnabled(nextQuarterlyTaxReminderEnabled);
      setTripVerificationReminderEnabled(nextTripVerificationReminderEnabled);
      setPlatforms(nextPlatforms);
      setSavedSnapshot(
        buildPreferencesSnapshot({
          address: nextAddress,
          cadenceSummaryEnabled: nextCadenceSummaryEnabled,
          goalCelebrationEnabled: nextGoalCelebrationEnabled,
          inactivityNudgeEnabled: nextInactivityNudgeEnabled,
          legalName: nextLegalName,
          onboardingOfferEnabled: nextOnboardingOfferEnabled,
          onboardingTipsEnabled: nextOnboardingTipsEnabled,
          phone: nextPhone,
          platforms: nextPlatforms,
          quarterlyTaxReminderEnabled: nextQuarterlyTaxReminderEnabled,
          timezone: nextTimezone,
          tipReminderEnabled: nextTipReminderEnabled,
          tripVerificationReminderEnabled: nextTripVerificationReminderEnabled,
          weekStartsOn: nextWeekStartsOn,
        })
      );
      setSuccessMessage(
        validation.rateLimited
          ? "Settings updated. Radar was rate limited, so your typed address was saved as entered."
          : "Settings updated."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update preferences."
      );
    }
    setIsValidatingAddress(false);
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

      const nextPlatform: SettingsPlatform = {
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

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainNarrowClass} space-y-6`}>
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Configure calendar and platform preferences.
          </p>
        </header>

        <Card className="border-border/50 bg-card/80 rounded-2xl shadow-lg backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-xl">Driver Preferences</CardTitle>
            <CardDescription>
              Calendar layouts, weekly goals, and platform chart colors use
              these settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="week-start">
                Start week on
              </label>
              <Select
                value={weekStartsOn}
                onValueChange={(value) =>
                  setWeekStartsOn(getWeekStartsOn(value, "sunday"))
                }
              >
                <SelectTrigger className="h-11" id="week-start">
                  <SelectValue placeholder="Choose week start" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sunday">Sunday</SelectItem>
                  <SelectItem value="monday">Monday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-border/60 bg-muted/30 text-muted-foreground rounded-md border p-3 text-xs">
              Timezone:{" "}
              <span className="text-foreground font-semibold">{timezone}</span>
            </div>

            <div className="border-border/60 bg-card space-y-3 rounded-xl border p-3">
              <div className="space-y-1">
                <Label>Email Preferences</Label>
                <p className="text-muted-foreground text-sm">
                  Product reminders, setup follow-ups, and goal recaps. No broad
                  newsletter blasts.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {EMAIL_PREFERENCE_OPTIONS.map((option) => {
                  const inputId = `email-preference-${option.key}`;

                  return (
                    <div
                      key={option.key}
                      className="border-border/60 bg-muted/20 flex items-start justify-between gap-3 rounded-xl border px-3 py-3 text-sm"
                    >
                      <Label htmlFor={inputId} className="space-y-1 pr-2">
                        <span className="text-foreground block font-medium">
                          {option.label}
                        </span>
                        <span className="text-muted-foreground block text-xs leading-5">
                          {option.description}
                        </span>
                      </Label>
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={emailPreferenceState[option.key]}
                        onChange={(event) =>
                          setEmailPreference(option.key, event.target.checked)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-border/60 bg-card space-y-3 rounded-xl border p-3">
              <div className="space-y-1">
                <Label>Verification Profile</Label>
                <p className="text-muted-foreground text-sm">
                  Income stubs use this identity block.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="verification-legal-name">Legal name</Label>
                  <Input
                    id="verification-legal-name"
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="verification-phone">Phone</Label>
                  <Input
                    id="verification-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="verification-address">Address</Label>
                <Input
                  id="verification-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Verification email:{" "}
                <span className="text-foreground font-medium">
                  {accountEmail || "Account email"}
                </span>
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Platforms you use</Label>
                <p className="text-muted-foreground text-sm">
                  Select your active apps and set a color for each.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {platforms.map((platform) => (
                  <div
                    key={platform.slug}
                    className={`rounded-xl border p-3 ${platform.selected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex min-w-0 flex-1 items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={platform.selected}
                          onChange={() => togglePlatform(platform.slug)}
                        />
                        <span className="min-w-0 text-sm font-medium">
                          {platform.displayName}
                        </span>
                      </label>

                      {platform.isCustom ? (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => removeCustomPlatform(platform.slug)}
                          aria-label={`Remove ${platform.displayName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>

                    {platform.selected ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-muted-foreground text-xs font-medium">
                          Color
                        </span>
                        <Input
                          type="color"
                          value={normalizeHexColor(platform.colorHex)}
                          onChange={(event) =>
                            updatePlatformColor(
                              platform.slug,
                              event.target.value
                            )
                          }
                          className="border-border/60 h-9 w-16 rounded-md p-1"
                        />
                        <span className="text-muted-foreground text-xs">
                          {normalizeHexColor(platform.colorHex)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="border-border/60 bg-card rounded-xl border p-3">
                <p className="mb-3 text-sm font-medium">
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
                    className="h-11"
                    onClick={addCustomPlatform}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>

              <p className="text-muted-foreground text-xs">
                {selectedCount} platform{selectedCount === 1 ? "" : "s"}{" "}
                selected
              </p>
            </div>

            {errorMessage ? (
              <p className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                {errorMessage}
              </p>
            ) : null}

            {successMessage ? (
              <p className="bg-primary/10 text-primary rounded-md p-3 text-sm">
                {successMessage}
              </p>
            ) : null}

            <Button
              className="w-full sm:w-auto"
              disabled={
                isLoading || isPending || isValidatingAddress || !hasChanges
              }
              onClick={handleSavePreferences}
              type="button"
            >
              {isValidatingAddress
                ? "Validating address..."
                : isPending
                  ? "Saving..."
                  : "Save Preferences"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
