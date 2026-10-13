export type TripVerificationStatus = "needs_input" | "verified";

const METERS_PER_MILE = 1609.344;
const FEET_PER_MILE = 5280;
const KILOMETERS_PER_MILE = 1.609344;

export interface TripRouteGeometry {
  coordinates: [number, number][];
  type: "LineString";
}

export interface TripLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export interface TripRouteLeg {
  distanceMiles: number;
  durationSeconds: number;
  geometry: TripRouteGeometry | null;
}

export interface TripRouteData {
  dropoffToReturn: TripRouteLeg;
  intermediateStops?: TripLocation[];
  prePickupOrigin?: TripLocation;
  prePickupToPickup?: TripRouteLeg;
  pickupToDropoff: TripRouteLeg;
  pickupToDropoffLegs?: TripRouteLeg[];
}

export interface EntryTripVerification {
  createdAt: string | Date;
  dropoffAddress: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  extractedDropoffText: string | null;
  extractedPickupText: string | null;
  id: number;
  pickupAddress: string | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  radarDistanceMiles: number | null;
  radarDurationSeconds: number | null;
  returnAddress: string | null;
  returnLatitude: number | null;
  returnLongitude: number | null;
  routeCalculatedAt: string | Date | null;
  routeData: TripRouteData | null;
  status: TripVerificationStatus;
  updatedAt: string | Date;
  verifiedAt: string | Date | null;
}

const roundToTripPrecision = (value: number) => Math.round(value * 100) / 100;

export function convertRadarDistanceValueToMiles(distanceValue: number) {
  return roundToTripPrecision(distanceValue / METERS_PER_MILE);
}

export function parseRadarDistanceTextToMiles(
  distanceText: string | null | undefined
) {
  if (!distanceText) {
    return null;
  }

  const normalizedText = distanceText.trim().toLowerCase();
  const match = normalizedText.match(
    /^(?<value>[\d,.]+)\s*(?<unit>mi|ft|km|m)$/u
  );
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]?.replaceAll(",", ""));
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const unit = match[2];
  switch (unit) {
    case "mi": {
      return roundToTripPrecision(numericValue);
    }
    case "ft": {
      return roundToTripPrecision(numericValue / FEET_PER_MILE);
    }
    case "km": {
      return roundToTripPrecision(numericValue / KILOMETERS_PER_MILE);
    }
    case "m": {
      return convertRadarDistanceValueToMiles(numericValue);
    }
    default: {
      return null;
    }
  }
}

export function normalizeRadarDistanceToMiles(distance: {
  text?: string | null;
  value: number;
}) {
  const parsedTextMiles = parseRadarDistanceTextToMiles(distance.text);
  if (parsedTextMiles !== null) {
    return parsedTextMiles;
  }

  return convertRadarDistanceValueToMiles(distance.value);
}

export function getPickupToDropoffLegs(routeData: TripRouteData) {
  if (
    Array.isArray(routeData.pickupToDropoffLegs) &&
    routeData.pickupToDropoffLegs.length > 0
  ) {
    return routeData.pickupToDropoffLegs;
  }

  return [routeData.pickupToDropoff];
}

export function getOutboundRouteLegs(routeData: TripRouteData) {
  const pickupToDropoffLegs = getPickupToDropoffLegs(routeData);
  if (!routeData.prePickupToPickup) {
    return pickupToDropoffLegs;
  }

  return [routeData.prePickupToPickup, ...pickupToDropoffLegs];
}

export function combineTripRouteLegs(legs: TripRouteLeg[]): TripRouteLeg {
  const normalizedLegs = legs.filter(Boolean);
  const geometryCoordinates = normalizedLegs.flatMap((leg, index) => {
    if (!leg.geometry) {
      return [];
    }

    return index === 0
      ? leg.geometry.coordinates
      : leg.geometry.coordinates.slice(1);
  });
  const hasGeometry = normalizedLegs.every((leg) => leg.geometry !== null);

  return {
    distanceMiles: roundToTripPrecision(
      normalizedLegs.reduce((total, leg) => total + leg.distanceMiles, 0)
    ),
    durationSeconds: normalizedLegs.reduce(
      (total, leg) => total + leg.durationSeconds,
      0
    ),
    geometry:
      hasGeometry && geometryCoordinates.length >= 2
        ? {
            coordinates: geometryCoordinates,
            type: "LineString",
          }
        : null,
  };
}

export function getTripRouteDistanceMiles(routeData: TripRouteData) {
  return roundToTripPrecision(
    combineTripRouteLegs(getOutboundRouteLegs(routeData)).distanceMiles +
      routeData.dropoffToReturn.distanceMiles
  );
}

export function getTripRouteDurationSeconds(routeData: TripRouteData) {
  return (
    combineTripRouteLegs(getOutboundRouteLegs(routeData)).durationSeconds +
    routeData.dropoffToReturn.durationSeconds
  );
}

export function getTripDistanceDeltaMiles(
  screenshotDistanceMiles: number | null | undefined,
  radarDistanceMiles: number | null | undefined
) {
  if (
    screenshotDistanceMiles === null ||
    screenshotDistanceMiles === undefined ||
    radarDistanceMiles === null ||
    radarDistanceMiles === undefined
  ) {
    return null;
  }

  if (
    !Number.isFinite(screenshotDistanceMiles) ||
    !Number.isFinite(radarDistanceMiles)
  ) {
    return null;
  }

  return roundToTripPrecision(radarDistanceMiles - screenshotDistanceMiles);
}
