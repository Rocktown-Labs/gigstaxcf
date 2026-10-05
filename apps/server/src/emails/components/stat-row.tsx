import { Row, Section, Text } from "@react-email/components";

import { emailStyles } from "../theme";

interface StatRowProps {
  label: string;
  value: string;
}

export function StatRow(props: StatRowProps) {
  return (
    <Section style={emailStyles.statCard}>
      <Row>
        <Text style={emailStyles.statLabel}>{props.label}</Text>
        <Text style={emailStyles.statValue}>{props.value}</Text>
      </Row>
    </Section>
  );
}
