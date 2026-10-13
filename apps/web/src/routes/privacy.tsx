import { createFileRoute } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/marketing-shell";

export const Route = createFileRoute("/privacy")({
  component: PageComponent,
  head: () => ({
    meta: [
      { title: "Privacy Policy" },
      {
        name: "description",
        content:
          "Privacy Policy for GigStax, a product of Rocktown Labs LLC. Learn how we collect, use, and protect your data.",
      },
    ],
  }),
});

function PageComponent() {
  return (
    <MarketingShell>
      <div className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Effective Date: March 8, 2026
          </p>

          <div className="text-muted-foreground mt-10 space-y-8 text-sm/7">
            <section>
              <h2 className="text-foreground text-lg font-semibold">
                1. Who We Are
              </h2>
              <p className="mt-2">
                GigStax is operated by Rocktown Labs LLC, a limited liability
                company organized in Arkansas, United States. In this policy,
                &quot;we,&quot; &quot;us,&quot; and &quot;our&quot; refer to
                Rocktown Labs LLC (dba GigStax).
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                2. Information We Collect
              </h2>
              <p className="mt-2">When you use GigStax, we may collect:</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-foreground">
                    Account information:
                  </strong>{" "}
                  name, email address, and password when you create an account.
                </li>
                <li>
                  <strong className="text-foreground">
                    Delivery and earnings data:
                  </strong>{" "}
                  platform names, delivery dates, fare amounts, tips, bonuses,
                  mileage, and other trip details you enter or upload.
                </li>
                <li>
                  <strong className="text-foreground">Expense data:</strong>{" "}
                  expense categories, amounts, merchant names, and dates you
                  record.
                </li>
                <li>
                  <strong className="text-foreground">Uploaded images:</strong>{" "}
                  delivery screenshots and receipt images you choose to upload
                  for AI analysis or record-keeping.
                </li>
                <li>
                  <strong className="text-foreground">
                    Payment information:
                  </strong>{" "}
                  billing details processed by our third-party payment
                  processor, Stripe. We do not store full credit card numbers on
                  our servers.
                </li>
                <li>
                  <strong className="text-foreground">Usage data:</strong>{" "}
                  information about how you interact with the service, including
                  pages visited, features used, and timestamps.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                3. How We Use Your Information
              </h2>
              <p className="mt-2">We use your information to:</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>Provide, maintain, and improve the GigStax service.</li>
                <li>
                  Process your delivery data, generate reports, income stubs,
                  and goal tracking features.
                </li>
                <li>
                  Analyze uploaded screenshots using AI to extract delivery
                  details (when you choose to use this feature).
                </li>
                <li>Process payments and manage your subscription.</li>
                <li>
                  Send transactional emails related to your account and service
                  updates.
                </li>
                <li>
                  Respond to support requests and communicate with you about the
                  service.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                4. Third-Party Services
              </h2>
              <p className="mt-2">
                We use the following third-party services to operate GigStax:
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-foreground">Stripe</strong> for
                  payment processing. Stripe&apos;s privacy policy applies to
                  payment data.
                </li>
                <li>
                  <strong className="text-foreground">AI providers</strong> for
                  screenshot and receipt analysis. Uploaded images are sent to
                  third-party AI services solely for data extraction and are not
                  used to train models.
                </li>
                <li>
                  <strong className="text-foreground">Hosting providers</strong>{" "}
                  for infrastructure and data storage.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                5. Data Retention
              </h2>
              <p className="mt-2">
                We retain your data for as long as your account is active or as
                needed to provide the service. If you delete your account, we
                will delete your personal data within 30 days, except where we
                are required to retain it for legal or compliance purposes.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                6. Data Security
              </h2>
              <p className="mt-2">
                We use commercially reasonable security measures to protect your
                data, including encryption in transit (TLS) and at rest.
                However, no method of transmission or storage is 100% secure,
                and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                7. Your Rights
              </h2>
              <p className="mt-2">You have the right to:</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>Access the personal data we hold about you.</li>
                <li>Request correction of inaccurate data.</li>
                <li>Request deletion of your data.</li>
                <li>Export your data in a portable format.</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, contact us at{" "}
                <a
                  href="mailto:support@gigstax.com"
                  className="text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  support@gigstax.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                8. Children&apos;s Privacy
              </h2>
              <p className="mt-2">
                GigStax is not intended for use by individuals under the age of
                18. We do not knowingly collect personal information from
                children.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                9. Changes to This Policy
              </h2>
              <p className="mt-2">
                We may update this privacy policy from time to time. We will
                notify you of material changes by posting the updated policy on
                this page and updating the effective date.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-lg font-semibold">
                10. Contact
              </h2>
              <p className="mt-2">
                If you have questions about this privacy policy, contact us at:{" "}
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
