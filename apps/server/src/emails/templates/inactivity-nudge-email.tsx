import { Link, Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { createTextStyle, linkStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface InactivityNudgeEmailProps {
  dashboardHref: string;
  deliveriesHref: string;
  managePreferencesHref: string;
  unsubscribeHref: string;
}

const inactivityNudgeEmailPreviewProps: InactivityNudgeEmailProps = {
  dashboardHref: "https://gigstax.com/dashboard",
  deliveriesHref: "https://gigstax.com/dashboard/deliveries",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
};

const InactivityNudgeEmail: EmailComponent<InactivityNudgeEmailProps> = (
  props
) => (
  <EmailShell
    ctaHref={props.deliveriesHref}
    ctaLabel="Log a Delivery"
    eyebrow="Streak check"
    intro="Your dashboard has been quiet for a few days."
    managePreferencesHref={props.managePreferencesHref}
    preheader="Jump back into GigStax tracking"
    title="Keep Your Earnings Streak Going"
    unsubscribeHref={props.unsubscribeHref}
  >
    <Text style={createTextStyle()}>
      Add your recent runs and expenses to keep your weekly totals fresh. You
      can also review your trends from the dashboard at any time.
    </Text>
    <Text style={createTextStyle({ marginBottom: "6px" })}>
      Need a quick check-in first?{" "}
      <Link href={props.dashboardHref} style={linkStyle}>
        Open your dashboard
      </Link>
    </Text>
  </EmailShell>
);

InactivityNudgeEmail.PreviewProps = inactivityNudgeEmailPreviewProps;

export default InactivityNudgeEmail;
