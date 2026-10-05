import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { StatRow } from "../components/stat-row";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface SubscriptionStatusEmailProps {
  billingInterval: "month" | "year" | null;
  periodEnd: string | null;
  planLabel: string;
  status: string;
}

const subscriptionStatusEmailPreviewProps: SubscriptionStatusEmailProps = {
  billingInterval: "month",
  periodEnd: "2026-04-01",
  planLabel: "Driver",
  status: "active",
};

const SubscriptionStatusEmail: EmailComponent<SubscriptionStatusEmailProps> = (
  props
) => {
  const periodEndText = props.periodEnd || "n/a";
  const billingInterval = props.billingInterval || "custom";

  return (
    <EmailShell
      eyebrow="Billing"
      intro="Your subscription status has changed."
      preheader="GigStax subscription update"
      title="Subscription Update"
    >
      <StatRow label="Status" value={props.status} />
      <StatRow label="Plan" value={props.planLabel} />
      <StatRow label="Billing" value={billingInterval} />
      <StatRow label="Current period end" value={periodEndText} />
      <Text style={createTextStyle({ marginBottom: "6px" })}>
        Billing details are now reflected in your dashboard and account portal.
      </Text>
    </EmailShell>
  );
};

SubscriptionStatusEmail.PreviewProps = subscriptionStatusEmailPreviewProps;

export default SubscriptionStatusEmail;
