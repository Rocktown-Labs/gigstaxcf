import { describe, expect, it } from "vitest";

import { buildTripRouteStaticMapUrl } from "@/lib/radar/static-map";
import type { TripRouteData } from "@/lib/trip-verification";

const routeData: TripRouteData = {
  dropoffToReturn: {
    distanceMiles: 1.8,
    durationSeconds: 540,
    geometry: {
      coordinates: [
        [-91.734, 35.251],
        [-91.732, 35.254],
      ],
      type: "LineString",
    },
  },
  intermediateStops: [
    {
      address: "Stop 1",
      latitude: 35.249,
      longitude: -91.735,
    },
  ],
  pickupToDropoff: {
    distanceMiles: 1.6,
    durationSeconds: 480,
    geometry: {
      coordinates: [
        [-91.739, 35.248],
        [-91.737, 35.249],
        [-91.734, 35.251],
      ],
      type: "LineString",
    },
  },
  prePickupOrigin: {
    address: "Home",
    latitude: 35.246,
    longitude: -91.742,
  },
  prePickupToPickup: {
    distanceMiles: 0.7,
    durationSeconds: 180,
    geometry: {
      coordinates: [
        [-91.742, 35.246],
        [-91.739, 35.248],
      ],
      type: "LineString",
    },
  },
};

describe("radar static map helper", () => {
  it("builds a static map URL with markers and paths for the verified route", () => {
    const staticMapUrl = buildTripRouteStaticMapUrl({
      dropoff: {
        address: "Dropoff",
        latitude: 35.251,
        longitude: -91.734,
      },
      pickup: {
        address: "Pickup",
        latitude: 35.248,
        longitude: -91.739,
      },
      publishableKey: "prj_test_pk_static",
      returnLocation: {
        address: "Return",
        latitude: 35.254,
        longitude: -91.732,
      },
      routeData,
    });

    const expectations = [
      "https://api.radar.io/maps/static?",
      "publishableKey=prj_test_pk_static",
      "markers=color%3A0x2563EB%7C35.248%2C-91.739",
      "markers=color%3A0x16A34A%7C35.254%2C-91.732",
      "path=stroke%3A0x2563EB",
      "enc%3A",
    ];

    expect(staticMapUrl).not.toBeNull();
    expect(
      expectations.every((expectation) => staticMapUrl!.includes(expectation))
    ).toBeTruthy();
  });

  it("returns null when no publishable key is available", () => {
    expect(
      buildTripRouteStaticMapUrl({
        dropoff: {
          address: "Dropoff",
          latitude: 35.251,
          longitude: -91.734,
        },
        pickup: {
          address: "Pickup",
          latitude: 35.248,
          longitude: -91.739,
        },
        publishableKey: null,
        returnLocation: {
          address: "Return",
          latitude: 35.254,
          longitude: -91.732,
        },
        routeData,
      })
    ).toBeNull();
  });
});
