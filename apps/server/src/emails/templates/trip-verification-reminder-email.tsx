import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { StatRow } from "../components/stat-row";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface TripVerificationReminderEmailProps {
  managePreferencesHref: string;
  notificationsHref: string;
  pendingCount: string;
  screenshotMiles: string;
  unsubscribeHref: string;
}

const tripVerificationReminderEmailPreviewProps: TripVerificationReminderEmailProps =
  {
    managePreferencesHref: "https://gigstax.com/dashboard/settings",
    notificationsHref: "https://gigstax.com/dashboard/notifications",
    pendingCount: "4",
    screenshotMiles: "62.30 mi",
    unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
  };

const TripVerificationReminderEmail: EmailComponent<
  TripVerificationReminderEmailProps
> = (props) => (
  <EmailShell
    ctaHref={props.notificationsHref}
    ctaLabel="Review Trips"
    eyebrow="Weekly digest"
    intro="You still have trip logs waiting for mileage verification."
    managePreferencesHref={props.managePreferencesHref}
    preheader="Weekly trip verification digest"
    title="Trip Verification Digest"
    unsubscribeHref={props.unsubscribeHref}
  >
    <StatRow label="Trips waiting" value={props.pendingCount} />
    <StatRow label="Screenshot miles waiting" value={props.screenshotMiles} />
    <Text style={createTextStyle({ marginBottom: "6px" })}>
      Add your return point and any important extra stops while the trip is
      still fresh so your mileage log stays tax-ready.
    </Text>
  </EmailShell>
);

TripVerificationReminderEmail.PreviewProps =
  tripVerificationReminderEmailPreviewProps;

export default TripVerificationReminderEmail;
