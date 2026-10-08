import { describe, expect, it } from "vitest";

import {
  RADAR_SEARCH_RESULT_LIMIT,
  buildRadarAutocompleteQuery,
  buildRadarPlaceSearchChains,
  deriveTripSearchContextLabel,
  formatRadarResolvedAddress,
  getRadarSearchMode,
  mergeRadarSearchSuggestions,
  normalizeRadarAutocompleteSuggestions,
  normalizeRadarPlaceSuggestions,
} from "@/lib/radar/search";

describe("radar search helpers", () => {
  it("derives a fallback location label from onboarding data", () => {
    expect(
      deriveTripSearchContextLabel({
        locationText: "",
        profileAddress: "123 Main St, Searcy, AR 72143",
      })
    ).toBe("Searcy, AR 72143");

    expect(
      deriveTripSearchContextLabel({
        locationText: "Searcy, AR",
        profileAddress: "123 Main St, Little Rock, AR 72201",
      })
    ).toBe("Searcy, AR");
  });

  it("adds onboarding context only when the query still needs a location hint", () => {
    expect(buildRadarAutocompleteQuery("Walmart", "Searcy, AR")).toBe(
      "Walmart Searcy, AR"
    );
    expect(
      buildRadarAutocompleteQuery("Walmart Searcy, AR", "Searcy, AR")
    ).toBe("Walmart Searcy, AR");
    expect(
      buildRadarAutocompleteQuery("456 Oak St, Searcy, AR", "Searcy, AR")
    ).toBe("456 Oak St, Searcy, AR");
  });

  it("routes numeric queries to address mode and store-like queries to place mode", () => {
    expect(getRadarSearchMode("456 Oak St")).toBe("address");
    expect(getRadarSearchMode("Walmart Searcy")).toBe("place");
  });

  it("builds place-search chain slugs from store-style queries", () => {
    expect(
      buildRadarPlaceSearchChains("Walmart Searcy", "Searcy, AR")
    ).toStrictEqual(["walmart"]);
    expect(
      buildRadarPlaceSearchChains("Whole Foods Little Rock", "Little Rock, AR")
    ).toStrictEqual(["whole-foods", "whole"]);
  });

  it("normalizes autocomplete suggestions into a reusable trip location shape", () => {
    const suggestions = normalizeRadarAutocompleteSuggestions(
      [
        {
          addressLabel:
            "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
          city: "Searcy",
          formattedAddress:
            "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
          geometry: {
            coordinates: [-91.736, 35.2506],
            type: "Point",
          },
          latitude: 35.2506,
          longitude: -91.736,
          placeLabel: "Walmart Supercenter",
          postalCode: "72143",
          stateCode: "AR",
          street: "Queensway St",
        },
        {
          addressLabel:
            "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
          city: "Searcy",
          formattedAddress:
            "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
          geometry: {
            coordinates: [-91.736, 35.2506],
            type: "Point",
          },
          latitude: 35.2506,
          longitude: -91.736,
          placeLabel: "Walmart Supercenter",
          postalCode: "72143",
          stateCode: "AR",
          street: "Queensway St",
        },
      ],
      "Walmart"
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      address: "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
      primaryText: "Walmart Supercenter",
      secondaryText: "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
    });
  });

  it("caps autocomplete suggestions to the shared Radar result limit", () => {
    const suggestions = normalizeRadarAutocompleteSuggestions(
      Array.from({ length: RADAR_SEARCH_RESULT_LIMIT + 2 }, (_, index) => ({
        city: "Searcy",
        formattedAddress: `${index} Main St, Searcy, AR 72143`,
        geometry: {
          coordinates: [-91.736 + index / 1000, 35.2506 + index / 1000],
          type: "Point" as const,
        },
        latitude: 35.2506 + index / 1000,
        longitude: -91.736 + index / 1000,
        postalCode: "72143",
        stateCode: "AR",
        street: "Main St",
      })),
      "Main"
    );

    expect(suggestions).toHaveLength(RADAR_SEARCH_RESULT_LIMIT);
  });

  it("falls back to a composed address when Radar omits the formatted string", () => {
    expect(
      formatRadarResolvedAddress(
        {
          city: "Searcy",
          countryCode: "US",
          geometry: {
            coordinates: [-91.736, 35.2506],
            type: "Point",
          },
          latitude: 35.2506,
          longitude: -91.736,
          number: "2508",
          postalCode: "72143",
          stateCode: "AR",
          street: "Queensway St",
        },
        "Walmart"
      )
    ).toBe("2508 Queensway St, Searcy, AR 72143, US");
  });

  it("normalizes place results and merges them ahead of autocomplete results", () => {
    const places = normalizeRadarPlaceSuggestions(
      [
        {
          _id: "place-1",
          categories: ["shopping"],
          chain: {
            name: "Walmart",
            slug: "walmart",
          },
          location: {
            coordinates: [-91.736, 35.2506],
            type: "Point",
          },
          name: "Walmart Supercenter",
        },
      ],
      "Searcy, AR"
    );

    const addresses = normalizeRadarAutocompleteSuggestions(
      [
        {
          addressLabel:
            "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
          city: "Searcy",
          formattedAddress:
            "Walmart Supercenter, 2508 Queensway St, Searcy, AR 72143",
          geometry: {
            coordinates: [-91.736, 35.2506],
            type: "Point",
          },
          latitude: 35.2506,
          longitude: -91.736,
          placeLabel: "Walmart Supercenter",
          postalCode: "72143",
          stateCode: "AR",
          street: "Queensway St",
        },
      ],
      "Walmart Searcy"
    );

    const suggestions = mergeRadarSearchSuggestions(places, addresses);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      address: "Walmart Supercenter, Searcy, AR",
      primaryText: "Walmart Supercenter",
      source: "place",
    });
  });
});
