import {
  earningsEntries,
  expenses,
  incomeStubs,
  platforms,
  stubProfiles,
  users,
} from "@gigstaxcf/db/schema";
/* eslint-disable complexity, func-style, max-statements, no-use-before-define, unicorn/no-nested-ternary */
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getEffectiveTip, getEffectiveTotal } from "@/lib/services/entries";
import {
  DEFAULT_STUB_FIELD_KEYS,
  DEFAULT_STUB_NOTE,
  DEFAULT_STUB_VERIFICATION_PROFILE,
  STUB_FIELD_KEYS,
  STUB_MANDATORY_FIELD_KEYS,
} from "@/lib/stubs/types";
import type {
  StubCadence,
  StubEarningsRow,
  StubExpenseRow,
  StubFieldKey,
  StubPlatformEarningsRow,
  StubProfile,
  StubSnapshot,
  StubSource,
  StubStatus,
  StubVerificationProfile,
} from "@/lib/stubs/types";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_HOUR = 60 * 60;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const STUB_TABLE_IDENTIFIERS = ['"stub_profiles"', '"income_stubs"'];

interface UserStubContext {
  currencyCode: string;
  email: string;
  name: string;
  timezone: string;
  weekStartsOn: "monday" | "sunday";
}

interface DateRange {
  endDate: string;
  startDate: string;
}

interface CadenceDefaultWindow {
  anchorDate: string;
  period: DateRange;
}

interface BuildSnapshotArgs {
  anchorDate: string;
  cadence: StubCadence;
  context: UserStubContext;
  fieldKeys: StubFieldKey[];
  userId: number;
  verificationProfile: StubVerificationProfile;
}

interface UpsertDraftStubArgs {
  anchorDate: string;
  cadence: StubCadence;
  context?: UserStubContext;
  fieldKeys?: StubFieldKey[];
  profile?: StubProfileRecord;
  source?: StubSource;
  userId: number;
}

export interface StubProfileRecord extends StubProfile {
  createdAt: string;
  id: number;
  updatedAt: string;
  userId: number;
}

export interface IncomeStubRecord {
  anchorDate: string;
  cadence: StubCadence;
  computedAt: string;
  createdAt: string;
  fieldKeys: StubFieldKey[];
  id: number;
  lockedAt: string | null;
  periodEnd: string;
  periodStart: string;
  publicId: string;
  revision: number;
  snapshot: StubSnapshot;
  source: StubSource;
  status: StubStatus;
  updatedAt: string;
  userId: number;
  ytdEnd: string;
  ytdStart: string;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getPostgresErrorCode = (error: unknown) => {
  if (!isObjectRecord(error)) {
    return null;
  }

  if (typeof error.code === "string") {
    return error.code;
  }

  if (isObjectRecord(error.cause) && typeof error.cause.code === "string") {
    return error.cause.code;
  }

  return null;
};

const getErrorQuery = (error: unknown) => {
  if (!isObjectRecord(error)) {
    return "";
  }

  if (typeof error.query === "string") {
    return error.query;
  }

  if (isObjectRecord(error.cause) && typeof error.cause.query === "string") {
    return error.cause.query;
  }

  return "";
};

export const isStubTablesMissingError = (error: unknown) => {
  if (getPostgresErrorCode(error) !== "42P01") {
    return false;
  }

  const query = getErrorQuery(error);
  if (!query) {
    return true;
  }

  return STUB_TABLE_IDENTIFIERS.some((identifier) =>
    query.includes(identifier)
  );
};

export const STUB_TABLES_MISSING_MESSAGE =
  "Stub tables are not initialized. Run `pnpm db:migrate` and refresh.";

const STUB_FIELD_KEY_SET = new Set<StubFieldKey>(STUB_FIELD_KEYS);

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pad2 = (value: number) => value.toString().padStart(2, "0");

const parseDateKeyToUtcDate = (dateKey: string) => {
  if (!ISO_DATE_REGEX.test(dateKey)) {
    throw new TypeError(`Invalid date key: ${dateKey}`);
  }

  return new Date(`${dateKey}T00:00:00.000Z`);
};

const toDateKeyFromUtcDate = (date: Date) =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;

const addDaysToDateKey = (dateKey: string, days: number) => {
  const utcDate = parseDateKeyToUtcDate(dateKey);
  return toDateKeyFromUtcDate(
    new Date(utcDate.getTime() + days * MILLISECONDS_PER_DAY)
  );
};

const diffDateKeys = (leftDateKey: string, rightDateKey: string) => {
  const left = parseDateKeyToUtcDate(leftDateKey);
  const right = parseDateKeyToUtcDate(rightDateKey);
  return Math.round((left.getTime() - right.getTime()) / MILLISECONDS_PER_DAY);
};

const normalizeTimeZone = (value: string | null | undefined) => {
  const normalized = value?.trim() || "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(
      new Date()
    );
    return normalized;
  } catch {
    return "UTC";
  }
};

const getDateKeyInTimeZone = (value: Date | string, timeZone: string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month}-${day}`;
};

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
};

const inDateRange = (dateKey: string, range: DateRange) =>
  dateKey >= range.startDate && dateKey <= range.endDate;

const sortByIsoDesc = <T>(items: T[], getIso: (item: T) => string): T[] =>
  [...items].toSorted((left, right) =>
    getIso(right).localeCompare(getIso(left))
  );

const getWeekStartDate = (
  dateKey: string,
  weekStartsOn: "monday" | "sunday"
) => {
  const anchorDateUtc = parseDateKeyToUtcDate(dateKey);
  const anchorDay = anchorDateUtc.getUTCDay();
  const offset =
    weekStartsOn === "sunday" ? anchorDay : anchorDay === 0 ? 6 : anchorDay - 1;

  return addDaysToDateKey(dateKey, -offset);
};

const getBiweeklyWindowStart = (
  anchorDate: string,
  weekStartsOn: "monday" | "sunday"
) => {
  const anchorWeekStart = getWeekStartDate(anchorDate, weekStartsOn);
  const yearStart = makeYearStart(anchorDate);
  const cadenceStart = getWeekStartDate(yearStart, weekStartsOn);
  const elapsedDays = diffDateKeys(anchorWeekStart, cadenceStart);
  const elapsedBiweeklyPeriods = Math.floor(elapsedDays / 14);

  return addDaysToDateKey(cadenceStart, elapsedBiweeklyPeriods * 14);
};

const getPeriodRange = (
  cadence: StubCadence,
  anchorDate: string,
  weekStartsOn: "monday" | "sunday"
): DateRange => {
  if (cadence === "monthly") {
    const startDate = `${anchorDate.slice(0, 7)}-01`;
    const monthStartUtc = parseDateKeyToUtcDate(startDate);
    const nextMonthStartUtc = new Date(
      Date.UTC(
        monthStartUtc.getUTCFullYear(),
        monthStartUtc.getUTCMonth() + 1,
        1
      )
    );
    const endDate = toDateKeyFromUtcDate(
      new Date(nextMonthStartUtc.getTime() - MILLISECONDS_PER_DAY)
    );

    return { endDate, startDate };
  }

  if (cadence === "biweekly") {
    const startDate = getBiweeklyWindowStart(anchorDate, weekStartsOn);
    const endDate = addDaysToDateKey(startDate, 13);

    return { endDate, startDate };
  }

  const startDate = getWeekStartDate(anchorDate, weekStartsOn);
  const endDate = addDaysToDateKey(startDate, 6);

  return { endDate, startDate };
};

const buildCurrentCadenceDefaults = (
  context: UserStubContext
): Record<StubCadence, CadenceDefaultWindow> => {
  const currentDateKey =
    getDateKeyInTimeZone(new Date(), context.timezone) ||
    toDateKeyFromUtcDate(new Date());

  const buildWindow = (cadence: StubCadence): CadenceDefaultWindow => {
    const period = getPeriodRange(
      cadence,
      currentDateKey,
      context.weekStartsOn
    );
    return {
      anchorDate: period.startDate,
      period,
    };
  };

  return {
    biweekly: buildWindow("biweekly"),
    monthly: buildWindow("monthly"),
    weekly: buildWindow("weekly"),
  };
};

const makeYearStart = (dateKey: string) => `${dateKey.slice(0, 4)}-01-01`;

const normalizeStubFieldKeys = (
  value: unknown,
  fallback: readonly StubFieldKey[] = DEFAULT_STUB_FIELD_KEYS
): StubFieldKey[] => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const picked = value
    .map((item) => String(item).trim())
    .filter((item): item is StubFieldKey =>
      STUB_FIELD_KEY_SET.has(item as StubFieldKey)
    );

  const normalized = new Set<StubFieldKey>(picked);
  for (const requiredField of STUB_MANDATORY_FIELD_KEYS) {
    normalized.add(requiredField);
  }

  return STUB_FIELD_KEYS.filter((fieldKey) => normalized.has(fieldKey));
};

const normalizeVerificationProfile = (
  value: unknown,
  userName: string,
  userEmail: string
): StubVerificationProfile => {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const legalName =
    typeof record.legalName === "string" && record.legalName.trim().length > 0
      ? record.legalName.trim()
      : userName;

  return {
    address:
      typeof record.address === "string"
        ? record.address.trim()
        : DEFAULT_STUB_VERIFICATION_PROFILE.address,
    email:
      typeof record.email === "string" && record.email.trim().length > 0
        ? record.email.trim()
        : userEmail,
    issuerName: DEFAULT_STUB_VERIFICATION_PROFILE.issuerName,
    legalName,
    phone:
      typeof record.phone === "string"
        ? record.phone.trim()
        : DEFAULT_STUB_VERIFICATION_PROFILE.phone,
  };
};

const generateStubPublicId = () => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `gstub_${Date.now().toString(36)}_${randomPart}`;
};

const createEmptySnapshot = (args: {
  anchorDate: string;
  cadence: StubCadence;
  currencyCode: string;
  fieldKeys: StubFieldKey[];
  identity: StubVerificationProfile;
  period: DateRange;
  ytd: DateRange;
}): StubSnapshot => ({
  cadence: args.cadence,
  currencyCode: args.currencyCode,
  fieldKeys: args.fieldKeys,
  generatedAt: new Date().toISOString(),
  identity: args.identity,
  note: DEFAULT_STUB_NOTE,
  period: {
    anchorDate: args.anchorDate,
    endDate: args.period.endDate,
    startDate: args.period.startDate,
  },
  rows: {
    earnings: [],
    expenses: [],
    platformEarnings: [],
  },
  totals: {
    baseAmount: 0,
    bonusAmount: 0,
    businessExpenses: 0,
    grossEarnings: 0,
    hoursTotal: 0,
    milesTotal: 0,
    operatingNet: 0,
    ordersCount: 0,
    tipsTotal: 0,
  },
  ytd: {
    endDate: args.ytd.endDate,
    startDate: args.ytd.startDate,
    totals: {
      baseAmount: 0,
      bonusAmount: 0,
      businessExpenses: 0,
      grossEarnings: 0,
      hoursTotal: 0,
      milesTotal: 0,
      operatingNet: 0,
      ordersCount: 0,
      tipsTotal: 0,
    },
  },
});

const buildTotals = (args: {
  earningsRows: StubEarningsRow[];
  expenseRows: StubExpenseRow[];
}) => {
  const grossEarnings = args.earningsRows.reduce(
    (sum, row) => sum + row.effectiveTotal,
    0
  );
  const businessExpenses = args.expenseRows.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const tipsTotal = args.earningsRows.reduce(
    (sum, row) => sum + row.tipAmount,
    0
  );
  const baseAmount = args.earningsRows.reduce(
    (sum, row) => sum + row.baseAmount,
    0
  );
  const bonusAmount = args.earningsRows.reduce(
    (sum, row) => sum + row.bonusAmount,
    0
  );
  const milesTotal = args.earningsRows.reduce(
    (sum, row) => sum + row.distanceMiles,
    0
  );
  const hoursTotal = args.earningsRows.reduce(
    (sum, row) => sum + row.durationSeconds / SECONDS_PER_HOUR,
    0
  );

  return {
    baseAmount,
    bonusAmount,
    businessExpenses,
    grossEarnings,
    hoursTotal,
    milesTotal,
    operatingNet: grossEarnings - businessExpenses,
    ordersCount: args.earningsRows.length,
    tipsTotal,
  };
};

const buildPlatformEarningsRows = (
  earningsRows: StubEarningsRow[]
): StubPlatformEarningsRow[] => {
  const platformMap = new Map<string, StubPlatformEarningsRow>();
  for (const row of earningsRows) {
    const existing = platformMap.get(row.platformSlug);
    if (!existing) {
      platformMap.set(row.platformSlug, {
        baseAmount: row.baseAmount,
        bonusAmount: row.bonusAmount,
        grossEarnings: row.effectiveTotal,
        hoursTotal: row.durationSeconds / SECONDS_PER_HOUR,
        milesTotal: row.distanceMiles,
        ordersCount: 1,
        platformDisplayName: row.platformDisplayName,
        platformSlug: row.platformSlug,
        tipAmount: row.tipAmount,
      });
      continue;
    }

    existing.baseAmount += row.baseAmount;
    existing.bonusAmount += row.bonusAmount;
    existing.grossEarnings += row.effectiveTotal;
    existing.hoursTotal += row.durationSeconds / SECONDS_PER_HOUR;
    existing.milesTotal += row.distanceMiles;
    existing.ordersCount += 1;
    existing.tipAmount += row.tipAmount;
  }

  return [...platformMap.values()].toSorted(
    (left, right) => right.grossEarnings - left.grossEarnings
  );
};

const normalizeSnapshotIdentity = (
  value: unknown,
  fallback: StubVerificationProfile
): StubVerificationProfile => {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  return {
    address:
      typeof value.address === "string" ? value.address : fallback.address,
    email: typeof value.email === "string" ? value.email : fallback.email,
    issuerName:
      typeof value.issuerName === "string"
        ? value.issuerName
        : fallback.issuerName,
    legalName:
      typeof value.legalName === "string"
        ? value.legalName
        : fallback.legalName,
    phone: typeof value.phone === "string" ? value.phone : fallback.phone,
  };
};

const normalizeSnapshotTotals = (
  value: unknown,
  fallback: StubSnapshot["totals"],
  derived?: StubSnapshot["totals"]
): StubSnapshot["totals"] => {
  const source = isObjectRecord(value) ? value : {};

  return {
    baseAmount: toNumber(
      source.baseAmount ?? derived?.baseAmount ?? fallback.baseAmount
    ),
    bonusAmount: toNumber(
      source.bonusAmount ?? derived?.bonusAmount ?? fallback.bonusAmount
    ),
    businessExpenses: toNumber(
      source.businessExpenses ??
        derived?.businessExpenses ??
        fallback.businessExpenses
    ),
    grossEarnings: toNumber(
      source.grossEarnings ?? derived?.grossEarnings ?? fallback.grossEarnings
    ),
    hoursTotal: toNumber(
      source.hoursTotal ?? derived?.hoursTotal ?? fallback.hoursTotal
    ),
    milesTotal: toNumber(
      source.milesTotal ?? derived?.milesTotal ?? fallback.milesTotal
    ),
    operatingNet: toNumber(
      source.operatingNet ?? derived?.operatingNet ?? fallback.operatingNet
    ),
    ordersCount: toNumber(
      source.ordersCount ?? derived?.ordersCount ?? fallback.ordersCount
    ),
    tipsTotal: toNumber(
      source.tipsTotal ?? derived?.tipsTotal ?? fallback.tipsTotal
    ),
  };
};

const toSnapshotEarningsRows = (value: unknown): StubEarningsRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: StubEarningsRow[] = [];
  for (const item of value) {
    if (!isObjectRecord(item)) {
      continue;
    }

    const bonusAmount = toNumber(item.bonusAmount);
    const baseAmount = toNumber(item.baseAmount);
    // Legacy snapshots stored base as fare + bonus; adjust when duration is missing.
    const normalizedBaseAmount =
      "durationSeconds" in item
        ? baseAmount
        : Math.max(baseAmount - bonusAmount, 0);

    rows.push({
      baseAmount: normalizedBaseAmount,
      bonusAmount,
      distanceMiles: toNumber(item.distanceMiles),
      durationSeconds: toNumber(item.durationSeconds),
      effectiveTotal: toNumber(item.effectiveTotal),
      entryId: toNumber(item.entryId),
      occurredAt: typeof item.occurredAt === "string" ? item.occurredAt : "",
      platformDisplayName:
        typeof item.platformDisplayName === "string"
          ? item.platformDisplayName
          : "Unknown",
      platformSlug:
        typeof item.platformSlug === "string" ? item.platformSlug : "unknown",
      tipAmount: toNumber(item.tipAmount),
    });
  }

  return rows;
};

const toSnapshotExpenseRows = (value: unknown): StubExpenseRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: StubExpenseRow[] = [];
  for (const item of value) {
    if (!isObjectRecord(item)) {
      continue;
    }

    rows.push({
      amount: toNumber(item.amount),
      category: typeof item.category === "string" ? item.category : "",
      expenseId: toNumber(item.expenseId),
      incurredAt: typeof item.incurredAt === "string" ? item.incurredAt : "",
      merchant: typeof item.merchant === "string" ? item.merchant : "",
    });
  }

  return rows;
};

const toSnapshotPlatformRows = (value: unknown): StubPlatformEarningsRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: StubPlatformEarningsRow[] = [];
  for (const item of value) {
    if (!isObjectRecord(item)) {
      continue;
    }

    rows.push({
      baseAmount: toNumber(item.baseAmount),
      bonusAmount: toNumber(item.bonusAmount),
      grossEarnings: toNumber(item.grossEarnings),
      hoursTotal: toNumber(item.hoursTotal),
      milesTotal: toNumber(item.milesTotal),
      ordersCount: toNumber(item.ordersCount),
      platformDisplayName:
        typeof item.platformDisplayName === "string"
          ? item.platformDisplayName
          : "Unknown",
      platformSlug:
        typeof item.platformSlug === "string" ? item.platformSlug : "unknown",
      tipAmount: toNumber(item.tipAmount),
    });
  }

  return rows;
};

const toLegacyPlatformRows = (value: unknown): StubPlatformEarningsRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: StubPlatformEarningsRow[] = [];
  for (const item of value) {
    if (!isObjectRecord(item)) {
      continue;
    }

    rows.push({
      baseAmount: 0,
      bonusAmount: 0,
      grossEarnings: toNumber(item.grossEarnings),
      hoursTotal: 0,
      milesTotal: 0,
      ordersCount: toNumber(item.ordersCount),
      platformDisplayName:
        typeof item.platformDisplayName === "string"
          ? item.platformDisplayName
          : "Unknown",
      platformSlug:
        typeof item.platformSlug === "string" ? item.platformSlug : "unknown",
      tipAmount: 0,
    });
  }

  return rows;
};

const toStubProfileRecord = (
  row: typeof stubProfiles.$inferSelect,
  userName: string,
  userEmail: string
): StubProfileRecord => ({
  autoGenerateEnabled: row.autoGenerateEnabled,
  createdAt: row.createdAt.toISOString(),
  defaultFieldKeys: normalizeStubFieldKeys(row.defaultFieldKeys),
  id: row.id,
  primaryCadence: row.primaryCadence,
  updatedAt: row.updatedAt.toISOString(),
  userId: row.userId,
  verificationProfile: normalizeVerificationProfile(
    row.verificationProfile,
    userName,
    userEmail
  ),
});

const toSnapshot = (value: unknown, fallback: StubSnapshot): StubSnapshot => {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  const periodRecord = isObjectRecord(value.period) ? value.period : {};
  const rowsRecord = isObjectRecord(value.rows) ? value.rows : {};
  const ytdRecord = isObjectRecord(value.ytd) ? value.ytd : {};
  const ytdTotalsRecord = isObjectRecord(ytdRecord.totals)
    ? ytdRecord.totals
    : {};

  const earningsRows = toSnapshotEarningsRows(rowsRecord.earnings);
  const expenseRows = toSnapshotExpenseRows(rowsRecord.expenses);
  const providedPlatformRows = toSnapshotPlatformRows(
    rowsRecord.platformEarnings
  );
  const platformRows =
    providedPlatformRows.length > 0
      ? earningsRows.length > 0
        ? buildPlatformEarningsRows(earningsRows)
        : toLegacyPlatformRows(value.platformBreakdown)
      : toLegacyPlatformRows(value.platformBreakdown);
  const periodTotals = normalizeSnapshotTotals(
    value.totals,
    fallback.totals,
    buildTotals({ earningsRows, expenseRows })
  );

  return {
    cadence:
      value.cadence === "biweekly" ||
      value.cadence === "monthly" ||
      value.cadence === "weekly"
        ? value.cadence
        : fallback.cadence,
    currencyCode:
      typeof value.currencyCode === "string"
        ? value.currencyCode
        : fallback.currencyCode,
    fieldKeys: normalizeStubFieldKeys(value.fieldKeys, fallback.fieldKeys),
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : fallback.generatedAt,
    identity: normalizeSnapshotIdentity(value.identity, fallback.identity),
    note: typeof value.note === "string" ? value.note : fallback.note,
    period: {
      anchorDate:
        typeof periodRecord.anchorDate === "string"
          ? periodRecord.anchorDate
          : fallback.period.anchorDate,
      endDate:
        typeof periodRecord.endDate === "string"
          ? periodRecord.endDate
          : fallback.period.endDate,
      startDate:
        typeof periodRecord.startDate === "string"
          ? periodRecord.startDate
          : fallback.period.startDate,
    },
    rows: {
      earnings: earningsRows,
      expenses: expenseRows,
      platformEarnings: platformRows,
    },
    totals: periodTotals,
    ytd: {
      endDate:
        typeof ytdRecord.endDate === "string"
          ? ytdRecord.endDate
          : fallback.ytd.endDate,
      startDate:
        typeof ytdRecord.startDate === "string"
          ? ytdRecord.startDate
          : fallback.ytd.startDate,
      totals: normalizeSnapshotTotals(ytdTotalsRecord, fallback.ytd.totals),
    },
  };
};

const toIncomeStubRecord = (
  row: typeof incomeStubs.$inferSelect,
  fallbackSnapshot: StubSnapshot
): IncomeStubRecord => ({
  anchorDate: row.anchorDate,
  cadence: row.cadence,
  computedAt: row.computedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  fieldKeys: normalizeStubFieldKeys(row.fieldKeys),
  id: row.id,
  lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
  periodEnd: row.periodEnd,
  periodStart: row.periodStart,
  publicId: row.publicId,
  revision: row.revision,
  snapshot: toSnapshot(row.snapshot, fallbackSnapshot),
  source: row.source,
  status: row.status,
  updatedAt: row.updatedAt.toISOString(),
  userId: row.userId,
  ytdEnd: row.ytdEnd,
  ytdStart: row.ytdStart,
});

const buildBackfillAnchors = (args: {
  cadence: StubCadence;
  currentDateKey: string;
  weekStartsOn: "monday" | "sunday";
  yearStartDateKey: string;
}) => {
  const anchors: string[] = [];

  if (args.cadence === "monthly") {
    let pointer = `${args.yearStartDateKey.slice(0, 4)}-01-01`;

    while (true) {
      const period = getPeriodRange("monthly", pointer, args.weekStartsOn);
      if (period.endDate >= args.currentDateKey) {
        break;
      }

      anchors.push(pointer);
      pointer = addDaysToDateKey(period.endDate, 1);
    }

    return anchors;
  }

  const periodLengthDays = args.cadence === "biweekly" ? 14 : 7;
  let pointer = getPeriodRange(
    args.cadence,
    args.yearStartDateKey,
    args.weekStartsOn
  ).startDate;

  while (true) {
    const periodEnd = addDaysToDateKey(pointer, periodLengthDays - 1);
    if (periodEnd >= args.currentDateKey) {
      break;
    }

    if (periodEnd >= args.yearStartDateKey) {
      anchors.push(pointer);
    }

    pointer = addDaysToDateKey(pointer, periodLengthDays);
  }

  return anchors;
};

const buildFallbackSnapshotFromRow = (args: {
  context: UserStubContext;
  fieldKeys: StubFieldKey[];
  profile: StubProfileRecord;
  row: typeof incomeStubs.$inferSelect;
}) =>
  createEmptySnapshot({
    anchorDate: args.row.anchorDate,
    cadence: args.row.cadence,
    currencyCode: args.context.currencyCode,
    fieldKeys: args.fieldKeys,
    identity: args.profile.verificationProfile,
    period: {
      endDate: args.row.periodEnd,
      startDate: args.row.periodStart,
    },
    ytd: {
      endDate: args.row.ytdEnd,
      startDate: args.row.ytdStart,
    },
  });

const resolveStubInputs = async (args: {
  context?: UserStubContext;
  profile?: StubProfileRecord;
  userId: number;
}) => {
  const context = args.context || (await getUserStubContext(args.userId));
  const profile =
    args.profile || (await getOrCreateStubProfile(args.userId, context));

  return { context, profile };
};

export async function getUserStubContext(
  userId: number
): Promise<UserStubContext> {
  const [user] = await db
    .select({
      currencyCode: users.currencyCode,
      email: users.email,
      name: users.name,
      timezone: users.timezone,
      weekStartsOn: users.weekStartsOn,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  return {
    currencyCode: user.currencyCode || "USD",
    email: user.email,
    name: user.name,
    timezone: normalizeTimeZone(user.timezone),
    weekStartsOn: user.weekStartsOn,
  };
}

export async function getOrCreateStubProfile(
  userId: number,
  context?: UserStubContext
): Promise<StubProfileRecord> {
  const userContext = context || (await getUserStubContext(userId));
  const [existing] = await db
    .select()
    .from(stubProfiles)
    .where(eq(stubProfiles.userId, userId))
    .limit(1);

  if (existing) {
    return toStubProfileRecord(existing, userContext.name, userContext.email);
  }

  const [created] = await db
    .insert(stubProfiles)
    .values({
      autoGenerateEnabled: true,
      defaultFieldKeys: DEFAULT_STUB_FIELD_KEYS,
      primaryCadence: "weekly",
      updatedAt: new Date(),
      userId,
      verificationProfile: {
        ...DEFAULT_STUB_VERIFICATION_PROFILE,
        email: userContext.email,
        legalName: userContext.name,
      },
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create stub profile");
  }

  return toStubProfileRecord(created, userContext.name, userContext.email);
}

export async function updateStubProfileForUser(args: {
  patch: {
    autoGenerateEnabled?: boolean;
    defaultFieldKeys?: StubFieldKey[];
    primaryCadence?: StubCadence;
    verificationProfile?: Partial<StubVerificationProfile>;
  };
  userId: number;
}): Promise<StubProfileRecord> {
  const context = await getUserStubContext(args.userId);
  const existing = await getOrCreateStubProfile(args.userId, context);

  const nextFieldKeys = args.patch.defaultFieldKeys
    ? normalizeStubFieldKeys(args.patch.defaultFieldKeys)
    : existing.defaultFieldKeys;

  const nextVerification = normalizeVerificationProfile(
    {
      ...existing.verificationProfile,
      ...args.patch.verificationProfile,
    },
    context.name,
    context.email
  );

  const [updated] = await db
    .update(stubProfiles)
    .set({
      autoGenerateEnabled:
        args.patch.autoGenerateEnabled ?? existing.autoGenerateEnabled,
      defaultFieldKeys: nextFieldKeys,
      primaryCadence: args.patch.primaryCadence ?? existing.primaryCadence,
      updatedAt: new Date(),
      verificationProfile: nextVerification,
    })
    .where(eq(stubProfiles.userId, args.userId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update stub profile");
  }

  return toStubProfileRecord(updated, context.name, context.email);
}

export async function buildStubSnapshot(
  args: BuildSnapshotArgs
): Promise<{ period: DateRange; snapshot: StubSnapshot; ytd: DateRange }> {
  const period = getPeriodRange(
    args.cadence,
    args.anchorDate,
    args.context.weekStartsOn
  );
  const ytd: DateRange = {
    endDate: period.endDate,
    startDate: makeYearStart(period.endDate),
  };

  const [entryRows, expenseRows] = await Promise.all([
    db
      .select({
        bonusAmount: earningsEntries.bonusAmount,
        distanceMiles: earningsEntries.distanceMiles,
        durationSeconds: earningsEntries.durationSeconds,
        fareAmount: earningsEntries.fareAmount,
        id: earningsEntries.id,
        occurredAt: earningsEntries.occurredAt,
        platformDisplayName: platforms.displayName,
        platformSlug: platforms.slug,
        tipEstimatedAmount: earningsEntries.tipEstimatedAmount,
        tipFinalAmount: earningsEntries.tipFinalAmount,
        tipStatus: earningsEntries.tipStatus,
        totalEstimatedAmount: earningsEntries.totalEstimatedAmount,
        totalFinalAmount: earningsEntries.totalFinalAmount,
      })
      .from(earningsEntries)
      .innerJoin(platforms, eq(earningsEntries.platformId, platforms.id))
      .where(
        and(
          eq(earningsEntries.userId, args.userId),
          eq(earningsEntries.status, "completed")
        )
      )
      .orderBy(desc(earningsEntries.occurredAt)),
    db
      .select({
        amount: expenses.amount,
        category: expenses.category,
        id: expenses.id,
        incurredAt: expenses.incurredAt,
        merchant: expenses.merchant,
      })
      .from(expenses)
      .where(eq(expenses.userId, args.userId))
      .orderBy(desc(expenses.incurredAt)),
  ]);

  const periodEarningsRows: StubEarningsRow[] = [];
  const ytdEarningsRows: StubEarningsRow[] = [];

  for (const row of entryRows) {
    const occurredDateKey = getDateKeyInTimeZone(
      row.occurredAt,
      args.context.timezone
    );
    if (!occurredDateKey) {
      continue;
    }

    const normalizedRow: StubEarningsRow = {
      baseAmount: toNumber(row.fareAmount),
      bonusAmount: toNumber(row.bonusAmount),
      distanceMiles: toNumber(row.distanceMiles),
      durationSeconds: toNumber(row.durationSeconds),
      effectiveTotal: getEffectiveTotal(
        row as unknown as Record<string, unknown>
      ),
      entryId: row.id,
      occurredAt: toIsoString(row.occurredAt),
      platformDisplayName: row.platformDisplayName,
      platformSlug: row.platformSlug,
      tipAmount: getEffectiveTip(row as unknown as Record<string, unknown>),
    };

    if (inDateRange(occurredDateKey, ytd)) {
      ytdEarningsRows.push(normalizedRow);
    }

    if (inDateRange(occurredDateKey, period)) {
      periodEarningsRows.push(normalizedRow);
    }
  }

  const periodExpenseRows: StubExpenseRow[] = [];
  const ytdExpenseRows: StubExpenseRow[] = [];

  for (const row of expenseRows) {
    const incurredDateKey = getDateKeyInTimeZone(
      row.incurredAt,
      args.context.timezone
    );
    if (!incurredDateKey) {
      continue;
    }

    const normalizedRow: StubExpenseRow = {
      amount: toNumber(row.amount),
      category: row.category,
      expenseId: row.id,
      incurredAt: toIsoString(row.incurredAt),
      merchant: row.merchant || "",
    };

    if (inDateRange(incurredDateKey, ytd)) {
      ytdExpenseRows.push(normalizedRow);
    }

    if (inDateRange(incurredDateKey, period)) {
      periodExpenseRows.push(normalizedRow);
    }
  }

  const sortedPeriodEarnings = sortByIsoDesc(
    periodEarningsRows,
    (row) => row.occurredAt
  );
  const sortedPeriodExpenses = sortByIsoDesc(
    periodExpenseRows,
    (row) => row.incurredAt
  );
  const periodPlatformRows = buildPlatformEarningsRows(sortedPeriodEarnings);

  const snapshot: StubSnapshot = {
    cadence: args.cadence,
    currencyCode: args.context.currencyCode,
    fieldKeys: args.fieldKeys,
    generatedAt: new Date().toISOString(),
    identity: args.verificationProfile,
    note: DEFAULT_STUB_NOTE,
    period: {
      anchorDate: args.anchorDate,
      endDate: period.endDate,
      startDate: period.startDate,
    },
    rows: {
      earnings: sortedPeriodEarnings,
      expenses: sortedPeriodExpenses,
      platformEarnings: periodPlatformRows,
    },
    totals: buildTotals({
      earningsRows: sortedPeriodEarnings,
      expenseRows: sortedPeriodExpenses,
    }),
    ytd: {
      endDate: ytd.endDate,
      startDate: ytd.startDate,
      totals: buildTotals({
        earningsRows: ytdEarningsRows,
        expenseRows: ytdExpenseRows,
      }),
    },
  };

  return { period, snapshot, ytd };
}

export async function buildStubPreviewForUser(args: {
  anchorDate: string;
  cadence: StubCadence;
  fieldKeys?: StubFieldKey[];
  userId: number;
}) {
  const { context, profile } = await resolveStubInputs({ userId: args.userId });
  const fieldKeys = normalizeStubFieldKeys(
    args.fieldKeys,
    profile.defaultFieldKeys
  );
  const { period, snapshot, ytd } = await buildStubSnapshot({
    anchorDate: args.anchorDate,
    cadence: args.cadence,
    context,
    fieldKeys,
    userId: args.userId,
    verificationProfile: profile.verificationProfile,
  });

  return {
    fieldKeys,
    period,
    profile,
    snapshot,
    ytd,
  };
}

export async function upsertDraftStubForUser(
  args: UpsertDraftStubArgs
): Promise<IncomeStubRecord> {
  const { context, profile } = await resolveStubInputs({
    context: args.context,
    profile: args.profile,
    userId: args.userId,
  });

  const fieldKeys = normalizeStubFieldKeys(
    args.fieldKeys,
    profile.defaultFieldKeys
  );
  const source = args.source || "manual";

  const { period, snapshot, ytd } = await buildStubSnapshot({
    anchorDate: args.anchorDate,
    cadence: args.cadence,
    context,
    fieldKeys,
    userId: args.userId,
    verificationProfile: profile.verificationProfile,
  });

  const [existingDraft] = await db
    .select()
    .from(incomeStubs)
    .where(
      and(
        eq(incomeStubs.userId, args.userId),
        eq(incomeStubs.cadence, args.cadence),
        eq(incomeStubs.periodStart, period.startDate),
        eq(incomeStubs.periodEnd, period.endDate),
        eq(incomeStubs.status, "draft")
      )
    )
    .limit(1);

  if (existingDraft) {
    const [updatedDraft] = await db
      .update(incomeStubs)
      .set({
        anchorDate: args.anchorDate,
        computedAt: new Date(),
        fieldKeys,
        snapshot,
        source,
        updatedAt: new Date(),
        ytdEnd: ytd.endDate,
        ytdStart: ytd.startDate,
      })
      .where(eq(incomeStubs.id, existingDraft.id))
      .returning();

    if (!updatedDraft) {
      throw new Error("Failed to update draft stub");
    }

    return toIncomeStubRecord(updatedDraft, snapshot);
  }

  const [latestForPeriod] = await db
    .select({ revision: incomeStubs.revision })
    .from(incomeStubs)
    .where(
      and(
        eq(incomeStubs.userId, args.userId),
        eq(incomeStubs.cadence, args.cadence),
        eq(incomeStubs.periodStart, period.startDate),
        eq(incomeStubs.periodEnd, period.endDate)
      )
    )
    .orderBy(desc(incomeStubs.revision))
    .limit(1);

  const [createdDraft] = await db
    .insert(incomeStubs)
    .values({
      anchorDate: args.anchorDate,
      cadence: args.cadence,
      computedAt: new Date(),
      fieldKeys,
      periodEnd: period.endDate,
      periodStart: period.startDate,
      publicId: generateStubPublicId(),
      revision: (latestForPeriod?.revision || 0) + 1,
      snapshot,
      source,
      status: "draft",
      updatedAt: new Date(),
      userId: args.userId,
      ytdEnd: ytd.endDate,
      ytdStart: ytd.startDate,
    })
    .returning();

  if (!createdDraft) {
    throw new Error("Failed to create draft stub");
  }

  return toIncomeStubRecord(createdDraft, snapshot);
}

export async function backfillPrimaryCadenceForUser(userId: number) {
  const { context, profile } = await resolveStubInputs({ userId });

  if (!profile.autoGenerateEnabled) {
    return;
  }

  const currentDateKey =
    getDateKeyInTimeZone(new Date(), context.timezone) ||
    toDateKeyFromUtcDate(new Date());
  const yearStartDateKey = makeYearStart(currentDateKey);

  const anchors = buildBackfillAnchors({
    cadence: profile.primaryCadence,
    currentDateKey,
    weekStartsOn: context.weekStartsOn,
    yearStartDateKey,
  });

  if (anchors.length === 0) {
    return;
  }

  const existingRows = await db
    .select({
      cadence: incomeStubs.cadence,
      periodEnd: incomeStubs.periodEnd,
      periodStart: incomeStubs.periodStart,
    })
    .from(incomeStubs)
    .where(
      and(
        eq(incomeStubs.userId, userId),
        eq(incomeStubs.cadence, profile.primaryCadence)
      )
    );

  const existingWindows = new Set(
    existingRows.map((row) => `${row.periodStart}:${row.periodEnd}`)
  );

  for (const anchorDate of anchors) {
    const period = getPeriodRange(
      profile.primaryCadence,
      anchorDate,
      context.weekStartsOn
    );
    const periodKey = `${period.startDate}:${period.endDate}`;

    if (existingWindows.has(periodKey)) {
      continue;
    }

    await upsertDraftStubForUser({
      anchorDate,
      cadence: profile.primaryCadence,
      context,
      fieldKeys: profile.defaultFieldKeys,
      profile,
      source: "autogen",
      userId,
    });

    existingWindows.add(periodKey);
  }
}

export async function listStubsForUser(args: {
  includeBackfill?: boolean;
  limit?: number;
  userId: number;
}) {
  if (args.includeBackfill !== false) {
    await backfillPrimaryCadenceForUser(args.userId);
  }

  const { context, profile } = await resolveStubInputs({ userId: args.userId });
  const resolvedLimit = Math.max(1, Math.min(args.limit ?? 250, 250));

  const rows = await db
    .select()
    .from(incomeStubs)
    .where(eq(incomeStubs.userId, args.userId))
    .orderBy(
      desc(incomeStubs.periodEnd),
      desc(incomeStubs.revision),
      desc(incomeStubs.createdAt)
    )
    .limit(resolvedLimit);

  return {
    defaults: buildCurrentCadenceDefaults(context),
    profile,
    stubs: rows.map((row) => {
      const fieldKeys = normalizeStubFieldKeys(
        row.fieldKeys,
        profile.defaultFieldKeys
      );
      const fallbackSnapshot = buildFallbackSnapshotFromRow({
        context,
        fieldKeys,
        profile,
        row,
      });

      return toIncomeStubRecord(row, fallbackSnapshot);
    }),
  };
}

export async function getStubByPublicId(args: {
  publicId: string;
  recomputeDraft?: boolean;
  userId: number;
}): Promise<IncomeStubRecord | null> {
  const { context, profile } = await resolveStubInputs({ userId: args.userId });

  const [row] = await db
    .select()
    .from(incomeStubs)
    .where(
      and(
        eq(incomeStubs.userId, args.userId),
        eq(incomeStubs.publicId, args.publicId)
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const rowFieldKeys = normalizeStubFieldKeys(
    row.fieldKeys,
    profile.defaultFieldKeys
  );

  if (row.status === "draft" && args.recomputeDraft !== false) {
    return await upsertDraftStubForUser({
      anchorDate: row.anchorDate,
      cadence: row.cadence,
      context,
      fieldKeys: rowFieldKeys,
      profile,
      source: row.source,
      userId: args.userId,
    });
  }

  const fallbackSnapshot = buildFallbackSnapshotFromRow({
    context,
    fieldKeys: rowFieldKeys,
    profile,
    row,
  });

  return toIncomeStubRecord(row, fallbackSnapshot);
}

export async function lockStubByPublicId(args: {
  publicId: string;
  userId: number;
}): Promise<IncomeStubRecord | null> {
  const existing = await getStubByPublicId({
    publicId: args.publicId,
    recomputeDraft: true,
    userId: args.userId,
  });

  if (!existing) {
    return null;
  }

  if (existing.status === "locked") {
    return existing;
  }

  const [locked] = await db
    .update(incomeStubs)
    .set({
      computedAt: new Date(),
      lockedAt: new Date(),
      status: "locked",
      updatedAt: new Date(),
    })
    .where(
      and(eq(incomeStubs.id, existing.id), eq(incomeStubs.userId, args.userId))
    )
    .returning();

  if (!locked) {
    throw new Error("Failed to lock stub");
  }

  return toIncomeStubRecord(locked, existing.snapshot);
}

const escapeCsvCell = (value: string | number) => {
  const input = String(value);
  if (input.includes(",") || input.includes('"') || input.includes("\n")) {
    return `"${input.replaceAll('"', '""')}"`;
  }

  return input;
};

const toMoney = (value: number) => value.toFixed(2);

const DIACRITICS_REGEX = /[\u0300-\u036F]/gu;
const NON_ALPHANUMERIC_LOWERCASE_REGEX = /[^a-z0-9]+/gu;
const LEADING_TRAILING_HYPHENS_REGEX = /^-+|-+$/gu;
const MULTIPLE_HYPHENS_REGEX = /-{2,}/gu;
const NON_PRINTABLE_ASCII_REGEX = /[^\u0020-\u007E]/gu;

const removeDiacritics = (value: string): string =>
  value.normalize("NFKD").replace(DIACRITICS_REGEX, "");

const toWorkerSlugToken = (value: string): string => {
  const lowercased = value.trim().toLowerCase();
  const withoutDiacritics = removeDiacritics(lowercased);
  const withHyphens = withoutDiacritics.replace(
    NON_ALPHANUMERIC_LOWERCASE_REGEX,
    "-"
  );
  const trimmedHyphens = withHyphens.replace(
    LEADING_TRAILING_HYPHENS_REGEX,
    ""
  );

  return trimmedHyphens.replace(MULTIPLE_HYPHENS_REGEX, "-");
};

const toPdfSafeText = (value: string): string =>
  removeDiacritics(value).replace(NON_PRINTABLE_ASCII_REGEX, "?");
const escapePdfText = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

const buildPdfFromLines = (lines: string[]) => {
  const maxLinesPerPage = 44;
  const pageChunks: string[][] = [];

  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pageChunks.push(lines.slice(index, index + maxLinesPerPage));
  }

  if (pageChunks.length === 0) {
    pageChunks.push(["GigStax Stub Export"]);
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontObjectId = 3;
  let nextObjectId = 4;

  const contentStreams: {
    contentId: number;
    pageId: number;
    stream: string;
  }[] = [];
  for (const chunk of pageChunks) {
    const pageId = nextObjectId;
    const contentId = nextObjectId + 1;
    pageObjectIds.push(pageId);
    contentStreams.push({
      contentId,
      pageId,
      stream: chunk
        .map((line, lineIndex) => {
          const y = 760 - lineIndex * 16;
          return `BT /F1 11 Tf 42 ${y} Td (${escapePdfText(line)}) Tj ET`;
        })
        .join("\n"),
    });
    nextObjectId += 2;
  }

  const pagesObjectId = 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] >>`;
  objects[fontObjectId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (const entry of contentStreams) {
    objects[entry.pageId] =
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${entry.contentId} 0 R >>`;
    objects[entry.contentId] =
      `<< /Length ${entry.stream.length} >>\nstream\n${entry.stream}\nendstream`;
  }

  const header = "%PDF-1.4\n";
  const bodyParts: string[] = [];
  const offsets: number[] = [0];
  let byteOffset = header.length;

  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    const objectBody = `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
    offsets[objectId] = byteOffset;
    bodyParts.push(objectBody);
    byteOffset += objectBody.length;
  }

  const body = bodyParts.join("");
  const xrefOffset = header.length + body.length;
  const objectCount = objects.length;
  const xrefParts: string[] = [
    `xref\n0 ${objectCount}\n`,
    "0000000000 65535 f \n",
  ];
  for (let objectId = 1; objectId < objectCount; objectId += 1) {
    xrefParts.push(
      `${offsets[objectId]?.toString().padStart(10, "0") ?? ""} 00000 n \n`
    );
  }

  const xref = xrefParts.join("");
  const trailer = `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const pdf = `${header}${body}${xref}${trailer}`;
  return new TextEncoder().encode(pdf);
};

const resolveExportDateToken = (stub: IncomeStubRecord) => {
  const candidates = [stub.snapshot.period.endDate, stub.periodEnd];
  for (const candidate of candidates) {
    if (ISO_DATE_REGEX.test(candidate)) {
      return candidate;
    }
  }

  return toDateKeyFromUtcDate(new Date());
};

export function buildStubExportBaseName(stub: IncomeStubRecord) {
  const dateToken = resolveExportDateToken(stub);
  const legalNameToken = toWorkerSlugToken(stub.snapshot.identity.legalName);
  const workerToken = legalNameToken || toWorkerSlugToken(stub.publicId);

  return `gigstax-stub-${dateToken}-${workerToken}`;
}

export function buildStubPdfBytes(stub: IncomeStubRecord) {
  const periodLabel = `${stub.snapshot.period.startDate} to ${stub.snapshot.period.endDate}`;
  const ytdLabel = `${stub.snapshot.ytd.startDate} to ${stub.snapshot.ytd.endDate}`;
  const currencyCode = stub.snapshot.currencyCode || "USD";
  const toCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      currency: currencyCode,
      style: "currency",
    }).format(value);

  const lines: string[] = [
    "GigStax Income Stub",
    "",
    `Stub ID: ${stub.publicId}`,
    `Status: ${stub.status}`,
    `Cadence: ${stub.cadence}`,
    `Revision: v${stub.revision}`,
    "",
    "Identity",
    `Worker: ${stub.snapshot.identity.legalName || "N/A"}`,
    `Issuer: ${stub.snapshot.identity.issuerName || "GigStax"}`,
    `Email: ${stub.snapshot.identity.email || "N/A"}`,
    `Phone: ${stub.snapshot.identity.phone || "N/A"}`,
    `Address: ${stub.snapshot.identity.address || "N/A"}`,
    "",
    "Reporting Windows",
    `Period: ${periodLabel}`,
    `YTD: ${ytdLabel}`,
    `Generated: ${new Date(stub.snapshot.generatedAt).toLocaleString()}`,
    "",
    "Period Totals",
    `Gross Earnings: ${toCurrency(stub.snapshot.totals.grossEarnings)}`,
    `Business Expenses: ${toCurrency(stub.snapshot.totals.businessExpenses)}`,
    `Operating Net: ${toCurrency(stub.snapshot.totals.operatingNet)}`,
    `Base: ${toCurrency(stub.snapshot.totals.baseAmount)}`,
    `Bonus: ${toCurrency(stub.snapshot.totals.bonusAmount)}`,
    `Tips: ${toCurrency(stub.snapshot.totals.tipsTotal)}`,
    `Orders: ${stub.snapshot.totals.ordersCount}`,
    `Hours: ${stub.snapshot.totals.hoursTotal.toFixed(2)}`,
    `Miles: ${stub.snapshot.totals.milesTotal.toFixed(2)}`,
    "",
    "YTD Totals",
    `Gross Earnings: ${toCurrency(stub.snapshot.ytd.totals.grossEarnings)}`,
    `Business Expenses: ${toCurrency(stub.snapshot.ytd.totals.businessExpenses)}`,
    `Operating Net: ${toCurrency(stub.snapshot.ytd.totals.operatingNet)}`,
    `Base: ${toCurrency(stub.snapshot.ytd.totals.baseAmount)}`,
    `Bonus: ${toCurrency(stub.snapshot.ytd.totals.bonusAmount)}`,
    `Tips: ${toCurrency(stub.snapshot.ytd.totals.tipsTotal)}`,
    `Orders: ${stub.snapshot.ytd.totals.ordersCount}`,
    `Hours: ${stub.snapshot.ytd.totals.hoursTotal.toFixed(2)}`,
    `Miles: ${stub.snapshot.ytd.totals.milesTotal.toFixed(2)}`,
  ];

  if (stub.snapshot.rows.platformEarnings.length > 0) {
    lines.push("", "Platform Totals");
    for (const row of stub.snapshot.rows.platformEarnings) {
      lines.push(
        `${row.platformDisplayName} (${row.platformSlug})`,
        `  Gross: ${toCurrency(row.grossEarnings)} | Base: ${toCurrency(
          row.baseAmount
        )} | Bonus: ${toCurrency(row.bonusAmount)} | Tips: ${toCurrency(
          row.tipAmount
        )}`,
        `  Orders: ${row.ordersCount} | Hours: ${row.hoursTotal.toFixed(
          2
        )} | Miles: ${row.milesTotal.toFixed(2)}`
      );
    }
  }

  return buildPdfFromLines(lines.map(toPdfSafeText));
}

export function buildStubCsv(stub: IncomeStubRecord) {
  const lines: string[] = [];
  const writeLine = (values: (string | number)[]) => {
    lines.push(values.map(escapeCsvCell).join(","));
  };

  writeLine(["stub_id", stub.publicId]);
  writeLine(["status", stub.status]);
  writeLine(["cadence", stub.cadence]);
  writeLine(["revision", stub.revision]);
  writeLine(["period_start", stub.snapshot.period.startDate]);
  writeLine(["period_end", stub.snapshot.period.endDate]);
  writeLine(["ytd_start", stub.snapshot.ytd.startDate]);
  writeLine(["ytd_end", stub.snapshot.ytd.endDate]);
  writeLine([]);

  writeLine([
    "section",
    "base_amount",
    "bonus_amount",
    "gross_earnings",
    "business_expenses",
    "operating_net",
    "orders_count",
    "hours_total",
    "miles_total",
    "tips_total",
  ]);
  writeLine([
    "period_totals",
    toMoney(stub.snapshot.totals.baseAmount),
    toMoney(stub.snapshot.totals.bonusAmount),
    toMoney(stub.snapshot.totals.grossEarnings),
    toMoney(stub.snapshot.totals.businessExpenses),
    toMoney(stub.snapshot.totals.operatingNet),
    stub.snapshot.totals.ordersCount,
    stub.snapshot.totals.hoursTotal.toFixed(2),
    stub.snapshot.totals.milesTotal.toFixed(2),
    toMoney(stub.snapshot.totals.tipsTotal),
  ]);
  writeLine([
    "ytd_totals",
    toMoney(stub.snapshot.ytd.totals.baseAmount),
    toMoney(stub.snapshot.ytd.totals.bonusAmount),
    toMoney(stub.snapshot.ytd.totals.grossEarnings),
    toMoney(stub.snapshot.ytd.totals.businessExpenses),
    toMoney(stub.snapshot.ytd.totals.operatingNet),
    stub.snapshot.ytd.totals.ordersCount,
    stub.snapshot.ytd.totals.hoursTotal.toFixed(2),
    stub.snapshot.ytd.totals.milesTotal.toFixed(2),
    toMoney(stub.snapshot.ytd.totals.tipsTotal),
  ]);
  writeLine([]);

  writeLine([
    "section",
    "platform_slug",
    "platform_display_name",
    "orders_count",
    "hours_total",
    "base_amount",
    "bonus_amount",
    "tip_amount",
    "gross_earnings",
    "miles_total",
  ]);
  for (const row of stub.snapshot.rows.platformEarnings) {
    writeLine([
      "platform_totals",
      row.platformSlug,
      row.platformDisplayName,
      row.ordersCount,
      row.hoursTotal.toFixed(2),
      toMoney(row.baseAmount),
      toMoney(row.bonusAmount),
      toMoney(row.tipAmount),
      toMoney(row.grossEarnings),
      row.milesTotal.toFixed(2),
    ]);
  }

  writeLine([]);
  writeLine(["expense_id", "incurred_at", "category", "merchant", "amount"]);
  for (const row of stub.snapshot.rows.expenses) {
    writeLine([
      row.expenseId,
      row.incurredAt,
      row.category,
      row.merchant,
      toMoney(row.amount),
    ]);
  }

  return lines.join("\n");
}

export const __stubsInternals = {
  buildBackfillAnchors,
  buildCurrentCadenceDefaults,
  buildStubExportBaseName,
  getBiweeklyWindowStart,
  getPeriodRange,
  getWeekStartDate,
  normalizeStubFieldKeys,
};
