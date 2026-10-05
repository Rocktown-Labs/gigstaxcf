import { Text } from "@react-email/components";

import { EmailShell } from "../components/shell";
import { createTextStyle } from "../theme";
import type { EmailComponent } from "../theme";

interface ResetPasswordEmailProps {
  resetUrl: string;
}

const resetPasswordEmailPreviewProps: ResetPasswordEmailProps = {
  resetUrl: "https://gigstax.com/reset?token=preview",
};

const ResetPasswordEmail: EmailComponent<ResetPasswordEmailProps> = (props) => (
  <EmailShell
    ctaHref={props.resetUrl}
    ctaLabel="Reset Password"
    eyebrow="Security"
    intro="We received a password reset request for your account."
    preheader="Reset your GigStax password"
    title="Reset Password"
  >
    <Text style={createTextStyle()}>
      This link expires shortly. If you didn&apos;t request this, you can ignore
      this message.
    </Text>
  </EmailShell>
);

ResetPasswordEmail.PreviewProps = resetPasswordEmailPreviewProps;

export default ResetPasswordEmail;
