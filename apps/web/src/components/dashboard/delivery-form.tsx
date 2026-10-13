import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import * as z from "zod";

import { createEntryAction } from "@/components/dashboard/entry-mutations";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  MileageInput,
  MoneyInput,
  WholeNumberInput,
} from "@/components/ui/numeric-inputs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  formatFixed,
  hasMaxFractionDigits,
  parseFiniteNumber,
  roundToFractionDigits,
} from "@/lib/numeric-policy";

const isOptionalNonNegativeDecimal = (
  rawValue: string | undefined,
  digits: number
) => {
  if (!rawValue) {
    return true;
  }

  const parsed = parseFiniteNumber(rawValue);
  return parsed !== null && parsed >= 0 && hasMaxFractionDigits(parsed, digits);
};

const isOptionalNonNegativeInteger = (rawValue: string | undefined) => {
  if (!rawValue) {
    return true;
  }

  const parsed = parseFiniteNumber(rawValue);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0;
};

const formSchema = z.object({
  bonusAmount: z
    .string()
    .optional()
    .refine((value) => isOptionalNonNegativeDecimal(value, 2), {
      message: "Must be a valid amount with up to 2 decimals",
    }),
  distanceMiles: z
    .string()
    .optional()
    .refine((value) => isOptionalNonNegativeDecimal(value, 2), {
      message: "Must be a valid distance with up to 2 decimals",
    }),

  durationMinutes: z.string().optional().refine(isOptionalNonNegativeInteger, {
    message: "Must be a valid positive integer",
  }),
  fareAmount: z
    .string()
    .min(1, { message: "Fare amount is required" })
    .refine((value) => isOptionalNonNegativeDecimal(value, 2), {
      message: "Must be a valid amount with up to 2 decimals",
    }),
  notes: z.string().optional(),

  occurredAt: z.string().min(1, { message: "Date and time are required" }),
  platformSlug: z.string().min(1, { message: "Platform is required" }),

  status: z.string().min(1, { message: "Status is required" }),
  stopsCount: z.string().optional().refine(isOptionalNonNegativeInteger, {
    message: "Must be a valid positive integer",
  }),

  tipAmount: z
    .string()
    .optional()
    .refine((value) => isOptionalNonNegativeDecimal(value, 2), {
      message: "Must be a valid amount with up to 2 decimals",
    }),
  tipStatus: z.string().min(1, { message: "Tip status is required" }),
});

const defaultValues = {
  bonusAmount: "",
  distanceMiles: "",
  durationMinutes: "",
  fareAmount: "",
  notes: "",
  occurredAt: "",
  platformSlug: "walmart_spark",
  status: "completed",
  stopsCount: "",
  tipAmount: "",
  tipStatus: "final",
};

type EntryFormValues = z.infer<typeof formSchema>;
type ParsedTipStatus = "none" | "pending" | "final";

interface PlatformOption {
  colorHex: string;
  displayName: string;
  slug: string;
}

interface PlatformsApiResponse {
  availablePlatforms?: PlatformOption[];
  selectedPlatforms?: PlatformOption[];
}

const FALLBACK_PLATFORM_OPTIONS: PlatformOption[] = [
  { colorHex: "#22c55e", displayName: "Walmart Spark", slug: "walmart_spark" },
  { colorHex: "#10b981", displayName: "Uber Eats", slug: "uber_eats" },
  { colorHex: "#111111", displayName: "Uber", slug: "uber" },
  { colorHex: "#ec4899", displayName: "Lyft", slug: "lyft" },
  { colorHex: "#ef4444", displayName: "DoorDash", slug: "doordash" },
  { colorHex: "#16a34a", displayName: "Instacart", slug: "instacart" },
  { colorHex: "#f97316", displayName: "Grubhub", slug: "grubhub" },
  { colorHex: "#14b8a6", displayName: "Shipt", slug: "shipt" },
  { colorHex: "#f59e0b", displayName: "Amazon Flex", slug: "amazon_flex" },
  { colorHex: "#8b5cf6", displayName: "Roadie", slug: "roadie" },
  { colorHex: "#64748b", displayName: "Other", slug: "other" },
];

const formatPlatformLabel = (slug: string) =>
  slug
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.length > 1
        ? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
        : segment.toUpperCase()
    )
    .join(" ");

interface DeliveryFormProps {
  aiEnabled?: boolean;
  onSaved?: () => Promise<void> | void;
  redirectTo?: "/dashboard" | "/dashboard/deliveries" | "/dashboard/expenses";
  startWithUploadFirst?: boolean;
}

interface AnalyzeEntryResponse {
  bonusAmount?: number | null;
  distanceMiles?: number | null;
  durationSeconds?: number | null;
  entryType?: "earning" | "expense";
  extractionId?: number;
  fareAmount?: number | null;
  mediaUrl?: string;
  notes?: string | null;
  occurredAt?: string;
  platformSlug?: string | null;
  stopsCount?: number | null;
  tipEstimatedAmount?: number | null;
  tipFinalAmount?: number | null;
  tipStatus?: ParsedTipStatus;
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
}

export function DeliveryForm({
  aiEnabled = true,
  onSaved,
  redirectTo,
  startWithUploadFirst = true,
}: DeliveryFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [extractionId, setExtractionId] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(!startWithUploadFirst);
  const [openSection, setOpenSection] = useState(
    startWithUploadFirst ? "section-1" : "section-2"
  );
  const [customPlatformName, setCustomPlatformName] = useState("");

  const form = useForm<EntryFormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  // Watch tip status to conditionally render labels
  const tipStatusValue = useWatch({ control: form.control, name: "tipStatus" });
  const selectedPlatformSlug = useWatch({
    control: form.control,
    name: "platformSlug",
  });

  const platformQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/platforms");
      if (!response.ok) {
        throw new Error("Failed to load platforms");
      }

      return (await response.json()) as PlatformsApiResponse;
    },
    queryKey: ["platform-options"],
  });

  const platformOptions = useMemo(() => {
    const selected = platformQuery.data?.selectedPlatforms || [];
    const available = platformQuery.data?.availablePlatforms || [];
    const source =
      selected.length > 0
        ? selected
        : available.length > 0
          ? available
          : FALLBACK_PLATFORM_OPTIONS;
    const optionMap = new Map<string, PlatformOption>(
      FALLBACK_PLATFORM_OPTIONS.map((option) => [option.slug, option])
    );

    for (const option of source) {
      optionMap.set(option.slug, option);
    }

    if (selectedPlatformSlug && !optionMap.has(selectedPlatformSlug)) {
      optionMap.set(selectedPlatformSlug, {
        colorHex: "#22c55e",
        displayName: formatPlatformLabel(selectedPlatformSlug),
        slug: selectedPlatformSlug,
      });
    }

    return [...optionMap.values()];
  }, [
    platformQuery.data?.availablePlatforms,
    platformQuery.data?.selectedPlatforms,
    selectedPlatformSlug,
  ]);

  useEffect(() => {
    const currentPlatform = form.getValues("platformSlug");
    if (platformOptions.length === 0) {
      return;
    }

    if (
      !platformOptions.some((platform) => platform.slug === currentPlatform)
    ) {
      form.setValue("platformSlug", platformOptions[0].slug);
    }
  }, [form, platformOptions]);

  const { mutateAsync: createEntry, isPending: saving } = useMutation({
    mutationFn: createEntryAction,
  });

  const { mutateAsync: createCustomPlatform, isPending: creatingPlatform } =
    useMutation({
      mutationFn: async (displayName: string) => {
        const response = await apiFetch("/api/platforms", {
          body: JSON.stringify({
            displayName,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          platform?: PlatformOption;
        };

        if (!response.ok || !payload.platform) {
          throw new Error(payload.error || "Failed to create platform");
        }

        return payload.platform;
      },
      onSuccess: (platform) => {
        queryClient.setQueryData(
          ["platform-options"],
          (current: PlatformsApiResponse | undefined) => {
            const available = current?.availablePlatforms || [];
            const selected = current?.selectedPlatforms || [];
            const alreadyInAvailable = available.some(
              (item) => item.slug === platform.slug
            );
            const alreadyInSelected = selected.some(
              (item) => item.slug === platform.slug
            );

            return {
              availablePlatforms: alreadyInAvailable
                ? available
                : [...available, platform],
              selectedPlatforms: alreadyInSelected
                ? selected
                : [...selected, platform],
            };
          }
        );
      },
    });

  const loading = saving || analyzing;
  const occurredAtValue = useWatch({
    control: form.control,
    name: "occurredAt",
  });

  const occurredDateValue = useMemo(() => {
    if (!occurredAtValue) {
      return "";
    }

    return occurredAtValue.slice(0, 10);
  }, [occurredAtValue]);

  const occurredTimeValue = useMemo(() => {
    if (!occurredAtValue || !occurredAtValue.includes("T")) {
      return "";
    }

    const parts = occurredAtValue.split("T");
    return parts[1]?.slice(0, 5) || "";
  }, [occurredAtValue]);

  const resetImageState = () => {
    setSelectedFile(null);
    setExtractionId(null);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setExtractionId(null);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return file ? URL.createObjectURL(file) : null;
    });
  };

  const handleAddCustomPlatform = async () => {
    const trimmed = customPlatformName.trim();
    if (trimmed.length < 2) {
      setError("Platform name must be at least 2 characters.");
      return;
    }

    const existing = platformOptions.find(
      (option) => option.displayName.toLowerCase() === trimmed.toLowerCase()
    );

    if (existing) {
      form.setValue("platformSlug", existing.slug, { shouldValidate: true });
      setCustomPlatformName("");
      return;
    }

    setError("");
    try {
      const created = await createCustomPlatform(trimmed);
      form.setValue("platformSlug", created.slug, { shouldValidate: true });
      setCustomPlatformName("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to add platform."
      );
    }
  };

  const handlePlatformNameKeyDown = async (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    await handleAddCustomPlatform();
  };

  const handleOccurredDateChange = (nextDate: string) => {
    if (!nextDate) {
      form.setValue("occurredAt", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }

    const nextTime = occurredTimeValue || "00:00";
    form.setValue("occurredAt", `${nextDate}T${nextTime}`, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleOccurredTimeChange = (nextTime: string) => {
    if (!nextTime && !occurredDateValue) {
      form.setValue("occurredAt", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }

    const nextDate = occurredDateValue || new Date().toISOString().slice(0, 10);
    form.setValue("occurredAt", `${nextDate}T${nextTime || "00:00"}`, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleAnalyzeImage = async () => {
    if (!aiEnabled) {
      setQuotaExceeded(false);
      setError("AI analysis is currently unavailable for your plan.");
      return;
    }

    if (!selectedFile) {
      return;
    }

    setAnalyzing(true);
    setQuotaExceeded(false);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("kindHint", "entry_screenshot");

      const response = await apiFetch("/api/analyze-image", {
        body: formData,
        method: "POST",
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as AnalyzeEntryResponse & {
        code?: string;
        details?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (payload.code === "QUOTA_EXCEEDED") {
          setQuotaExceeded(true);
          setError("AI credits exhausted. Upgrade or Buy Credits to continue.");
        } else {
          setQuotaExceeded(false);
          setError(
            payload.message ||
              payload.details ||
              payload.error ||
              "Failed to analyze image."
          );
        }
        return;
      }

      setQuotaExceeded(false);

      if (payload.entryType === "expense") {
        setError(
          "This looks like an expense receipt. Use the expense form to log it."
        );
        return;
      }

      if (typeof payload.platformSlug === "string") {
        form.setValue("platformSlug", payload.platformSlug);
      }

      if (typeof payload.fareAmount === "number") {
        form.setValue("fareAmount", formatFixed(payload.fareAmount, 2));
      }

      if (typeof payload.bonusAmount === "number") {
        form.setValue("bonusAmount", formatFixed(payload.bonusAmount, 2));
      }

      if (typeof payload.distanceMiles === "number") {
        form.setValue("distanceMiles", formatFixed(payload.distanceMiles, 2));
      }

      if (typeof payload.durationSeconds === "number") {
        form.setValue(
          "durationMinutes",
          String(Math.round(payload.durationSeconds / 60))
        );
      }

      if (typeof payload.stopsCount === "number") {
        form.setValue("stopsCount", String(payload.stopsCount));
      }

      const tipStatus: ParsedTipStatus =
        payload.tipStatus === "pending" || payload.tipStatus === "final"
          ? payload.tipStatus
          : "none";
      form.setValue("tipStatus", tipStatus);

      const parsedTip =
        tipStatus === "final"
          ? payload.tipFinalAmount
          : tipStatus === "pending"
            ? payload.tipEstimatedAmount
            : (payload.tipFinalAmount ?? payload.tipEstimatedAmount);
      form.setValue(
        "tipAmount",
        parsedTip !== undefined && parsedTip !== null
          ? formatFixed(parsedTip, 2)
          : ""
      );

      if (typeof payload.notes === "string") {
        form.setValue("notes", payload.notes);
      }

      if (typeof payload.occurredAt === "string") {
        form.setValue("occurredAt", toDateTimeLocal(payload.occurredAt));
      }

      if (typeof payload.extractionId === "number") {
        setExtractionId(payload.extractionId);
      }
      setShowDetails(true);
      setOpenSection("section-2");
    } catch (analyzeError) {
      console.error("[GigStax] Analyze trip image error:", analyzeError);
      setQuotaExceeded(false);
      setError("Could not analyze this screenshot.");
    }
    setAnalyzing(false);
  };

  async function onSubmit(values: EntryFormValues) {
    setError("");

    const occurredAt = new Date(values.occurredAt).toISOString();
    const parsedFareAmount = parseFiniteNumber(values.fareAmount);
    if (parsedFareAmount === null) {
      throw new TypeError("Fare amount is invalid");
    }

    try {
      const fareAmount = roundToFractionDigits(parsedFareAmount, 2);
      const bonusAmount = roundToFractionDigits(
        parseFiniteNumber(values.bonusAmount) ?? 0,
        2
      );
      const tipInputAmount = roundToFractionDigits(
        parseFiniteNumber(values.tipAmount) ?? 0,
        2
      );
      const hasTip = tipInputAmount > 0;
      const tipStatus: ParsedTipStatus = hasTip
        ? (values.tipStatus as ParsedTipStatus)
        : "none";
      const distanceMiles = parseFiniteNumber(values.distanceMiles);
      const durationMinutes = parseFiniteNumber(values.durationMinutes);
      const stopsCount = parseFiniteNumber(values.stopsCount);
      const computedTotal = roundToFractionDigits(
        fareAmount + bonusAmount + (hasTip ? tipInputAmount : 0),
        2
      );

      const created = await createEntry({
        bonusAmount,
        completedAt: values.status === "completed" ? occurredAt : undefined,
        distanceMiles:
          distanceMiles === null
            ? undefined
            : roundToFractionDigits(distanceMiles, 2),
        durationSeconds:
          durationMinutes === null
            ? undefined
            : Math.max(0, Math.trunc(durationMinutes)) * 60,
        extractionId: extractionId ?? undefined,
        fareAmount,
        notes: values.notes || undefined,
        occurredAt,
        platformSlug: values.platformSlug,
        source: extractionId ? "image_ai" : "manual",
        status: values.status as
          | "offered"
          | "accepted"
          | "completed"
          | "cancelled",
        stopsCount:
          stopsCount === null ? undefined : Math.max(0, Math.trunc(stopsCount)),
        tipEstimatedAmount:
          tipStatus === "pending" && hasTip ? tipInputAmount : undefined,
        tipFinalAmount:
          tipStatus === "final" && hasTip ? tipInputAmount : undefined,
        tipStatus,
        totalEstimatedAmount: computedTotal,
        totalFinalAmount: tipStatus === "pending" ? undefined : computedTotal,
      });

      const entryId = created?.entry?.id;
      if (selectedFile && !extractionId && entryId) {
        const mediaForm = new FormData();
        mediaForm.append("file", selectedFile);
        const mediaResponse = await apiFetch(`/api/entries/${entryId}/media`, {
          body: mediaForm,
          method: "POST",
        });

        if (!mediaResponse.ok) {
          const mediaPayload = (await mediaResponse
            .json()
            .catch(() => ({}))) as { error?: string };
          const mediaError = new Error(
            mediaPayload.error || "Failed to attach screenshot."
          );
          console.error("[GigStax] Add delivery error:", mediaError);
          setError(mediaError.message);
          return;
        }
      }

      form.reset(defaultValues);
      resetImageState();
      setShowDetails(!startWithUploadFirst);
      setOpenSection(startWithUploadFirst ? "section-1" : "section-2");
      if (onSaved) {
        await onSaved();
      } else {
        navigate({ to: redirectTo ?? "/dashboard/deliveries" });
      }
    } catch (submitError) {
      console.error("[GigStax] Add delivery error:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "An unexpected error occurred."
      );
    }
  }

  return (
    <Card className="border-border/50 bg-card rounded-2xl shadow-lg">
      <CardHeader className="border-border/50 space-y-2 border-b pb-6">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Log Delivery
        </CardTitle>
        <CardDescription className="text-muted-foreground text-base">
          Upload a delivery screenshot to auto-fill trip details, or enter
          everything manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="text-destructive bg-destructive/10 border-destructive/20 rounded-xl border p-4 text-sm font-medium">
                {error}
              </div>
            )}

            <Accordion
              type="single"
              collapsible
              value={openSection}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setOpenSection(nextValue);
                }
              }}
              className="border-border/50 bg-background overflow-hidden rounded-2xl border"
            >
              <AccordionItem value="section-1" className="border-border/40">
                <AccordionTrigger className="px-4 py-4 text-base font-semibold hover:no-underline sm:px-6">
                  <span className="flex items-center gap-2">
                    <span className="text-primary">1.</span> Trip Screenshot
                    (Optional)
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-4 pb-6 sm:px-6">
                  <div className="space-y-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="border-border/50 bg-background/50 file:bg-primary/10 file:text-primary hover:file:bg-primary/20 h-12 rounded-xl file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-semibold"
                      disabled={loading}
                    />
                    <FormDescription className="text-muted-foreground/70 text-sm">
                      Spark/Uber/DoorDash screenshots can be analyzed and mapped
                      into this form.
                    </FormDescription>
                  </div>

                  {previewUrl ? (
                    <div className="space-y-4">
                      <div className="border-border/50 overflow-hidden rounded-xl border">
                        <img
                          src={previewUrl}
                          alt="Trip screenshot preview"
                          width={1200}
                          height={800}
                          className="bg-muted/20 max-h-[420px] w-full object-contain"
                        />
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border/50 h-12 rounded-xl px-6"
                          onClick={resetImageState}
                          disabled={analyzing || loading}
                        >
                          Remove Image
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {extractionId ? (
                    <div className="border-primary/30 bg-primary/10 text-primary rounded-xl border p-3 text-sm">
                      AI extraction applied. Review values below before saving.
                    </div>
                  ) : null}

                  {showDetails ? null : (
                    <div className="border-border/50 bg-background/50 space-y-3 rounded-xl border p-4">
                      <p className="text-muted-foreground text-sm">
                        {aiEnabled
                          ? "Start by uploading and analyzing a screenshot. You can also continue manually."
                          : "Manual delivery entry with image attachment is available. Upgrade your plan to enable AI analysis."}
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        {aiEnabled ? (
                          quotaExceeded ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-border/50 h-11 rounded-xl px-5"
                              asChild
                            >
                              <Link to="/dashboard/billing">
                                Upgrade or Buy Credits
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              className="h-11 rounded-xl px-5 font-semibold"
                              onClick={handleAnalyzeImage}
                              disabled={!selectedFile || loading}
                            >
                              <ScanLine className="mr-2 h-4 w-4" />
                              {analyzing
                                ? "Analyzing..."
                                : "Analyze & Continue"}
                            </Button>
                          )
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="border-border/50 h-11 rounded-xl px-5"
                            asChild
                          >
                            <Link to="/dashboard/billing">View Plans</Link>
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border/50 h-11 rounded-xl px-5"
                          onClick={() => {
                            setShowDetails(true);
                            setOpenSection("section-2");
                          }}
                          disabled={loading}
                        >
                          Continue Manually
                        </Button>
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {showDetails ? (
                <>
                  <AccordionItem value="section-2" className="border-border/40">
                    <AccordionTrigger className="px-4 py-4 text-base font-semibold hover:no-underline sm:px-6">
                      <span className="flex items-center gap-2">
                        <span className="text-primary">2.</span> Basic Details
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-5 px-4 pb-6 sm:px-6">
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="platformSlug"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Platform <span className="text-primary">*</span>
                              </FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value)}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="border-border/50 bg-background/50 focus:ring-primary h-12 rounded-xl">
                                    <SelectValue placeholder="Select platform" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {platformOptions.map((platform) => (
                                    <SelectItem
                                      key={platform.slug}
                                      value={platform.slug}
                                    >
                                      {platform.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Status <span className="text-primary">*</span>
                              </FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value)}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="border-border/50 bg-background/50 focus:ring-primary h-12 rounded-xl">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="offered">
                                    Offered (Not accepted)
                                  </SelectItem>
                                  <SelectItem value="accepted">
                                    Accepted (In progress)
                                  </SelectItem>
                                  <SelectItem value="completed">
                                    Completed
                                  </SelectItem>
                                  <SelectItem value="cancelled">
                                    Cancelled
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="border-border/50 bg-muted/20 space-y-2 rounded-xl border p-4">
                        <FormLabel className="text-foreground/90 font-semibold">
                          Add Platform by Name
                        </FormLabel>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Input
                            type="text"
                            placeholder="e.g. Uber, Lyft, Amazon Flex"
                            value={customPlatformName}
                            onChange={(event) =>
                              setCustomPlatformName(event.target.value)
                            }
                            onKeyDown={handlePlatformNameKeyDown}
                            className="border-border/50 bg-background/60 h-11 rounded-xl"
                            disabled={loading || creatingPlatform}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="border-border/50 h-11 rounded-xl px-5"
                            onClick={handleAddCustomPlatform}
                            disabled={
                              loading ||
                              creatingPlatform ||
                              customPlatformName.trim().length < 2
                            }
                          >
                            {creatingPlatform ? "Adding..." : "Add Platform"}
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="section-3" className="border-border/40">
                    <AccordionTrigger className="px-4 py-4 text-base font-semibold hover:no-underline sm:px-6">
                      <span className="flex items-center gap-2">
                        <span className="text-primary">3.</span> Earnings
                        Breakdown
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 px-4 pb-6 sm:px-6">
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="fareAmount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Base Fare Amount{" "}
                                <span className="text-primary">*</span>
                              </FormLabel>
                              <FormControl>
                                <MoneyInput
                                  placeholder="e.g. 9.00"
                                  className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                                  value={field.value}
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  onBlur={() => field.onBlur()}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="bonusAmount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Bonus / Surge Amount
                              </FormLabel>
                              <FormControl>
                                <MoneyInput
                                  placeholder="e.g. 3.50"
                                  className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                                  value={field.value}
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  onBlur={() => field.onBlur()}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="border-border/50 bg-muted/30 grid grid-cols-1 gap-6 rounded-2xl border p-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="tipStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Tip Status
                              </FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value)}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="border-border/50 bg-background focus:ring-primary h-12 rounded-xl">
                                    <SelectValue placeholder="Select tip status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">
                                    No Tip Given/Expected
                                  </SelectItem>
                                  <SelectItem value="pending">
                                    Pending (Estimated Tip)
                                  </SelectItem>
                                  <SelectItem value="final">
                                    Finalized (Confirmed Tip)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tipAmount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                {tipStatusValue === "pending"
                                  ? "Estimated Tip Amount"
                                  : "Tip Amount"}
                              </FormLabel>
                              <FormControl>
                                <MoneyInput
                                  placeholder="e.g. 10.00"
                                  className="border-border/50 bg-background focus-visible:ring-primary h-12 rounded-xl"
                                  disabled={tipStatusValue === "none"}
                                  value={field.value}
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  onBlur={() => field.onBlur()}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {tipStatusValue === "pending" ? (
                        <p className="text-xs text-amber-400">
                          Pending tips show in your verification queue after
                          about 24 hours so you can confirm final payout.
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        Money fields allow up to 2 decimals and auto-round on
                        blur.
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="section-4" className="border-border/40">
                    <AccordionTrigger className="px-4 py-4 text-base font-semibold hover:no-underline sm:px-6">
                      <span className="flex items-center gap-2">
                        <span className="text-primary">4.</span> Trip Metrics
                        (Optional)
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-6 sm:px-6">
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                        <FormField
                          control={form.control}
                          name="distanceMiles"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Distance (Miles)
                              </FormLabel>
                              <FormControl>
                                <MileageInput
                                  placeholder="e.g. 6.7"
                                  className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                                  value={field.value}
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  onBlur={() => field.onBlur()}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="durationMinutes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Duration (Minutes)
                              </FormLabel>
                              <FormControl>
                                <WholeNumberInput
                                  placeholder="e.g. 45"
                                  className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                                  value={field.value}
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  onBlur={() => field.onBlur()}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="stopsCount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground/90 font-semibold">
                                Drop-off Stops
                              </FormLabel>
                              <FormControl>
                                <WholeNumberInput
                                  placeholder="e.g. 2"
                                  className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                                  value={field.value}
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  onBlur={() => field.onBlur()}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="section-5" className="border-border/40">
                    <AccordionTrigger className="px-4 py-4 text-base font-semibold hover:no-underline sm:px-6">
                      <span className="flex items-center gap-2">
                        <span className="text-primary">5.</span> Additional Info
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 px-4 pb-6 sm:px-6">
                      <FormField
                        control={form.control}
                        name="occurredAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/90 font-semibold">
                              Event Date & Time
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="hidden"
                                value={field.value}
                                onChange={(event) => field.onChange(event)}
                                onBlur={() => field.onBlur()}
                              />
                            </FormControl>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Input
                                type="date"
                                value={occurredDateValue}
                                onBlur={() => field.onBlur()}
                                onChange={(event) =>
                                  handleOccurredDateChange(event.target.value)
                                }
                                className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                              />
                              <Input
                                type="time"
                                value={occurredTimeValue}
                                onBlur={() => field.onBlur()}
                                onChange={(event) =>
                                  handleOccurredTimeChange(event.target.value)
                                }
                                className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 rounded-xl"
                              />
                            </div>
                            <FormDescription className="text-muted-foreground/70 text-sm">
                              Set the exact trip date and time from your
                              screenshot or memory.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/90 font-semibold">
                              Notes
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Apartment code, heavy items, specific drop-off details..."
                                className="border-border/50 bg-background/50 focus-visible:ring-primary resize-none rounded-xl"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </>
              ) : null}
            </Accordion>

            {showDetails ? (
              <div className="border-border/50 flex gap-4 border-t pt-6">
                <Button
                  type="submit"
                  className="text-md h-14 flex-1 rounded-xl font-bold shadow-[0_0_20px_-5px_oklch(0.65_0.25_140)] transition-all hover:shadow-[0_0_30px_-5px_oklch(0.65_0.25_140)]"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Delivery Log"}
                </Button>
                {onSaved ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border/50 text-md hover:bg-secondary/50 h-14 rounded-xl px-8 font-medium"
                    onClick={() => navigate({ to: redirectTo ?? "/dashboard" })}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
