/* eslint-disable func-style, max-statements */
import { serverEnv } from "@/lib/server-env";

const DEFAULT_SITE_URL = "https://gigstax.com";

function normalizeSiteUrl(input: string | undefined) {
  if (!input) {
    return DEFAULT_SITE_URL;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_SITE_URL;
  }

  const withProtocol = /^https?:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    url.hash = "";
    url.pathname = "";
    url.search = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

const configuredUrl =
  serverEnv.NEXT_PUBLIC_APP_URL ||
  serverEnv.NEXT_PUBLIC_SITE_URL ||
  serverEnv.SITE_URL;

export const siteUrl = normalizeSiteUrl(configuredUrl);
export const siteHost = new URL(siteUrl).host;
