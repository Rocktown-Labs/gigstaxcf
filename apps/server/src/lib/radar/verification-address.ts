import type { RadarGeocodeAddress } from "radar-sdk-js";

import { getRadarBrowserClient, isRadarConfigured } from "@/lib/radar/client";
import {
  deriveTripSearchContextLabel,
  formatRadarResolvedAddress,
} from "@/lib/radar/search";

const isRadarRateLimitError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ("code" in error ? (error as { code?: number }).code === 429 : false);

export interface RadarVerificationAddressResult {
  address: string;
  locationText: string | null;
  rateLimited: boolean;
  validated: boolean;
}

const deriveVerificationLocationText = (
  address: RadarGeocodeAddress,
  fallbackAddress: string
) =>
  deriveTripSearchContextLabel({
    profileAddress:
      formatRadarResolvedAddress(address, fallbackAddress) || fallbackAddress,
  });

export const validateVerificationAddress = async (
  value: string
): Promise<RadarVerificationAddressResult> => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {
      address: "",
      locationText: null,
      rateLimited: false,
      validated: false,
    };
  }

  if (!isRadarConfigured()) {
    return {
      address: trimmedValue,
      locationText: deriveTripSearchContextLabel({
        profileAddress: trimmedValue,
      }),
      rateLimited: false,
      validated: false,
    };
  }

  try {
    const Radar = await getRadarBrowserClient();
    const response = await Radar.forwardGeocode({ query: trimmedValue });
    const [match] = response.addresses as RadarGeocodeAddress[];

    if (!match) {
      throw new Error(
        "Enter a full street address so GigStax can verify your tax profile."
      );
    }

    return {
      address: formatRadarResolvedAddress(match, trimmedValue),
      locationText: deriveVerificationLocationText(match, trimmedValue),
      rateLimited: false,
      validated: true,
    };
  } catch (error) {
    if (isRadarRateLimitError(error)) {
      return {
        address: trimmedValue,
        locationText: deriveTripSearchContextLabel({
          profileAddress: trimmedValue,
        }),
        rateLimited: true,
        validated: false,
      };
    }

    throw error instanceof Error
      ? error
      : new Error("Unable to validate the verification address right now.");
  }
};
