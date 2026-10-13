import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { StatRow } from "../components/stat-row";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface CadenceSummaryEmailProps {
  bestDayGross: string;
  bestDayLabel: string;
  cadenceLabel: string;
  dashboardHref: string;
  expenses: string;
  gross: string;
  managePreferencesHref: string;
  net: string;
  periodEnd: string;
  periodStart: string;
  topPlatform: string;
  unsubscribeHref: string;
  ytdNet: string;
}

const cadenceSummaryEmailPreviewProps: CadenceSummaryEmailProps = {
  bestDayGross: "$218.40",
  bestDayLabel: "Friday, 2026-02-27",
  cadenceLabel: "Weekly",
  dashboardHref: "https://gigstax.com/dashboard/stubs",
  expenses: "$38.20",
  gross: "$824.50",
  managePreferencesHref: "https://gigstax.com/dashboard/settings",
  net: "$786.30",
  periodEnd: "2026-03-01",
  periodStart: "2026-02-23",
  topPlatform: "DoorDash",
  unsubscribeHref: "https://gigstax.com/u/unsubscribe?token=preview",
  ytdNet: "$3,481.20",
};

const CadenceSummaryEmail: EmailComponent<CadenceSummaryEmailProps> = (
  props
) => (
  <EmailShell
    ctaHref={props.dashboardHref}
    ctaLabel="View Earnings Summary"
    eyebrow={`${props.cadenceLabel} cadence`}
    intro={`${props.cadenceLabel} summary for ${props.periodStart} to ${props.periodEnd}.`}
    managePreferencesHref={props.managePreferencesHref}
    preheader="Your GigStax cadence summary is ready"
    title="Cadence Summary"
    unsubscribeHref={props.unsubscribeHref}
  >
    <StatRow label="Gross earnings" value={props.gross} />
    <StatRow label="Business expenses" value={props.expenses} />
    <StatRow label="Operating net" value={props.net} />
    <StatRow label="YTD net" value={props.ytdNet} />
    <Text style={createTextStyle({ marginBottom: "6px" })}>
      Top platform: <strong>{props.topPlatform}</strong>
    </Text>
    <Text style={createTextStyle({ marginBottom: "6px" })}>
      Best day: <strong>{props.bestDayLabel}</strong> with{" "}
      <strong>{props.bestDayGross}</strong> in gross earnings.
    </Text>
  </EmailShell>
);

CadenceSummaryEmail.PreviewProps = cadenceSummaryEmailPreviewProps;

export default CadenceSummaryEmail;
