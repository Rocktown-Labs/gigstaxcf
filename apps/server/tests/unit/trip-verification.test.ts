import { describe, expect, it } from "vitest";

import {
  combineTripRouteLegs,
  convertRadarDistanceValueToMiles,
  getTripRouteDistanceMiles,
  normalizeRadarDistanceToMiles,
  parseRadarDistanceTextToMiles,
} from "@/lib/trip-verification";
import type { TripRouteData, TripRouteLeg } from "@/lib/trip-verification";

describe("trip verification route helpers", () => {
  it("converts Radar distance values from meters to miles", () => {
    expect(convertRadarDistanceValueToMiles(62_683.72904)).toBe(38.95);
    expect(convertRadarDistanceValueToMiles(1609.344)).toBe(1);
  });

  it("prefers Radar text distances when available", () => {
    expect(parseRadarDistanceTextToMiles("3.6 mi")).toBe(3.6);
    expect(parseRadarDistanceTextToMiles("528 ft")).toBe(0.1);
    expect(parseRadarDistanceTextToMiles("1.6 km")).toBe(0.99);
    expect(
      normalizeRadarDistanceToMiles({ text: "3.6 mi", value: 18_056 })
    ).toBe(3.6);
  });

  it("sums combined leg mileage using normalized miles", () => {
    const pickupToDropoffLegs: TripRouteLeg[] = [
      {
        distanceMiles: 0.4,
        durationSeconds: 120,
        geometry: null,
      },
      {
        distanceMiles: 0.8,
        durationSeconds: 240,
        geometry: null,
      },
    ];
    const routeData: TripRouteData = {
      dropoffToReturn: {
        distanceMiles: 0.7,
        durationSeconds: 240,
        geometry: null,
      },
      intermediateStops: [
        {
          address: "123 Pickup St",
          latitude: 35.25,
          longitude: -91.73,
        },
      ],
      pickupToDropoff: {
        distanceMiles: 1.2,
        durationSeconds: 360,
        geometry: null,
      },
      pickupToDropoffLegs,
      prePickupOrigin: {
        address: "99 Hotspot Ave",
        latitude: 35.2,
        longitude: -91.7,
      },
      prePickupToPickup: {
        distanceMiles: 0.6,
        durationSeconds: 180,
        geometry: null,
      },
    };

    expect(combineTripRouteLegs(pickupToDropoffLegs)).toMatchObject({
      distanceMiles: 1.2,
      durationSeconds: 360,
    });
    expect(getTripRouteDistanceMiles(routeData)).toBe(2.5);
  });
});
