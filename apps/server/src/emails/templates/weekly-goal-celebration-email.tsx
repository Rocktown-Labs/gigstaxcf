import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { StatRow } from "../components/stat-row";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface WeeklyGoalCelebrationEmailProps {
  dashboardHref: string;
  managePreferencesHref: string;
  periodEnd: string;
  periodStart: string;
  targetAmount: string;
  totalAmount: string;
  unsubscribeHref: string;
}

const previewProps: WeeklyGoalCelebrationEmailProps = {
  dashboardHref: "https://gigstax.com/dashboard/goals",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  periodEnd: "2026-03-08",
  periodStart: "2026-03-02",
  targetAmount: "$900.00",
  totalAmount: "$1,042.15",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
};

const WeeklyGoalCelebrationEmail: EmailComponent<
  WeeklyGoalCelebrationEmailProps
> = (props) => (
  <EmailShell
    ctaHref={props.dashboardHref}
    ctaLabel="See Goal Progress"
    eyebrow="Goal streak"
    intro="You closed the week over your earnings goal. Keep that momentum going and use the dashboard to spot what carried the week."
    managePreferencesHref={props.managePreferencesHref}
    preheader="You hit your weekly GigStax goal"
    title="Weekly goal hit"
    unsubscribeHref={props.unsubscribeHref}
  >
    <StatRow
      label="Week"
      value={`${props.periodStart} to ${props.periodEnd}`}
    />
    <StatRow label="Goal" value={props.targetAmount} />
    <StatRow label="Finished at" value={props.totalAmount} />
    <Text style={createTextStyle({ marginBottom: "0" })}>
      You cleared the target this week. Review your best runs, keep the workflow
      tight, and stack another strong week.
    </Text>
  </EmailShell>
);

WeeklyGoalCelebrationEmail.PreviewProps = previewProps;

export default WeeklyGoalCelebrationEmail;
