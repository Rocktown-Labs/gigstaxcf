import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface WelcomeEmailProps {
  dashboardHref: string;
  name: string;
}

const welcomeEmailPreviewProps: WelcomeEmailProps = {
  dashboardHref: "https://gigstax.com/dashboard",
  name: "Taylor",
};

const WelcomeEmail: EmailComponent<WelcomeEmailProps> = (props) => {
  const displayName = props.name.trim() || "there";

  return (
    <EmailShell
      ctaHref={props.dashboardHref}
      ctaLabel="Open Dashboard"
      eyebrow="Account ready"
      intro={`Hey ${displayName}, your GigStax account is ready.`}
      preheader="Welcome to GigStax"
      title="Welcome to GigStax"
    >
      <Text style={createTextStyle()}>
        Track trips, expenses, and operating net in one place. Start logging
        today so your first summary reflects the full week instead of a partial
        snapshot.
      </Text>
    </EmailShell>
  );
};

WelcomeEmail.PreviewProps = welcomeEmailPreviewProps;

export default WelcomeEmail;
