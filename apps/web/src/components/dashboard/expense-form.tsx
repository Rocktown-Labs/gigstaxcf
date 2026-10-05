import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { createExpenseAction } from "@/components/dashboard/expense-mutations";
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
import { MoneyInput } from "@/components/ui/numeric-inputs";
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

const categories = [
  "fuel",
  "tolls",
  "parking",
  "maintenance",
  "supplies",
  "phone",
  "other",
] as const;
type ExpenseCategory = (typeof categories)[number];

const isPositiveMoneyString = (rawValue: string) => {
  const parsed = parseFiniteNumber(rawValue);
  return parsed !== null && parsed > 0 && hasMaxFractionDigits(parsed, 2);
};

const expenseSchema = z.object({
  amount: z
    .string()
    .min(1, { message: "Amount is required" })
    .refine(isPositiveMoneyString, {
      message: "Must be a valid positive amount with up to 2 decimals",
    }),
  category: z.enum(categories, { message: "Category is required" }),
  description: z.string().optional(),
  merchant: z.string().optional(),
  notes: z.string().optional(),
  occurredAt: z.string().min(1, { message: "Expense date is required" }),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

const defaultValues: ExpenseFormValues = {
  amount: "",
  category: "fuel",
  description: "",
  merchant: "",
  notes: "",
  occurredAt: "",
};

interface AnalyzeExpenseResponse {
  entryType?: "earning" | "expense";
  expenseAmount?: number | null;
  expenseCategory?: string | null;
  extractionId?: number;
  mediaId?: number;
  notes?: string | null;
  occurredAt?: string;
}

interface ExpenseFormProps {
  aiEnabled?: boolean;
  onSaved?: () => Promise<void> | void;
  redirectTo?: "/dashboard" | "/dashboard/deliveries" | "/dashboard/expenses";
  startWithUploadFirst?: boolean;
}

function toDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeCategory(value: string | null | undefined): ExpenseCategory {
  if (!value) {
    return "other";
  }

  return (categories as readonly string[]).includes(value)
    ? (value as ExpenseCategory)
    : "other";
}

export function ExpenseForm({
  aiEnabled = true,
  onSaved,
  redirectTo,
  startWithUploadFirst = true,
}: ExpenseFormProps) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [extractionId, setExtractionId] = useState<number | null>(null);
  const [analyzedMediaId, setAnalyzedMediaId] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(!startWithUploadFirst);

  const form = useForm<ExpenseFormValues>({
    defaultValues,
    resolver: zodResolver(expenseSchema),
  });

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  const { mutateAsync: createExpense, isPending: saving } = useMutation({
    mutationFn: createExpenseAction,
  });

  const loading = saving || analyzing;

  const resetImageState = () => {
    setSelectedFile(null);
    setExtractionId(null);
    setAnalyzedMediaId(null);
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
    setAnalyzedMediaId(null);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return file ? URL.createObjectURL(file) : null;
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
      formData.append("kindHint", "expense_receipt");

      const response = await apiFetch("/api/analyze-image", {
        body: formData,
        method: "POST",
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as AnalyzeExpenseResponse & {
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
              "Failed to analyze receipt."
          );
        }
        return;
      }

      setQuotaExceeded(false);

      if (payload.entryType === "earning") {
        setError(
          "This looks like a delivery screenshot. Use the delivery form to log it."
        );
        return;
      }

      if (typeof payload.expenseAmount === "number") {
        form.setValue("amount", formatFixed(payload.expenseAmount, 2));
      }

      form.setValue("category", normalizeCategory(payload.expenseCategory));

      if (typeof payload.notes === "string") {
        form.setValue("notes", payload.notes);
      }

      if (typeof payload.occurredAt === "string") {
        form.setValue("occurredAt", toDateInput(payload.occurredAt));
      }

      if (typeof payload.extractionId === "number") {
        setExtractionId(payload.extractionId);
      }

      if (typeof payload.mediaId === "number") {
        setAnalyzedMediaId(payload.mediaId);
      }
      setShowDetails(true);
    } catch (analyzeError) {
      console.error("[GigStax] Analyze receipt error:", analyzeError);
      setQuotaExceeded(false);
      setError("Could not analyze this receipt.");
    }
    setAnalyzing(false);
  };

  async function onSubmit(values: ExpenseFormValues) {
    setError("");

    const incurredAt = new Date(`${values.occurredAt}T12:00:00`).toISOString();
    const parsedAmount = parseFiniteNumber(values.amount);
    if (parsedAmount === null) {
      throw new TypeError("Expense amount is invalid");
    }

    try {
      const amount = roundToFractionDigits(parsedAmount, 2);

      const created = await createExpense({
        amount,
        category: values.category,
        description: values.description || undefined,
        incurredAt,
        merchant: values.merchant || undefined,
        notes: values.notes || undefined,
      });

      const expenseId = created?.expense?.id;
      if (selectedFile && expenseId) {
        const mediaForm = new FormData();
        if (extractionId && analyzedMediaId) {
          mediaForm.append("mediaId", String(analyzedMediaId));
        } else {
          mediaForm.append("file", selectedFile);
        }

        const mediaResponse = await apiFetch(
          `/api/expenses/${expenseId}/media`,
          {
            body: mediaForm,
            method: "POST",
          }
        );

        if (!mediaResponse.ok) {
          const mediaPayload = (await mediaResponse
            .json()
            .catch(() => ({}))) as { error?: string };
          const mediaError = new Error(
            mediaPayload.error || "Failed to attach receipt."
          );
          console.error("[GigStax] Add expense error:", mediaError);
          setError(mediaError.message);
          return;
        }
      }

      form.reset(defaultValues);
      resetImageState();
      setShowDetails(!startWithUploadFirst);
      if (onSaved) {
        await onSaved();
      } else {
        navigate({ to: redirectTo ?? "/dashboard/expenses" });
      }
    } catch (submitError) {
      console.error("[GigStax] Add expense error:", submitError);
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
        <CardTitle className="text-destructive text-2xl font-bold tracking-tight">
          Log Expense
        </CardTitle>
        <CardDescription className="text-muted-foreground text-base">
          Upload a receipt to auto-fill expense details, or enter them manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {error && (
              <div className="text-destructive bg-destructive/10 border-destructive/20 rounded-xl border p-4 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <FormLabel className="text-foreground/90 font-semibold">
                Receipt Image (Optional)
              </FormLabel>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="bg-background/50 border-border/50 file:bg-destructive/10 file:text-destructive hover:file:bg-destructive/20 h-12 rounded-xl file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-semibold"
                disabled={loading}
              />
              <FormDescription className="text-muted-foreground/70 text-sm">
                Upload gas or other expense receipts to extract amount and
                category automatically.
              </FormDescription>

              {previewUrl && (
                <div className="space-y-4">
                  <div className="border-border/50 overflow-hidden rounded-xl border">
                    <img
                      src={previewUrl}
                      alt="Expense receipt preview"
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
                      disabled={loading}
                    >
                      Remove Image
                    </Button>
                  </div>
                </div>
              )}

              {extractionId && (
                <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
                  AI extraction applied. Confirm values before saving.
                </div>
              )}

              {showDetails ? null : (
                <div className="border-border/50 bg-background/50 space-y-3 rounded-xl border p-4">
                  <p className="text-muted-foreground text-sm">
                    {aiEnabled
                      ? "Upload and analyze receipts first, then verify the values. You can continue manually at any time."
                      : "Manual expense entry with receipt attachment is available. Upgrade your plan to enable AI receipt analysis."}
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
                          {analyzing ? "Analyzing..." : "Analyze & Continue"}
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
                      onClick={() => setShowDetails(true)}
                      disabled={loading}
                    >
                      Continue Manually
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {showDetails ? (
              <>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/90 font-semibold">
                          Category <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value)}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-background/50 border-border/50 focus:ring-destructive h-12 rounded-xl">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fuel">Fuel / Gas</SelectItem>
                            <SelectItem value="tolls">Tolls</SelectItem>
                            <SelectItem value="parking">Parking</SelectItem>
                            <SelectItem value="maintenance">
                              Maintenance / Repairs
                            </SelectItem>
                            <SelectItem value="supplies">
                              Supplies / Gear
                            </SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="other">Other Expense</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/90 font-semibold">
                          Expense Amount{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="text-muted-foreground absolute top-1/2 left-4 -translate-y-1/2 font-medium">
                              $
                            </span>
                            <MoneyInput
                              placeholder="e.g. 35.50"
                              className="bg-background/50 border-border/50 focus-visible:ring-destructive text-destructive h-12 rounded-xl pl-8 text-lg font-semibold"
                              value={field.value}
                              onValueChange={(value) => field.onChange(value)}
                              onBlur={() => field.onBlur()}
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-muted-foreground text-xs">
                          Up to 2 decimals. Auto-rounded when you leave the
                          field.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="merchant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/90 font-semibold">
                          Merchant
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Exxon"
                            className="bg-background/50 border-border/50 focus-visible:ring-destructive h-12 rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/90 font-semibold">
                          Description
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 12.3 gallons regular"
                            className="bg-background/50 border-border/50 focus-visible:ring-destructive h-12 rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="occurredAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/90 font-semibold">
                        Date of Expense
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="bg-background/50 border-border/50 focus-visible:ring-destructive h-12 rounded-xl"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground/70 text-sm">
                        Set the exact date on the receipt.
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
                          placeholder="Vendor name, receipt details, why the expense occurred..."
                          className="bg-background/50 border-border/50 focus-visible:ring-destructive resize-none rounded-xl"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-border/50 flex flex-col gap-4 border-t pt-6 sm:flex-row">
                  <Button
                    type="submit"
                    className="text-md bg-destructive text-destructive-foreground hover:bg-destructive/90 order-1 h-14 flex-1 rounded-xl font-bold shadow-[0_0_20px_-5px_oklch(0.65_0.25_140)] transition-all hover:shadow-[0_0_30px_-5px_oklch(0.65_0.25_140)] sm:order-2"
                    disabled={loading}
                  >
                    {loading ? "Saving..." : "Log Expense"}
                  </Button>
                  {onSaved ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-md border-border/50 hover:bg-secondary/50 order-2 h-14 rounded-xl px-8 font-medium sm:order-1"
                      onClick={() =>
                        navigate({ to: redirectTo ?? "/dashboard" })
                      }
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
