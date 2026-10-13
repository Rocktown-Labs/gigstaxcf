const radarPublishableKey =
  (import.meta.env.VITE_RADAR_PUBLISHABLE_KEY as string | undefined) ?? null;
let initializedPublishableKey: string | null = null;

export function isRadarConfigured() {
  return Boolean(radarPublishableKey);
}

export function getRadarPublishableKey() {
  return radarPublishableKey;
}

export async function getRadarBrowserClient() {
  if (!radarPublishableKey) {
    throw new Error(
      "Radar is not configured. Add NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY to enable trip verification."
    );
  }

  const { default: Radar } = await import("radar-sdk-js");

  if (initializedPublishableKey !== radarPublishableKey) {
    Radar.initialize(radarPublishableKey, {
      logLevel: import.meta.env.DEV ? "info" : "error",
    });
    initializedPublishableKey = radarPublishableKey;
  }

  return Radar;
}
