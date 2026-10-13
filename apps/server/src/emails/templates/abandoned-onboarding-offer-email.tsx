import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { StatRow } from "../components/stat-row";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface AbandonedOnboardingOfferEmailProps {
  code: string;
  managePreferencesHref: string;
  onboardingHref: string;
  unsubscribeHref: string;
}

const previewProps: AbandonedOnboardingOfferEmailProps = {
  code: "GSTAXFREEAB12CD34",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  onboardingHref: "https://gigstax.com/onboarding",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
};

const AbandonedOnboardingOfferEmail: EmailComponent<
  AbandonedOnboardingOfferEmailProps
> = (props) => (
  <EmailShell
    ctaHref={props.onboardingHref}
    ctaLabel="Finish Setup"
    eyebrow="Starter offer"
    intro="You already saved your GigStax setup. Use this code to make your first Starter month free and finish onboarding."
    managePreferencesHref={props.managePreferencesHref}
    preheader="Your saved GigStax setup is waiting"
    title="Finish onboarding with a free Starter month"
    unsubscribeHref={props.unsubscribeHref}
  >
    <StatRow label="Discount code" value={props.code} />
    <Text style={createTextStyle()}>
      Apply this code during Starter Monthly checkout. It covers the first month
      so you can finish setup, test the workflow, and get your first trips
      logged without extra friction.
    </Text>
  </EmailShell>
);

AbandonedOnboardingOfferEmail.PreviewProps = previewProps;

export default AbandonedOnboardingOfferEmail;
