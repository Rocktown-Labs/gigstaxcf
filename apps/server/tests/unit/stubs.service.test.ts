import { describe, expect, it } from "vitest";

const TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
process.env.DATABASE_URL ??= TEST_DATABASE_URL;

const loadStubsService = async () => await import("@/lib/services/stubs");

describe("stubs service helpers", () => {
  it("computes weekly and biweekly ranges from week starts", async () => {
    const { __stubsInternals } = await loadStubsService();

    expect(
      __stubsInternals.getPeriodRange("weekly", "2026-02-27", "sunday")
    ).toStrictEqual({
      endDate: "2026-02-28",
      startDate: "2026-02-22",
    });

    expect(
      __stubsInternals.getPeriodRange("weekly", "2026-02-27", "monday")
    ).toStrictEqual({
      endDate: "2026-03-01",
      startDate: "2026-02-23",
    });

    expect(
      __stubsInternals.getPeriodRange("biweekly", "2026-02-27", "monday")
    ).toStrictEqual({
      endDate: "2026-03-08",
      startDate: "2026-02-23",
    });

    expect(
      __stubsInternals.getPeriodRange("biweekly", "2026-02-27", "sunday")
    ).toStrictEqual({
      endDate: "2026-03-07",
      startDate: "2026-02-22",
    });
  });

  it("computes monthly range", async () => {
    const { __stubsInternals } = await loadStubsService();

    expect(
      __stubsInternals.getPeriodRange("monthly", "2026-02-27", "sunday")
    ).toStrictEqual({
      endDate: "2026-02-28",
      startDate: "2026-02-01",
    });
  });

  it("enforces core mandatory fields in field-key normalization", async () => {
    const { __stubsInternals } = await loadStubsService();
    const normalized = __stubsInternals.normalizeStubFieldKeys([
      "platform_breakdown",
      "tips_total",
    ]);

    expect(normalized).toContain("identity_block");
    expect(normalized).toContain("summary_totals");
    expect(normalized).toContain("ytd_totals");
    expect(normalized).toContain("tips_total");
    expect(normalized).not.toContain("platform_breakdown");
  });

  it("keeps itemization fields mandatory in field-key normalization", async () => {
    const { __stubsInternals } = await loadStubsService();
    const normalized = __stubsInternals.normalizeStubFieldKeys([
      "platform_breakdown",
      "tips_total",
    ]);

    expect(normalized).toContain("earnings_itemization");
    expect(normalized).toContain("expenses_itemization");
  });

  it("creates backfill anchors for closed periods", async () => {
    const { __stubsInternals } = await loadStubsService();
    const anchors = __stubsInternals.buildBackfillAnchors({
      cadence: "weekly",
      currentDateKey: "2026-02-27",
      weekStartsOn: "sunday",
      yearStartDateKey: "2026-01-01",
    });

    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[0]).toBe("2025-12-28");
  });

  it("builds current cadence defaults using cadence-start anchors", async () => {
    const { __stubsInternals } = await loadStubsService();
    const defaults = __stubsInternals.buildCurrentCadenceDefaults({
      currencyCode: "USD",
      email: "driver@example.com",
      name: "Test Driver",
      timezone: "America/Chicago",
      weekStartsOn: "sunday",
    });

    expect(defaults.weekly.anchorDate).toBe(defaults.weekly.period.startDate);
    expect(defaults.biweekly.anchorDate).toBe(
      defaults.biweekly.period.startDate
    );
    expect(defaults.monthly.anchorDate).toBe(defaults.monthly.period.startDate);
  });

  it("builds csv output", async () => {
    const { buildStubCsv } = await loadStubsService();
    const csv = buildStubCsv({
      anchorDate: "2026-02-27",
      cadence: "weekly",
      computedAt: "2026-02-27T00:00:00.000Z",
      createdAt: "2026-02-27T00:00:00.000Z",
      fieldKeys: [
        "identity_block",
        "period_window",
        "summary_totals",
        "ytd_totals",
        "earnings_itemization",
        "expenses_itemization",
      ],
      id: 1,
      lockedAt: "2026-02-27T00:00:00.000Z",
      periodEnd: "2026-02-28",
      periodStart: "2026-02-22",
      publicId: "gstub_test",
      revision: 1,
      snapshot: {
        cadence: "weekly",
        currencyCode: "USD",
        fieldKeys: [
          "identity_block",
          "period_window",
          "summary_totals",
          "ytd_totals",
          "earnings_itemization",
          "expenses_itemization",
        ],
        generatedAt: "2026-02-27T00:00:00.000Z",
        identity: {
          address: "",
          email: "driver@example.com",
          issuerName: "GigStax",
          legalName: "User",
          phone: "",
        },
        note: "Expenses are business costs, not payroll withholding.",
        period: {
          anchorDate: "2026-02-27",
          endDate: "2026-02-28",
          startDate: "2026-02-22",
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
          endDate: "2026-02-28",
          startDate: "2026-01-01",
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
      },
      source: "manual",
      status: "locked",
      updatedAt: "2026-02-27T00:00:00.000Z",
      userId: 1,
      ytdEnd: "2026-02-28",
      ytdStart: "2026-01-01",
    });

    expect(csv).toContain("stub_id,gstub_test");
    expect(csv).toContain("period_totals");
    expect(csv).toContain("section,platform_slug");
    expect(csv).toContain("hours_total");
    expect(csv).toContain("expense_id");
  });

  it("builds standardized export base filename", async () => {
    const { buildStubExportBaseName } = await loadStubsService();

    const filename = buildStubExportBaseName({
      anchorDate: "2026-02-27",
      cadence: "weekly",
      computedAt: "2026-02-27T00:00:00.000Z",
      createdAt: "2026-02-27T00:00:00.000Z",
      fieldKeys: [
        "identity_block",
        "period_window",
        "summary_totals",
        "ytd_totals",
        "earnings_itemization",
        "expenses_itemization",
      ],
      id: 1,
      lockedAt: "2026-02-27T00:00:00.000Z",
      periodEnd: "2026-02-28",
      periodStart: "2026-02-22",
      publicId: "gstub_test",
      revision: 1,
      snapshot: {
        cadence: "weekly",
        currencyCode: "USD",
        fieldKeys: [
          "identity_block",
          "period_window",
          "summary_totals",
          "ytd_totals",
          "earnings_itemization",
          "expenses_itemization",
        ],
        generatedAt: "2026-02-27T00:00:00.000Z",
        identity: {
          address: "",
          email: "driver@example.com",
          issuerName: "GigStax",
          legalName: "Jane Driver",
          phone: "",
        },
        note: "Expenses are business costs, not payroll withholding.",
        period: {
          anchorDate: "2026-02-27",
          endDate: "2026-02-28",
          startDate: "2026-02-22",
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
          endDate: "2026-02-28",
          startDate: "2026-01-01",
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
      },
      source: "manual",
      status: "locked",
      updatedAt: "2026-02-27T00:00:00.000Z",
      userId: 1,
      ytdEnd: "2026-02-28",
      ytdStart: "2026-01-01",
    });

    expect(filename).toBe("gigstax-stub-2026-02-28-jane-driver");
  });
});
