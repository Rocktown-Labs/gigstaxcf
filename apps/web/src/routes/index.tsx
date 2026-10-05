import { createFileRoute, redirect, Link } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { getDefaultPricingPlans } from "@/lib/pricing-plans";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  beforeLoad: async () => {
    // Ported from `redirectAuthenticatedFromMarketing`: signed-in visitors go
    // straight to the app.
    const session = await authClient.getSession();
    if (session.data) {
      const isOnboarded = Boolean(
        (session.data.user as { isOnboarded?: boolean }).isOnboarded
      );
      throw redirect({
        to: isOnboarded ? "/dashboard" : "/onboarding",
      });
    }
  },
  head: () => ({
    meta: [
      {
        title: "GigStax | Accurate Delivery Earnings, Profit & Tax Tracking",
      },
      {
        name: "description",
        content:
          "Save time with accurate earning logs, clear profit insights, tax-ready stubs, and historical tracking across Spark, Uber Eats, DoorDash, and more.",
      },
    ],
  }),
});

// Ported from lib/seo.ts (NEXT_PUBLIC env vars are not available client-side).
const siteUrl = "https://gigstax.com";

const pageDescription =
  "Save time with accurate earning logs, clear profit insights, tax-ready stubs, and historical tracking across Spark, Uber Eats, DoorDash, and more.";

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  applicationCategory: "FinanceApplication",
  description: pageDescription,
  featureList: [
    "Time-saving delivery and expense tracking",
    "Accurate earning logs by platform",
    "Clear gross and net profit insights",
    "Tax-ready stub summaries",
    "Historical earnings and expense tracking",
    "Optional AI screenshot and receipt extraction",
  ],
  name: "GigStax",
  offers: [
    {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      description:
        "Starter plan with manual tracking, receipt attachment, and 10 monthly AI credits.",
      price: "1.00",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      description: "Driver plan with capped AI credits and bulk uploads.",
      price: "14.99",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      description:
        "Pro Driver monthly plan with unlimited AI and bulk workflows.",
      price: "24.99",
      priceCurrency: "USD",
    },
  ],
  operatingSystem: "Web",
  url: siteUrl,
};

const faqItems = [
  {
    answer:
      "GigStax tracks delivery earnings, tips, bonuses, miles, expenses, weekly goals, and historical records across your gig apps.",
    question: "What does GigStax track?",
  },
  {
    answer:
      "No. Starter accounts can track manually, attach images, and use included AI credits each month. Pro unlocks unlimited AI workflows.",
    question: "Do I need AI to use GigStax?",
  },
  {
    answer:
      "GigStax provides itemized stub summaries for selected periods so your earnings and expenses are organized for tax prep and bookkeeping.",
    question: "How does GigStax help with taxes?",
  },
  {
    answer:
      "Yes. GigStax keeps historical delivery and expense records so you can review trends and compare performance over time.",
    question: "Does GigStax keep historical tracking?",
  },
];

const faqPageSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
    name: item.question,
  })),
};

function HomeComponent() {
  // The legacy page read the pricing catalog from the server (with a
  // default-plan fallback). There is no public pricing API endpoint, so the
  // ported page renders the same default active catalog.
  const pricingPlans = getDefaultPricingPlans().filter((plan) => plan.isActive);

  const sortedPricingPlans = [...pricingPlans].sort(
    (left, right) => left.sortOrder - right.sortOrder
  );

  return (
    <MarketingShell>
      <script type="application/ld+json">
        {JSON.stringify(softwareApplicationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(faqPageSchema)}
      </script>

      {/* ─── HERO (Tailwind UI structure) ─── */}
      <div className="relative isolate">
        {/* Top decorative blob */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="from-primary/60 to-primary/20 relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          />
        </div>

        <div className="py-24 sm:py-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center">
              <div className="mx-auto max-w-2xl">
                <p className="border-primary/30 bg-primary/10 text-primary mb-6 inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium">
                  Built for Spark, Uber Eats, DoorDash, and more
                </p>
              </div>
              <div className="mx-auto max-w-5xl">
                <h1 className="text-foreground text-5xl font-semibold tracking-tight sm:text-7xl">
                  <span className="block sm:whitespace-nowrap">
                    Save Time Tracking.
                  </span>
                  <span className="text-primary block sm:whitespace-nowrap">
                    Know Your True Profit.
                  </span>
                </h1>
              </div>
              <div className="mx-auto max-w-2xl">
                <p className="text-muted-foreground mt-8 text-lg font-medium text-pretty sm:text-xl/8">
                  GigStax helps delivery drivers keep accurate earning logs,
                  track expenses, and see clear gross vs net results. Create
                  tax-ready stub summaries and optionally use AI to speed up
                  data entry.
                </p>
                <div className="mt-10 flex items-center justify-center gap-x-6">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 px-8 text-base font-semibold"
                  >
                    <Link to="/signup">Start for $1</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 px-8 text-base font-semibold"
                  >
                    <Link to="/login">Sign In</Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Hero screenshot in ring container */}
            <div className="mt-16 flow-root sm:mt-24">
              <div className="-m-2 rounded-xl bg-white/5 p-2 ring-1 ring-white/10 ring-inset lg:-m-4 lg:rounded-2xl lg:p-4">
                <img
                  src="/screenshots/dashboard.png"
                  alt="GigStax dashboard showing gross earnings, deliveries, miles, tips, recent deliveries, and platform breakdown"
                  width={2432}
                  height={1442}
                  className="rounded-md shadow-2xl ring-1 ring-white/10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom decorative blob */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="from-primary/60 to-primary/20 relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
          />
        </div>
      </div>

      {/* ─── BENTO GRID (Tailwind UI structure: 3+3 / 2+2+2) ─── */}
      <div id="features" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
          <p className="text-primary text-center text-base/7 font-semibold">
            Features
          </p>
          <p className="text-foreground mx-auto mt-2 max-w-lg text-center text-4xl font-semibold tracking-tight text-pretty sm:text-5xl">
            Everything you need, nothing you don&apos;t
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-6 lg:grid-rows-2">
            {/* Row 1, Left: Goals + Calendar (3 cols) */}
            <div className="relative lg:col-span-3">
              <div className="bg-card absolute inset-0 rounded-lg max-lg:rounded-t-[2rem] lg:rounded-tl-[2rem]" />
              <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-lg)+1px)] max-lg:rounded-t-[calc(2rem+1px)] lg:rounded-tl-[calc(2rem+1px)]">
                <img
                  src="/screenshots/goals.png"
                  alt="Weekly earnings goal with progress bar and month calendar showing daily income and expenses"
                  width={1024}
                  height={800}
                  className="h-80 w-full object-cover object-top"
                />
                <div className="p-10 pt-4">
                  <h3 className="text-primary text-sm/4 font-semibold">
                    Weekly Goals
                  </h3>
                  <p className="text-foreground mt-2 text-lg font-medium tracking-tight">
                    Set targets, track progress
                  </p>
                  <p className="text-muted-foreground mt-2 max-w-lg text-sm/6">
                    Set a weekly earnings goal and watch your progress with a
                    calendar view showing daily income and expenses. Goal
                    periods run automatically each week.
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-white/15 max-lg:rounded-t-[2rem] lg:rounded-tl-[2rem]" />
            </div>

            {/* Row 1, Right: Stubs (3 cols) */}
            <div className="relative lg:col-span-3">
              <div className="bg-card absolute inset-0 rounded-lg lg:rounded-tr-[2rem]" />
              <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-lg)+1px)] lg:rounded-tr-[calc(2rem+1px)]">
                <img
                  src="/screenshots/stubs.png"
                  alt="Stub Suite with earnings summary, visible field configuration, and stub history"
                  width={1024}
                  height={900}
                  className="h-80 w-full object-cover object-top"
                />
                <div className="p-10 pt-4">
                  <h3 className="text-primary text-sm/4 font-semibold">
                    Tax-Ready Stubs
                  </h3>
                  <p className="text-foreground mt-2 text-lg font-medium tracking-tight">
                    Income statements when you need them
                  </p>
                  <p className="text-muted-foreground mt-2 max-w-lg text-sm/6">
                    Generate itemized income stubs with gross and net totals,
                    expense breakdowns, and YTD summaries. Choose weekly,
                    bi-weekly, or monthly cadences.
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-white/15 lg:rounded-tr-[2rem]" />
            </div>

            {/* Row 2, Left: Trip History (2 cols) */}
            <div className="relative lg:col-span-2">
              <div className="bg-card absolute inset-0 rounded-lg lg:rounded-bl-[2rem]" />
              <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-lg)+1px)] lg:rounded-bl-[calc(2rem+1px)]">
                <img
                  src="/screenshots/trip-history.png"
                  alt="Delivery overview with trip history table across all gig platforms"
                  width={1024}
                  height={530}
                  className="h-80 w-full object-cover object-left-top"
                />
                <div className="p-10 pt-4">
                  <h3 className="text-primary text-sm/4 font-semibold">
                    Full History
                  </h3>
                  <p className="text-foreground mt-2 text-lg font-medium tracking-tight">
                    Every trip, every platform
                  </p>
                  <p className="text-muted-foreground mt-2 max-w-lg text-sm/6">
                    Complete delivery history with base fare, tips, miles, and
                    payout totals. Filter by platform, sort by date, and review
                    any delivery.
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-white/15 lg:rounded-bl-[2rem]" />
            </div>

            {/* Row 2, Center: Expenses (2 cols) */}
            <div className="relative lg:col-span-2">
              <div className="bg-card absolute inset-0 rounded-lg" />
              <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-lg)+1px)]">
                <img
                  src="/screenshots/expenses.png"
                  alt="Expense tracking with category badges, merchants, and receipt attachments"
                  width={1024}
                  height={530}
                  className="h-80 w-full object-cover object-left-top"
                />
                <div className="p-10 pt-4">
                  <h3 className="text-primary text-sm/4 font-semibold">
                    Expenses
                  </h3>
                  <p className="text-foreground mt-2 text-lg font-medium tracking-tight">
                    Track costs, see true profit
                  </p>
                  <p className="text-muted-foreground mt-2 max-w-lg text-sm/6">
                    Log fuel, maintenance, tolls, and any business cost. Compare
                    gross earnings against actual net profit.
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-white/15" />
            </div>

            {/* Row 2, Right: AI Screenshot Entry (2 cols) */}
            <div className="relative lg:col-span-2">
              <div className="bg-card absolute inset-0 rounded-lg max-lg:rounded-b-[2rem] lg:rounded-br-[2rem]" />
              <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-lg)+1px)] max-lg:rounded-b-[calc(2rem+1px)] lg:rounded-br-[calc(2rem+1px)]">
                <img
                  src="/screenshots/ai-entry.png"
                  alt="AI screenshot analysis with a real Walmart Spark delivery screenshot being analyzed"
                  width={1024}
                  height={800}
                  className="h-80 w-full object-cover object-top"
                />
                <div className="p-10 pt-4">
                  <h3 className="text-primary text-sm/4 font-semibold">
                    AI-Powered
                  </h3>
                  <p className="text-foreground mt-2 text-lg font-medium tracking-tight">
                    Snap a screenshot, skip the typing
                  </p>
                  <p className="text-muted-foreground mt-2 max-w-lg text-sm/6">
                    Upload a delivery screenshot and AI extracts fare, tip,
                    miles, platform, and date. Or enter everything manually.
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-white/15 max-lg:rounded-b-[2rem] lg:rounded-br-[2rem]" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="scroll-mt-24 pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl px-4">
          <PricingTable plans={sortedPricingPlans} />
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="scroll-mt-24 pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="text-primary text-sm font-semibold tracking-widest uppercase">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Frequently asked questions
            </h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-3">
            {faqItems.map((item) => (
              <article
                key={item.question}
                className="border-border/50 bg-card hover:border-border rounded-2xl border p-5 transition-colors"
              >
                <h3 className="font-semibold">{item.question}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CLOSING CTA ─── */}
      <section className="pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="border-border/60 from-primary/10 via-card to-card relative overflow-hidden rounded-2xl border bg-gradient-to-br p-10 text-center md:p-16">
            <div className="bg-primary/10 pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl" />
            <div className="bg-primary/5 pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Ready to track earnings and profit with confidence?
              </h2>
              <p className="text-muted-foreground mx-auto mt-4 max-w-lg">
                Create your account, set your platforms, and start tracking
                today. Your first month is just $1.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-8 h-12 px-8 text-base font-semibold"
              >
                <Link to="/signup">Start for $1</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
