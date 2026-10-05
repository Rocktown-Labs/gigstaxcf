import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { StatRow } from "../components/stat-row";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface TipReminderEmailProps {
  estimatedTipTotal: string;
  managePreferencesHref: string;
  notificationsHref: string;
  pendingCount: string;
  unsubscribeHref: string;
}

const tipReminderEmailPreviewProps: TipReminderEmailProps = {
  estimatedTipTotal: "$48.25",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  notificationsHref: "https://gigstax.com/dashboard/notifications",
  pendingCount: "3",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
};

const TipReminderEmail: EmailComponent<TipReminderEmailProps> = (props) => (
  <EmailShell
    ctaHref={props.notificationsHref}
    ctaLabel="Verify Tips"
    eyebrow="Action required"
    intro="You have pending tip updates waiting for verification."
    managePreferencesHref={props.managePreferencesHref}
    preheader="Pending tip verification reminder"
    title="Tip Verification Reminder"
    unsubscribeHref={props.unsubscribeHref}
  >
    <StatRow label="Pending entries" value={props.pendingCount} />
    <StatRow label="Estimated tip total" value={props.estimatedTipTotal} />
    <Text style={createTextStyle({ marginBottom: "6px" })}>
      Verify tips now to keep totals accurate across dashboard and stub views.
    </Text>
  </EmailShell>
);

TipReminderEmail.PreviewProps = tipReminderEmailPreviewProps;

export default TipReminderEmail;
