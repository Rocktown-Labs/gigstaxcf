import { createFileRoute } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/marketing-shell";

export const Route = createFileRoute("/terms")({
  component: PageComponent,
  head: () => ({
    meta: [
      { title: "Terms of Service" },
      {
        name: "description",
        content:
          "Terms of Service for GigStax, a product of Rocktown Labs LLC. Understand the rules governing your use of the service.",
      },
    ],
  }),
});

function PageComponent() {
  return (
    <MarketingShell>
      <div className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Terms of Service
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Effective Date: March 8, 2026
          </p>

          <div className="text-muted-foreground mt-10 space-y-8 text-sm/7">
            <section>
              <h2 className="text-foreground text-lg font-semibold">
                1. Acceptance of Terms
              </h2>
              <p className="mt-2">
                By accessing or using GigStax (&quot;the Service&quot;),
                operated by Rocktown Labs LLC (&quot;we,&quot; &quot;us,&quot;
                &quot;our&quot;), you agree to be bound by these Terms of
                Service. If you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                2. Description of Service
              </h2>
              <p className="mt-2">
                GigStax is a web-based tool that helps gig economy delivery
                drivers track earnings, log expenses, set weekly goals, and
                generate income stub summaries. The Service may include optional
                AI-powered features for extracting data from screenshots and
                receipts.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                3. Account Registration
              </h2>
              <p className="mt-2">
                You must create an account to use GigStax. You agree to provide
                accurate and complete information and to keep your login
                credentials secure. You are responsible for all activity that
                occurs under your account.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                4. Subscription and Billing
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  GigStax offers paid subscription plans. Pricing and features
                  for each plan are described on our pricing page.
                </li>
                <li>
                  Payment is processed through Stripe. By subscribing, you
                  authorize recurring charges according to your selected plan.
                </li>
                <li>
                  You may cancel your subscription at any time. Cancellation
                  takes effect at the end of the current billing period.
                </li>
                <li>
                  Refunds are handled on a case-by-case basis. Contact{" "}
                  <a
                    href="mailto:support@gigstax.com"
                    className="text-primary hover:text-primary/80 underline underline-offset-2"
                  >
                    support@gigstax.com
                  </a>{" "}
                  for refund requests.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                5. Acceptable Use
              </h2>
              <p className="mt-2">You agree not to:</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>
                  Use the Service for any unlawful purpose or in violation of
                  any applicable laws.
                </li>
                <li>
                  Upload content that is harmful, fraudulent, or infringes on
                  the rights of others.
                </li>
                <li>
                  Attempt to gain unauthorized access to any part of the Service
                  or its systems.
                </li>
                <li>
                  Reverse engineer, decompile, or disassemble any part of the
                  Service.
                </li>
                <li>
                  Use automated tools to scrape, extract, or collect data from
                  the Service.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                6. Your Data
              </h2>
              <p className="mt-2">
                You retain ownership of all data you enter into GigStax,
                including delivery records, expenses, and uploaded images. We do
                not claim ownership of your content. By using the Service, you
                grant us a limited license to process your data solely for the
                purpose of providing the Service.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                7. AI Features
              </h2>
              <p className="mt-2">
                GigStax offers optional AI-powered features (such as screenshot
                analysis) to assist with data entry. AI results are provided as
                a convenience and may not always be accurate. You are
                responsible for reviewing and verifying any data extracted by AI
                before relying on it.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                8. Disclaimer of Warranties
              </h2>
              <p className="mt-2">
                The Service is provided &quot;as is&quot; and &quot;as
                available&quot; without warranties of any kind, whether express
                or implied. We do not guarantee that the Service will be
                uninterrupted, error-free, or that any data will be perfectly
                accurate. GigStax is not a tax, legal, or financial advisor. You
                should consult a qualified professional for tax and financial
                decisions.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                9. Limitation of Liability
              </h2>
              <p className="mt-2">
                To the maximum extent permitted by law, Rocktown Labs LLC shall
                not be liable for any indirect, incidental, special,
                consequential, or punitive damages, or any loss of profits or
                revenue, whether incurred directly or indirectly, arising from
                your use of the Service.
              </p>
              <p className="mt-2">
                Our total liability for any claims related to the Service shall
                not exceed the amount you have paid us in the twelve (12) months
                preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                10. Termination
              </h2>
              <p className="mt-2">
                We may suspend or terminate your access to the Service at any
                time for violation of these terms or for any other reason at our
                discretion, with or without notice. Upon termination, your right
                to use the Service ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                11. Governing Law
              </h2>
              <p className="mt-2">
                These Terms are governed by the laws of the State of Arkansas,
                United States, without regard to conflict of law principles. Any
                disputes arising under these Terms shall be resolved in the
                courts of Arkansas.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                12. Changes to These Terms
              </h2>
              <p className="mt-2">
                We reserve the right to update these Terms at any time. Material
                changes will be communicated by updating the effective date on
                this page. Your continued use of the Service after changes
                constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                13. Contact
              </h2>
              <p className="mt-2">
                If you have questions about these Terms, contact us at:{" "}
                <a
                  href="mailto:support@gigstax.com"
                  className="text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  support@gigstax.com
                </a>
              </p>
              <p className="mt-2">
                Rocktown Labs LLC
                <br />
                Arkansas, United States
              </p>
            </section>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
