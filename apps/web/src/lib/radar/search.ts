import type {
  RadarAutocompleteAddress,
  RadarGeocodeAddress,
  RadarSearchPlace,
} from "radar-sdk-js";

import type { TripLocation } from "@/lib/trip-verification";

export const RADAR_SEARCH_RESULT_LIMIT = 6;
const ADDRESS_LIKE_QUERY_REGEX = /^\s*\d/u;
const CONTEXT_TOKEN_REGEX = /[a-z0-9]+/gu;
const CHAIN_SEPARATOR_REGEX = /[^a-z0-9]+/gu;
const MAX_CHAIN_WORDS = 2;

export type RadarSearchMode = "address" | "place";

export interface RadarAddressSuggestion {
  address: string;
  id: string;
  latitude: number;
  longitude: number;
  primaryText: string;
  secondaryText: string | null;
  source: RadarSearchMode;
}

export interface RadarSearchNearLocation {
  latitude: number;
  longitude: number;
}

const joinAddressParts = (
  parts: (string | null | undefined)[],
  separator = ", "
) =>
  parts
    .map((part) => part?.trim() || "")
    .filter(Boolean)
    .join(separator);

type RadarResolvedAddress = RadarAutocompleteAddress | RadarGeocodeAddress;

const buildStreetAddress = (address: RadarResolvedAddress) =>
  joinAddressParts([address.number, address.street], " ");

const buildCityStatePostal = (address: RadarResolvedAddress) => {
  const cityState = joinAddressParts([address.city, address.stateCode]);
  return joinAddressParts([cityState, address.postalCode], " ");
};

const getContextTokens = (value: string | null) =>
  new Set(value?.toLowerCase().match(CONTEXT_TOKEN_REGEX)?.filter(Boolean));

const slugifyChainValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(CHAIN_SEPARATOR_REGEX, "-")
    .replaceAll(/^-+|-+$/gu, "");

export const deriveTripSearchContextLabel = (args: {
  locationText?: string | null;
  profileAddress?: string | null;
}) => {
  const locationText = args.locationText?.trim();
  if (locationText) {
    return locationText;
  }

  const profileAddress = args.profileAddress?.trim();
  if (!profileAddress) {
    return null;
  }

  const parts = profileAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts.slice(-2).join(", ");
  }

  return parts[0] ?? null;
};

export const formatRadarResolvedAddress = (
  address: RadarResolvedAddress,
  fallbackQuery: string
) => {
  const explicit =
    address.formattedAddress ||
    address.addressLabel ||
    address.placeLabel ||
    null;
  if (explicit) {
    return explicit;
  }

  const composed = joinAddressParts(
    [
      buildStreetAddress(address),
      buildCityStatePostal(address),
      address.countryCode,
    ].filter(Boolean)
  );

  return composed || fallbackQuery.trim();
};

const getSuggestionPrimaryText = (
  address: RadarResolvedAddress,
  fallbackQuery: string
) =>
  address.placeLabel ||
  buildStreetAddress(address) ||
  address.addressLabel ||
  address.formattedAddress ||
  buildCityStatePostal(address) ||
  fallbackQuery.trim();

const getSuggestionSecondaryText = (
  address: RadarResolvedAddress,
  primaryText: string
) => {
  const formatted = formatRadarResolvedAddress(address, primaryText);
  const cityStatePostal = buildCityStatePostal(address);
  const fallbackSecondary = joinAddressParts([
    cityStatePostal,
    address.countryCode,
  ]);

  if (formatted && formatted !== primaryText) {
    return formatted;
  }

  if (fallbackSecondary && fallbackSecondary !== primaryText) {
    return fallbackSecondary;
  }

  return null;
};

export const buildRadarAutocompleteQuery = (
  query: string,
  fallbackContextLabel: string | null
) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !fallbackContextLabel) {
    return normalizedQuery;
  }

  const normalizedContext = fallbackContextLabel.trim();
  if (!normalizedContext) {
    return normalizedQuery;
  }

  if (
    normalizedQuery.toLowerCase().includes(normalizedContext.toLowerCase()) ||
    normalizedQuery.includes(",")
  ) {
    return normalizedQuery;
  }

  return `${normalizedQuery} ${normalizedContext}`;
};

export const getRadarSearchMode = (query: string): RadarSearchMode =>
  ADDRESS_LIKE_QUERY_REGEX.test(query.trim()) ? "address" : "place";

export const buildRadarPlaceSearchChains = (
  query: string,
  fallbackContextLabel: string | null
) => {
  const queryWords = query
    .trim()
    .toLowerCase()
    .match(CONTEXT_TOKEN_REGEX)
    ?.filter(Boolean);

  if (!queryWords || queryWords.length === 0) {
    return [];
  }

  const contextTokens = getContextTokens(fallbackContextLabel);
  const trimmedWords = [...queryWords];
  while (
    trimmedWords.length > 1 &&
    contextTokens.has(trimmedWords.at(-1) ?? "")
  ) {
    trimmedWords.pop();
  }

  const candidates = new Set<string>();
  for (
    let wordCount = Math.min(MAX_CHAIN_WORDS, trimmedWords.length);
    wordCount >= 1;
    wordCount -= 1
  ) {
    const candidate = slugifyChainValue(
      trimmedWords.slice(0, wordCount).join(" ")
    );
    if (candidate) {
      candidates.add(candidate);
    }
  }

  return [...candidates];
};

export const normalizeRadarAutocompleteSuggestions = (
  addresses: RadarAutocompleteAddress[],
  fallbackQuery: string
): RadarAddressSuggestion[] => {
  const seen = new Set<string>();

  return addresses
    .map((address) => {
      const addressLabel = formatRadarResolvedAddress(address, fallbackQuery);
      const primaryText = getSuggestionPrimaryText(address, fallbackQuery);
      const secondaryText = getSuggestionSecondaryText(address, primaryText);

      return {
        address: addressLabel,
        id: `${addressLabel}:${address.latitude}:${address.longitude}`,
        latitude: address.latitude,
        longitude: address.longitude,
        primaryText,
        secondaryText,
        source: "address",
      } satisfies RadarAddressSuggestion;
    })
    .filter((suggestion) => {
      const key = `${suggestion.latitude.toFixed(5)}:${suggestion.longitude.toFixed(5)}:${suggestion.address.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, RADAR_SEARCH_RESULT_LIMIT);
};

export const normalizeRadarPlaceSuggestions = (
  places: RadarSearchPlace[],
  fallbackContextLabel: string | null
): RadarAddressSuggestion[] =>
  places
    .flatMap((place) => {
      const coordinates = place.location?.coordinates;
      if (!coordinates) {
        return [];
      }

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
      }

      const secondaryText = joinAddressParts(
        [
          place.chain?.name && place.chain.name !== place.name
            ? place.chain.name
            : null,
          fallbackContextLabel ? `Near ${fallbackContextLabel}` : null,
        ],
        " • "
      );

      return [
        {
          address: joinAddressParts([place.name, fallbackContextLabel]),
          id: `${place._id}:${latitude}:${longitude}`,
          latitude,
          longitude,
          primaryText: place.name,
          secondaryText: secondaryText || null,
          source: "place",
        } satisfies RadarAddressSuggestion,
      ];
    })
    .slice(0, RADAR_SEARCH_RESULT_LIMIT);

const getSuggestionDedupeKey = (suggestion: RadarAddressSuggestion) =>
  `${suggestion.latitude.toFixed(5)}:${suggestion.longitude.toFixed(5)}`;

export const mergeRadarSearchSuggestions = (
  ...suggestionGroups: RadarAddressSuggestion[][]
) => {
  const seen = new Set<string>();

  return suggestionGroups
    .flat()
    .filter((suggestion) => {
      const key = getSuggestionDedupeKey(suggestion);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, RADAR_SEARCH_RESULT_LIMIT);
};

export const toTripLocationFromSuggestion = (
  suggestion: RadarAddressSuggestion
): TripLocation => ({
  address: suggestion.address,
  latitude: suggestion.latitude,
  longitude: suggestion.longitude,
});
