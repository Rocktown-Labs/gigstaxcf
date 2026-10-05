import type { Wallet } from "lucide-react";
import { CalendarRange, ReceiptText, Scale } from "lucide-react";

import type {
  StubFieldKey,
  StubPlatformEarningsRow,
  StubSnapshot,
} from "@/lib/stubs/types";

interface StubDocumentProps {
  className?: string;
  compact?: boolean;
  snapshot: StubSnapshot;
}

const formatMoney = (value: number, currencyCode: string) =>
  new Intl.NumberFormat("en-US", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const hasField = (fieldKeys: StubFieldKey[], field: StubFieldKey) =>
  fieldKeys.includes(field);

const toHours = (value: number) => value.toFixed(2);

const buildPlatformRowsFromEarnings = (
  snapshot: StubSnapshot
): StubPlatformEarningsRow[] => {
  if (snapshot.rows.platformEarnings.length > 0) {
    return snapshot.rows.platformEarnings;
  }

  const platformMap = new Map<string, StubPlatformEarningsRow>();
  for (const row of snapshot.rows.earnings) {
    const existing = platformMap.get(row.platformSlug);
    const rowHours = row.durationSeconds / 3600;
    if (!existing) {
      platformMap.set(row.platformSlug, {
        baseAmount: row.baseAmount,
        bonusAmount: row.bonusAmount,
        grossEarnings: row.effectiveTotal,
        hoursTotal: rowHours,
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
    existing.hoursTotal += rowHours;
    existing.milesTotal += row.distanceMiles;
    existing.ordersCount += 1;
    existing.tipAmount += row.tipAmount;
  }

  return [...platformMap.values()].sort(
    (left, right) => right.grossEarnings - left.grossEarnings
  );
};

export function StubDocument({
  className = "",
  compact = false,
  snapshot,
}: StubDocumentProps) {
  const rowPadding = compact ? "p-2" : "p-3";
  const platformRows = buildPlatformRowsFromEarnings(snapshot);

  return (
    <article
      className={`border-border bg-card rounded-2xl border shadow-sm ${className}`}
      aria-label="Income stub document preview"
    >
      <div className="border-border from-primary/20 via-primary/10 to-card relative overflow-hidden rounded-t-2xl border-b bg-gradient-to-r p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_55%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
              GigStax Income Statement
            </p>
            <h2 className="text-foreground mt-2 text-2xl font-bold tracking-tight">
              Stub {snapshot.period.startDate} to {snapshot.period.endDate}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {snapshot.note}
            </p>
          </div>
          <div className="border-primary/35 bg-primary/10 rounded-xl border px-4 py-2 text-right">
            <p className="text-primary text-xs font-semibold tracking-wider uppercase">
              Generated
            </p>
            <p className="text-foreground text-sm font-medium">
              {new Date(snapshot.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {hasField(snapshot.fieldKeys, "identity_block") ? (
        <section className="border-border grid gap-3 border-b p-5 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Worker
            </p>
            <p className="text-foreground text-base font-semibold">
              {snapshot.identity.legalName || "Not set"}
            </p>
            {snapshot.identity.address ? (
              <p className="text-muted-foreground text-sm">
                {snapshot.identity.address}
              </p>
            ) : null}
            {snapshot.identity.phone ? (
              <p className="text-muted-foreground text-sm">
                {snapshot.identity.phone}
              </p>
            ) : null}
            {snapshot.identity.email ? (
              <p className="text-muted-foreground text-sm">
                {snapshot.identity.email}
              </p>
            ) : null}
          </div>
          <div className="space-y-1 text-left md:text-right">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Issuer
            </p>
            <p className="text-foreground text-base font-semibold">
              {snapshot.identity.issuerName || "GigStax Income Statement"}
            </p>
          </div>
        </section>
      ) : null}

      {hasField(snapshot.fieldKeys, "period_window") ? (
        <section className="border-border grid gap-3 border-b p-5 sm:grid-cols-3">
          <MetricChip
            icon={CalendarRange}
            label="Period"
            value={`${snapshot.period.startDate} to ${snapshot.period.endDate}`}
          />
          <MetricChip
            icon={Scale}
            label="Cadence"
            value={snapshot.cadence.toUpperCase()}
          />
          <MetricChip
            icon={ReceiptText}
            label="YTD Window"
            value={`${snapshot.ytd.startDate} to ${snapshot.ytd.endDate}`}
          />
        </section>
      ) : null}

      {hasField(snapshot.fieldKeys, "summary_totals") ? (
        <section className="border-border grid gap-3 border-b p-5 sm:grid-cols-3">
          <SummaryCard
            label="Gross Earnings"
            value={formatMoney(
              snapshot.totals.grossEarnings,
              snapshot.currencyCode
            )}
          />
          <SummaryCard
            label="Business Expenses"
            value={formatMoney(
              snapshot.totals.businessExpenses,
              snapshot.currencyCode
            )}
            valueClassName="text-destructive"
          />
          <SummaryCard
            label="Operating Net"
            value={formatMoney(
              snapshot.totals.operatingNet,
              snapshot.currencyCode
            )}
          />
        </section>
      ) : null}

      <section className="border-border grid gap-3 border-b p-5 sm:grid-cols-3">
        {hasField(snapshot.fieldKeys, "tips_total") ? (
          <MetricValue
            label="Tips Total"
            value={formatMoney(
              snapshot.totals.tipsTotal,
              snapshot.currencyCode
            )}
          />
        ) : null}
        {hasField(snapshot.fieldKeys, "orders_count") ? (
          <MetricValue
            label="Orders"
            value={snapshot.totals.ordersCount.toString()}
          />
        ) : null}
        {hasField(snapshot.fieldKeys, "miles_total") ? (
          <MetricValue
            label="Miles"
            value={snapshot.totals.milesTotal.toFixed(2)}
          />
        ) : null}
      </section>

      {hasField(snapshot.fieldKeys, "earnings_itemization") ? (
        <section className="border-border border-b p-5">
          <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
            Earnings Itemization
          </h3>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-foreground text-left">
                <tr>
                  <th className="p-3 font-semibold">Platform</th>
                  <th className="p-3 text-right font-semibold">Orders</th>
                  <th className="p-3 text-right font-semibold">Hours</th>
                  <th className="p-3 text-right font-semibold">Base</th>
                  <th className="p-3 text-right font-semibold">Bonus</th>
                  <th className="p-3 text-right font-semibold">Tips</th>
                  <th className="p-3 text-right font-semibold">Gross</th>
                  <th className="p-3 text-right font-semibold">Miles</th>
                </tr>
              </thead>
              <tbody>
                {platformRows.length === 0 ? (
                  <tr>
                    <td className="text-muted-foreground p-3" colSpan={8}>
                      No completed earnings entries in this period.
                    </td>
                  </tr>
                ) : (
                  platformRows.map((row) => (
                    <tr
                      key={`platform-${row.platformSlug}`}
                      className="border-border border-t"
                    >
                      <td className={`${rowPadding} font-medium`}>
                        {row.platformDisplayName}
                      </td>
                      <td className={`${rowPadding} text-right`}>
                        {row.ordersCount}
                      </td>
                      <td className={`${rowPadding} text-right`}>
                        {toHours(row.hoursTotal)}
                      </td>
                      <td className={`${rowPadding} text-right`}>
                        {formatMoney(row.baseAmount, snapshot.currencyCode)}
                      </td>
                      <td className={`${rowPadding} text-right`}>
                        {formatMoney(row.bonusAmount, snapshot.currencyCode)}
                      </td>
                      <td className={`${rowPadding} text-right`}>
                        {formatMoney(row.tipAmount, snapshot.currencyCode)}
                      </td>
                      <td className={`${rowPadding} text-right font-semibold`}>
                        {formatMoney(row.grossEarnings, snapshot.currencyCode)}
                      </td>
                      <td className={`${rowPadding} text-right`}>
                        {row.milesTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-border bg-muted/50 border-t-2">
                <tr>
                  <th className="p-3 text-left font-semibold" scope="row">
                    Period Total
                  </th>
                  <td className="p-3 text-right font-semibold">
                    {snapshot.totals.ordersCount}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {toHours(snapshot.totals.hoursTotal)}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {formatMoney(
                      snapshot.totals.baseAmount,
                      snapshot.currencyCode
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {formatMoney(
                      snapshot.totals.bonusAmount,
                      snapshot.currencyCode
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {formatMoney(
                      snapshot.totals.tipsTotal,
                      snapshot.currencyCode
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {formatMoney(
                      snapshot.totals.grossEarnings,
                      snapshot.currencyCode
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {snapshot.totals.milesTotal.toFixed(2)}
                  </td>
                </tr>
                {hasField(snapshot.fieldKeys, "ytd_totals") ? (
                  <tr className="border-border/70 border-t">
                    <th className="p-3 text-left font-semibold" scope="row">
                      YTD Total
                    </th>
                    <td className="p-3 text-right font-semibold">
                      {snapshot.ytd.totals.ordersCount}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {toHours(snapshot.ytd.totals.hoursTotal)}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {formatMoney(
                        snapshot.ytd.totals.baseAmount,
                        snapshot.currencyCode
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {formatMoney(
                        snapshot.ytd.totals.bonusAmount,
                        snapshot.currencyCode
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {formatMoney(
                        snapshot.ytd.totals.tipsTotal,
                        snapshot.currencyCode
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {formatMoney(
                        snapshot.ytd.totals.grossEarnings,
                        snapshot.currencyCode
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {snapshot.ytd.totals.milesTotal.toFixed(2)}
                    </td>
                  </tr>
                ) : null}
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {hasField(snapshot.fieldKeys, "expenses_itemization") ? (
        <section className="p-5">
          <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
            Expense Itemization
          </h3>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-foreground text-left">
                <tr>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Merchant</th>
                  <th className="p-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.expenses.length === 0 ? (
                  <tr>
                    <td className="text-muted-foreground p-3" colSpan={4}>
                      No business expenses in this period.
                    </td>
                  </tr>
                ) : (
                  snapshot.rows.expenses.map((row) => (
                    <tr
                      key={`expense-${row.expenseId}`}
                      className="border-border border-t"
                    >
                      <td className={rowPadding}>
                        {row.incurredAt.slice(0, 10)}
                      </td>
                      <td className={`${rowPadding} capitalize`}>
                        {row.category}
                      </td>
                      <td className={rowPadding}>{row.merchant || "-"}</td>
                      <td
                        className={`${rowPadding} text-destructive text-right`}
                      >
                        {formatMoney(row.amount, snapshot.currencyCode)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </article>
  );
}

function MetricChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        <Icon className="text-primary h-4 w-4" />
        {label}
      </div>
      <p className="text-foreground text-sm font-medium">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${valueClassName || ""}`}>
        {value}
      </p>
    </div>
  );
}

function MetricValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
