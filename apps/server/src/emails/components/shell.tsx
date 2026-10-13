import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

import { siteUrl } from "../../lib/seo";
import { emailStyles, emailTheme, linkStyle } from "../theme";

interface EmailShellProps {
  children: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  eyebrow?: string;
  intro: string;
  managePreferencesHref?: string;
  preheader: string;
  title: string;
  unsubscribeHref?: string;
}

export function EmailShell(props: EmailShellProps) {
  const brandIconSrc = `${siteUrl}/icon-dark-32x32.png`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preheader}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.brandSection}>
            <Img
              alt="GigStax"
              height="32"
              src={brandIconSrc}
              style={emailStyles.brandIcon}
              width="32"
            />
            <Text style={emailStyles.brandWordmark}>
              Gig
              <span style={{ color: emailTheme.colors.brand }}>Stax</span>
            </Text>
          </Section>

          <Section style={emailStyles.heroSection}>
            <Text style={emailStyles.eyebrow}>
              {props.eyebrow || "GigStax update"}
            </Text>
            <Text style={emailStyles.heading}>{props.title}</Text>
            <Text style={emailStyles.intro}>{props.intro}</Text>
          </Section>

          <Section style={emailStyles.contentSection}>
            <Section style={emailStyles.contentCard}>{props.children}</Section>
          </Section>

          {props.ctaHref && props.ctaLabel ? (
            <Section style={emailStyles.ctaSection}>
              <Button href={props.ctaHref} style={emailStyles.button}>
                {props.ctaLabel}
              </Button>
            </Section>
          ) : null}

          <Hr style={emailStyles.divider} />
          <Text style={emailStyles.footerText}>
            GigStax keeps delivery, expenses, and tax-ready totals in one place.
          </Text>
          <Text style={emailStyles.footerText}>
            {props.managePreferencesHref ? (
              <Link href={props.managePreferencesHref} style={linkStyle}>
                Manage preferences
              </Link>
            ) : null}
            {props.managePreferencesHref && props.unsubscribeHref
              ? " · "
              : null}
            {props.unsubscribeHref ? (
              <Link href={props.unsubscribeHref} style={linkStyle}>
                Unsubscribe
              </Link>
            ) : null}
          </Text>
          <Text style={emailStyles.footerText}>
            {siteUrl.replace(/^https?:\/\//u, "")}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
