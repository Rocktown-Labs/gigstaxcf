import { getRadarPublishableKey } from "@/lib/radar/client";
import type { TripLocation, TripRouteData } from "@/lib/trip-verification";
import {
  combineTripRouteLegs,
  getOutboundRouteLegs,
} from "@/lib/trip-verification";

const DEFAULT_STATIC_MAP_WIDTH = 900;
const DEFAULT_STATIC_MAP_HEIGHT = 600;
const DEFAULT_STATIC_MAP_SCALE = 2;
const DEFAULT_STATIC_MAP_STYLE = "radar-default-v1";
const STATIC_MAP_BASE_URL = "https://api.radar.io/maps/static";
const MAX_PATH_POINTS = 24;

const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const encodeSignedPolylineValue = (value: number) => {
  let remainingValue = value < 0 ? Math.abs(value) * 2 - 1 : value * 2;
  let encodedValue = "";

  while (remainingValue >= 32) {
    encodedValue += String.fromCodePoint((remainingValue % 32) + 95);
    remainingValue = Math.floor(remainingValue / 32);
  }

  encodedValue += String.fromCodePoint(remainingValue + 63);
  return encodedValue;
};

const encodeRoutePolyline = (coordinates: [number, number][]) => {
  let previousLatitude = 0;
  let previousLongitude = 0;

  return simplifyRouteCoordinates(coordinates)
    .map(([longitude, latitude]) => {
      const nextLatitude = Math.round(latitude * 1e5);
      const nextLongitude = Math.round(longitude * 1e5);
      const latitudeDelta = nextLatitude - previousLatitude;
      const longitudeDelta = nextLongitude - previousLongitude;

      previousLatitude = nextLatitude;
      previousLongitude = nextLongitude;

      return `${encodeSignedPolylineValue(latitudeDelta)}${encodeSignedPolylineValue(longitudeDelta)}`;
    })
    .join("");
};

const simplifyRouteCoordinates = (
  coordinates: [number, number][],
  maxPoints = MAX_PATH_POINTS
) => {
  if (coordinates.length <= maxPoints) {
    return coordinates;
  }

  const step = (coordinates.length - 1) / (maxPoints - 1);
  const simplified = Array.from({ length: maxPoints }, (_, index) => {
    if (index === 0) {
      return coordinates[0];
    }

    if (index === maxPoints - 1) {
      return coordinates.at(-1);
    }

    return coordinates[Math.round(index * step)];
  }).filter(isPresent);

  return simplified.filter((coordinate, index) => {
    if (index === 0) {
      return true;
    }

    const previousCoordinate = simplified[index - 1];
    return (
      previousCoordinate?.[0] !== coordinate[0] ||
      previousCoordinate[1] !== coordinate[1]
    );
  });
};

const buildMarkerParam = (
  color: string,
  locations: TripLocation[],
  size: "small" | null = null
) => {
  if (locations.length === 0) {
    return null;
  }

  return [
    `color:${color}`,
    ...(size ? [`size:${size}`] : []),
    ...locations.map(
      (location) => `${location.latitude},${location.longitude}`
    ),
  ].join("|");
};

const buildPathParam = (
  coordinates: [number, number][],
  stroke: string,
  width = 4
) => {
  if (coordinates.length < 2) {
    return null;
  }

  const encodedPolyline = encodeRoutePolyline(coordinates);
  return [
    `stroke:${stroke}`,
    `width:${width}`,
    "border:0xFFFFFF",
    "borderwidth:2",
    `enc:${encodedPolyline}`,
  ].join("|");
};

interface BuildTripRouteStaticMapUrlArgs {
  dropoff: TripLocation;
  pickup: TripLocation;
  publishableKey?: string | null;
  returnLocation: TripLocation;
  routeData: TripRouteData;
}

export const buildTripRouteStaticMapUrl = ({
  dropoff,
  pickup,
  publishableKey = getRadarPublishableKey(),
  returnLocation,
  routeData,
}: BuildTripRouteStaticMapUrlArgs) => {
  if (!publishableKey) {
    return null;
  }

  const params = new URLSearchParams({
    height: String(DEFAULT_STATIC_MAP_HEIGHT),
    publishableKey,
    scale: String(DEFAULT_STATIC_MAP_SCALE),
    style: DEFAULT_STATIC_MAP_STYLE,
    width: String(DEFAULT_STATIC_MAP_WIDTH),
  });

  const { prePickupOrigin } = routeData;
  const intermediateStops = routeData.intermediateStops ?? [];
  const outboundLegs = getOutboundRouteLegs(routeData);
  const fullRouteGeometry = combineTripRouteLegs([
    ...outboundLegs,
    routeData.dropoffToReturn,
  ]).geometry;

  const markerParams = [
    buildMarkerParam("0x0F766E", prePickupOrigin ? [prePickupOrigin] : []),
    buildMarkerParam("0x2563EB", [pickup]),
    buildMarkerParam("0xF59E0B", intermediateStops, "small"),
    buildMarkerParam("0x7C3AED", [dropoff]),
    buildMarkerParam("0x16A34A", [returnLocation]),
  ].filter(isPresent);

  for (const marker of markerParams) {
    params.append("markers", marker);
  }

  const fullRoutePath = buildPathParam(
    fullRouteGeometry?.coordinates ?? [],
    "0x2563EB"
  );
  if (fullRoutePath) {
    params.append("path", fullRoutePath);
  }

  return `${STATIC_MAP_BASE_URL}?${params.toString()}`;
};
