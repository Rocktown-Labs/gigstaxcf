export const STUB_CADENCE_VALUES = ["weekly", "biweekly", "monthly"] as const;
export type StubCadence = (typeof STUB_CADENCE_VALUES)[number];

export const STUB_STATUS_VALUES = ["draft", "locked"] as const;
export type StubStatus = (typeof STUB_STATUS_VALUES)[number];

export const STUB_SOURCE_VALUES = ["manual", "autogen"] as const;
export type StubSource = (typeof STUB_SOURCE_VALUES)[number];

export const STUB_FIELD_KEYS = [
  "identity_block",
  "period_window",
  "summary_totals",
  "ytd_totals",
  "tips_total",
  "orders_count",
  "miles_total",
  "earnings_itemization",
  "expenses_itemization",
] as const;
export type StubFieldKey = (typeof STUB_FIELD_KEYS)[number];

export const STUB_MANDATORY_FIELD_KEYS = [
  "identity_block",
  "period_window",
  "summary_totals",
  "ytd_totals",
  "earnings_itemization",
  "expenses_itemization",
] as const satisfies readonly StubFieldKey[];

export const DEFAULT_STUB_FIELD_KEYS = STUB_FIELD_KEYS;

export interface StubVerificationProfile {
  address: string;
  email: string;
  issuerName: string;
  legalName: string;
  phone: string;
}

export interface StubEarningsRow {
  baseAmount: number;
  bonusAmount: number;
  distanceMiles: number;
  durationSeconds: number;
  effectiveTotal: number;
  entryId: number;
  occurredAt: string;
  platformDisplayName: string;
  platformSlug: string;
  tipAmount: number;
}

export interface StubExpenseRow {
  amount: number;
  category: string;
  expenseId: number;
  incurredAt: string;
  merchant: string;
}

export interface StubPlatformEarningsRow {
  baseAmount: number;
  bonusAmount: number;
  grossEarnings: number;
  hoursTotal: number;
  milesTotal: number;
  ordersCount: number;
  platformDisplayName: string;
  platformSlug: string;
  tipAmount: number;
}

export interface StubTotals {
  baseAmount: number;
  bonusAmount: number;
  businessExpenses: number;
  grossEarnings: number;
  hoursTotal: number;
  milesTotal: number;
  operatingNet: number;
  ordersCount: number;
  tipsTotal: number;
}

export interface StubSnapshot {
  cadence: StubCadence;
  currencyCode: string;
  fieldKeys: StubFieldKey[];
  generatedAt: string;
  identity: StubVerificationProfile;
  note: string;
  period: {
    anchorDate: string;
    endDate: string;
    startDate: string;
  };
  rows: {
    earnings: StubEarningsRow[];
    expenses: StubExpenseRow[];
    platformEarnings: StubPlatformEarningsRow[];
  };
  totals: StubTotals;
  ytd: {
    endDate: string;
    startDate: string;
    totals: StubTotals;
  };
}

export interface StubProfile {
  autoGenerateEnabled: boolean;
  defaultFieldKeys: StubFieldKey[];
  primaryCadence: StubCadence;
  verificationProfile: StubVerificationProfile;
}

export const DEFAULT_STUB_NOTE =
  "Expenses are business costs, not payroll withholding.";

export const DEFAULT_STUB_VERIFICATION_PROFILE: StubVerificationProfile = {
  address: "",
  email: "",
  issuerName: "GigStax Income Statement",
  legalName: "",
  phone: "",
};
