import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface OnboardingTipsEmailProps {
  dashboardHref: string;
  deliveriesHref: string;
  managePreferencesHref: string;
  unsubscribeHref: string;
}

const previewProps: OnboardingTipsEmailProps = {
  dashboardHref: "https://gigstax.com/dashboard",
  deliveriesHref: "https://gigstax.com/dashboard/deliveries",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
};

const OnboardingTipsEmail: EmailComponent<OnboardingTipsEmailProps> = (
  props
) => (
  <EmailShell
    ctaHref={props.deliveriesHref}
    ctaLabel="Log Fresh Trips"
    eyebrow="Getting started"
    intro="A few habits make GigStax much faster: capture the trip while it is still on screen, upload the screenshot, and fill the delivery details while the numbers are fresh."
    managePreferencesHref={props.managePreferencesHref}
    preheader="Practical GigStax tips for faster trip logging"
    title="Getting the most out of GigStax"
    unsubscribeHref={props.unsubscribeHref}
  >
    <Text style={createTextStyle()}>
      Best workflow: screenshot the trip summary first, upload it into GigStax,
      then log the delivery before you switch apps. That keeps payouts, miles,
      and notes much more accurate.
    </Text>
    <Text style={createTextStyle()}>
      If you stack multiple screenshots, use bulk upload to process them in one
      pass, then clean up any edge cases from the dashboard instead of typing
      everything from scratch.
    </Text>
    <Text style={createTextStyle({ marginBottom: "0" })}>
      Once your week gets busy, check the dashboard for goal progress, profit,
      and any tip or trip-verification follow-ups that need attention.
    </Text>
  </EmailShell>
);

OnboardingTipsEmail.PreviewProps = previewProps;

export default OnboardingTipsEmail;
