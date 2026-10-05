import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface QuarterlyTaxReminderEmailProps {
  dashboardHref: string;
  managePreferencesHref: string;
  quarterLabel: string;
  unsubscribeHref: string;
}

const previewProps: QuarterlyTaxReminderEmailProps = {
  dashboardHref: "https://gigstax.com/dashboard/deliveries",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  quarterLabel: "Q1 2026",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
};

const QuarterlyTaxReminderEmail: EmailComponent<
  QuarterlyTaxReminderEmailProps
> = (props) => (
  <EmailShell
    ctaHref={props.dashboardHref}
    ctaLabel="Review Trip Miles"
    eyebrow="Tax prep"
    intro={`Use the start of the quarter to review and finish logging trip miles from ${props.quarterLabel}.`}
    managePreferencesHref={props.managePreferencesHref}
    preheader="Quarterly trip-mile reminder"
    title="Quarterly mileage reminder"
    unsubscribeHref={props.unsubscribeHref}
  >
    <Text style={createTextStyle()}>
      Clean mileage records are one of the easiest ways to stay ready for tax
      prep. Check the prior quarter now while the routes and missing days are
      still easier to spot.
    </Text>
    <Text style={createTextStyle({ marginBottom: "0" })}>
      GigStax can help you catch incomplete logs, verify screenshot miles, and
      keep your tax-ready history organized before deadlines pile up.
    </Text>
  </EmailShell>
);

QuarterlyTaxReminderEmail.PreviewProps = previewProps;

export default QuarterlyTaxReminderEmail;
