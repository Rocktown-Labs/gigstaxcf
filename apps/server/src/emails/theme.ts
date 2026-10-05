import type { CSSProperties, ReactElement } from "react";

export type EmailComponent<Props> = ((props: Props) => ReactElement) & {
  PreviewProps: Props;
};

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const emailTheme = {
  colors: {
    body: "#eef4ea",
    border: "#d7e2d1",
    borderStrong: "#bfd1b5",
    brand: "#39D000",
    brandDeep: "#14330c",
    ink: "#102215",
    muted: "#63756b",
    surface: "#ffffff",
    surfaceMuted: "#f6fbf3",
    text: "#355145",
  },
  fontFamily,
  radius: {
    button: "14px",
    card: "22px",
    pill: "999px",
    section: "16px",
  },
  spacing: {
    inner: "28px",
    outer: "24px",
    section: "20px",
  },
} as const;

export const emailStyles = {
  body: {
    backgroundColor: emailTheme.colors.body,
    fontFamily,
    margin: "0",
    padding: "20px 0",
  } satisfies CSSProperties,
  bodyText: {
    color: emailTheme.colors.text,
    fontSize: "14px",
    lineHeight: "1.7",
    margin: "0 0 14px",
  } satisfies CSSProperties,
  brandIcon: {
    display: "block",
    margin: "0 auto 10px",
  } satisfies CSSProperties,
  brandSection: {
    marginBottom: "18px",
    textAlign: "center",
  } satisfies CSSProperties,
  brandWordmark: {
    color: emailTheme.colors.ink,
    fontFamily,
    fontSize: "19px",
    fontWeight: "800",
    letterSpacing: "-0.03em",
    margin: "0",
  } satisfies CSSProperties,
  button: {
    backgroundColor: emailTheme.colors.brand,
    borderRadius: emailTheme.radius.button,
    boxSizing: "border-box",
    color: emailTheme.colors.brandDeep,
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "800",
    lineHeight: "48px",
    minWidth: "220px",
    padding: "0 20px",
    textAlign: "center",
    textDecoration: "none",
  } satisfies CSSProperties,
  container: {
    backgroundColor: emailTheme.colors.surface,
    border: `1px solid ${emailTheme.colors.border}`,
    borderRadius: emailTheme.radius.card,
    margin: "24px auto",
    maxWidth: "580px",
    padding: emailTheme.spacing.inner,
  } satisfies CSSProperties,
  contentCard: {
    backgroundColor: emailTheme.colors.surface,
    border: `1px solid ${emailTheme.colors.border}`,
    borderRadius: emailTheme.radius.section,
    padding: "14px",
  } satisfies CSSProperties,
  contentSection: {
    marginBottom: "8px",
  } satisfies CSSProperties,
  ctaSection: {
    marginTop: "24px",
    textAlign: "center",
  } satisfies CSSProperties,
  divider: {
    borderColor: emailTheme.colors.borderStrong,
    margin: "24px 0 16px",
  } satisfies CSSProperties,
  eyebrow: {
    color: emailTheme.colors.brandDeep,
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.14em",
    margin: "0 0 10px",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  footerText: {
    color: emailTheme.colors.muted,
    fontSize: "12px",
    lineHeight: "1.65",
    margin: "0 0 8px",
    textAlign: "center",
  } satisfies CSSProperties,
  heading: {
    color: emailTheme.colors.ink,
    fontSize: "28px",
    fontWeight: "800",
    letterSpacing: "-0.03em",
    lineHeight: "1.15",
    margin: "0 0 10px",
  } satisfies CSSProperties,
  heroSection: {
    backgroundColor: emailTheme.colors.surfaceMuted,
    border: `1px solid ${emailTheme.colors.border}`,
    borderRadius: emailTheme.radius.section,
    marginBottom: "20px",
    padding: "22px 22px 18px",
  } satisfies CSSProperties,
  intro: {
    color: emailTheme.colors.text,
    fontSize: "15px",
    lineHeight: "1.65",
    margin: "0",
  } satisfies CSSProperties,
  statCard: {
    backgroundColor: emailTheme.colors.surfaceMuted,
    border: `1px solid ${emailTheme.colors.border}`,
    borderRadius: "12px",
    marginBottom: "10px",
    padding: "12px 14px",
  } satisfies CSSProperties,
  statLabel: {
    color: emailTheme.colors.muted,
    display: "inline-block",
    fontSize: "13px",
    fontWeight: "600",
    margin: "0",
    width: "50%",
  } satisfies CSSProperties,
  statValue: {
    color: emailTheme.colors.ink,
    display: "inline-block",
    fontSize: "13px",
    fontWeight: "700",
    margin: "0",
    textAlign: "right",
    width: "50%",
  } satisfies CSSProperties,
} as const;

export const linkStyle = {
  color: emailTheme.colors.brandDeep,
  fontWeight: "700",
  textDecoration: "underline",
} satisfies CSSProperties;

export function createTextStyle(overrides?: CSSProperties): CSSProperties {
  return {
    ...emailStyles.bodyText,
    ...overrides,
  };
}
