import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  MapPinned,
  Navigation,
  Plus,
  Route,
  X,
} from "lucide-react";
import type { RadarGeocodeAddress } from "radar-sdk-js";
import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getRadarBrowserClient, isRadarConfigured } from "@/lib/radar/client";
import {
  deriveTripSearchContextLabel,
  formatRadarResolvedAddress,
} from "@/lib/radar/search";
import type { RadarSearchNearLocation } from "@/lib/radar/search";
import type {
  EntryTripVerification,
  TripLocation,
  TripRouteData,
  TripRouteLeg,
} from "@/lib/trip-verification";
import {
  combineTripRouteLegs,
  getTripDistanceDeltaMiles,
  getTripRouteDistanceMiles,
  getTripRouteDurationSeconds,
  normalizeRadarDistanceToMiles,
} from "@/lib/trip-verification";

import { TripLocationSearchInput } from "./trip-location-search-input";
import { TripRouteMap } from "./trip-route-map";

interface TripVerificationCardProps {
  entryId: string;
  screenshotDistanceMiles: number | null;
  stopsCount: number | null;
  tripVerification?: EntryTripVerification | null;
}

interface TripVerificationPreview {
  dropoff: TripLocation;
  pickup: TripLocation;
  radarDistanceMiles: number;
  radarDurationSeconds: number;
  returnLocation: TripLocation;
  routeData: TripRouteData;
}

interface RadarDistanceRoute {
  distance?: {
    text?: string;
    value: number;
  };
  duration?: {
    value: number;
  };
  geometry?: {
    coordinates: [number, number][];
    type: "LineString";
  };
}

const MAX_INTERMEDIATE_STOPS = 8;

interface TripVerificationSearchContextResponse {
  user?: {
    locationText?: string | null;
  };
  verificationProfile?: {
    address?: string | null;
  };
}

const formatDurationLabel = (durationSeconds: number | null) => {
  if (!durationSeconds || durationSeconds <= 0) {
    return "--";
  }

  return `${Math.round(durationSeconds / 60)} min`;
};

const formatMilesLabel = (miles: number | null) => {
  if (miles === null || !Number.isFinite(miles)) {
    return "--";
  }

  return `${miles.toFixed(2)} mi`;
};

const formatDateLabel = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const isRadarRateLimitError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ("code" in error ? (error as { code?: number }).code === 429 : false);

const getBestGeocodeResult = (
  label: string,
  query: string,
  addresses: RadarGeocodeAddress[]
): TripLocation => {
  const [match] = addresses;
  if (!match) {
    throw new Error(`Radar could not find a ${label} for "${query}".`);
  }

  return {
    address: formatRadarResolvedAddress(match, query),
    latitude: match.latitude,
    longitude: match.longitude,
  };
};

const toTripRouteLeg = (
  route: RadarDistanceRoute | undefined
): TripRouteLeg => {
  if (!route?.distance || !route.duration) {
    throw new Error("Radar did not return a complete route.");
  }

  return {
    distanceMiles: normalizeRadarDistanceToMiles(route.distance),
    durationSeconds: Math.max(0, Math.round(route.duration.value * 60)),
    geometry: route.geometry
      ? {
          coordinates: route.geometry.coordinates.map(
            ([longitude, latitude]) => [longitude, latitude] as [number, number]
          ),
          type: "LineString",
        }
      : null,
  };
};

const getIntermediateStopAddresses = (
  tripVerification?: EntryTripVerification | null
) =>
  tripVerification?.routeData?.intermediateStops?.map((stop) => stop.address) ??
  [];

async function calculateRadarLeg(args: {
  destination: TripLocation;
  origin: TripLocation;
}) {
  const Radar = await getRadarBrowserClient();
  const response = await Radar.distance({
    destination: {
      latitude: args.destination.latitude,
      longitude: args.destination.longitude,
    },
    geometry: "linestring",
    modes: ["car"],
    origin: {
      latitude: args.origin.latitude,
      longitude: args.origin.longitude,
    },
    units: "imperial",
  });

  return toTripRouteLeg(
    (response.routes.car || response.routes.geodesic) as RadarDistanceRoute
  );
}

export function TripVerificationCard({
  entryId,
  screenshotDistanceMiles,
  stopsCount,
  tripVerification,
}: TripVerificationCardProps) {
  const queryClient = useQueryClient();
  const [originAddress, setOriginAddress] = useState("");
  const [originLocation, setOriginLocation] = useState<TripLocation | null>(
    null
  );
  const [isOriginExpanded, setIsOriginExpanded] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLocation, setPickupLocation] = useState<TripLocation | null>(
    null
  );
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState<TripLocation | null>(
    null
  );
  const [returnAddress, setReturnAddress] = useState("");
  const [returnLocation, setReturnLocation] = useState<TripLocation | null>(
    null
  );
  const [intermediateStops, setIntermediateStops] = useState<string[]>([]);
  const [intermediateStopLocations, setIntermediateStopLocations] = useState<
    (TripLocation | null)[]
  >([]);
  const [isStopsExpanded, setIsStopsExpanded] = useState(false);
  const [calculateError, setCalculateError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [preview, setPreview] = useState<TripVerificationPreview | null>(null);
  const [hasUnsavedPreview, setHasUnsavedPreview] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [browserNearLocation, setBrowserNearLocation] =
    useState<RadarSearchNearLocation | null>(null);
  const [browserNearAttempted, setBrowserNearAttempted] = useState(false);
  const [profileNearLocation, setProfileNearLocation] =
    useState<RadarSearchNearLocation | null>(null);
  const [profileNearResolved, setProfileNearResolved] = useState(false);

  const { data: searchContext } =
    useQuery<TripVerificationSearchContextResponse>({
      queryFn: async () => {
        try {
          const response = await apiFetch("/api/user");
          if (!response.ok) {
            return {};
          }

          return (await response.json()) as TripVerificationSearchContextResponse;
        } catch {
          return {};
        }
      },
      queryKey: ["user", "trip-verification-search-context"],
      retry: false,
      staleTime: 5 * 60 * 1000,
    });

  const savedPreview = useMemo<TripVerificationPreview | null>(() => {
    if (
      !tripVerification?.routeData ||
      !tripVerification.pickupAddress ||
      tripVerification.pickupLatitude === null ||
      tripVerification.pickupLongitude === null ||
      !tripVerification.dropoffAddress ||
      tripVerification.dropoffLatitude === null ||
      tripVerification.dropoffLongitude === null ||
      !tripVerification.returnAddress ||
      tripVerification.returnLatitude === null ||
      tripVerification.returnLongitude === null
    ) {
      return null;
    }

    return {
      dropoff: {
        address: tripVerification.dropoffAddress,
        latitude: tripVerification.dropoffLatitude,
        longitude: tripVerification.dropoffLongitude,
      },
      pickup: {
        address: tripVerification.pickupAddress,
        latitude: tripVerification.pickupLatitude,
        longitude: tripVerification.pickupLongitude,
      },
      radarDistanceMiles:
        tripVerification.radarDistanceMiles ??
        getTripRouteDistanceMiles(tripVerification.routeData),
      radarDurationSeconds:
        tripVerification.radarDurationSeconds ??
        getTripRouteDurationSeconds(tripVerification.routeData),
      returnLocation: {
        address: tripVerification.returnAddress,
        latitude: tripVerification.returnLatitude,
        longitude: tripVerification.returnLongitude,
      },
      routeData: tripVerification.routeData,
    };
  }, [tripVerification]);

  const suggestedIntermediateStops = Math.max(0, (stopsCount ?? 0) - 1);

  // Hydrate the form state from the saved verification/preview. Following the
  // React "adjust state when inputs change" pattern: derive during render and
  // update synchronously, guarded so it only re-runs when inputs change.
  const [hydrationInputs, setHydrationInputs] = useState({
    savedPreview,
    suggestedIntermediateStops,
    tripVerification,
  });
  const inputsChanged =
    hydrationInputs.savedPreview !== savedPreview ||
    hydrationInputs.suggestedIntermediateStops !== suggestedIntermediateStops ||
    hydrationInputs.tripVerification !== tripVerification;

  if (inputsChanged) {
    const nextIntermediateStops =
      getIntermediateStopAddresses(tripVerification);
    const nextOrigin = savedPreview?.routeData.prePickupOrigin ?? null;
    setHydrationInputs({
      savedPreview,
      suggestedIntermediateStops,
      tripVerification,
    });
    setOriginAddress(nextOrigin?.address || "");
    setPickupAddress(
      tripVerification?.pickupAddress ||
        tripVerification?.extractedPickupText ||
        ""
    );
    setDropoffAddress(
      tripVerification?.dropoffAddress ||
        tripVerification?.extractedDropoffText ||
        ""
    );
    setReturnAddress(tripVerification?.returnAddress || "");
    setIntermediateStops(nextIntermediateStops);
    setOriginLocation(nextOrigin);
    setPickupLocation(savedPreview?.pickup ?? null);
    setDropoffLocation(savedPreview?.dropoff ?? null);
    setReturnLocation(savedPreview?.returnLocation ?? null);
    setIntermediateStopLocations(
      savedPreview?.routeData.intermediateStops?.map((stop) => stop) ??
        nextIntermediateStops.map(() => null)
    );
    setIsStopsExpanded(
      nextIntermediateStops.length > 0 || suggestedIntermediateStops > 0
    );
    setIsOriginExpanded(Boolean(nextOrigin));
    setPreview(savedPreview);
    setHasUnsavedPreview(false);
    setCalculateError("");
    setSaveMessage("");
  }

  const saveTripVerification = useMutation({
    mutationFn: async (payload: {
      dropoff: TripLocation;
      pickup: TripLocation;
      returnLocation: TripLocation;
      routeData: TripRouteData;
    }) => {
      const response = await apiFetch(
        `/api/entries/${entryId}/trip-verification`,
        {
          body: JSON.stringify({
            ...payload,
            extractedDropoffText:
              tripVerification?.extractedDropoffText ?? null,
            extractedPickupText: tripVerification?.extractedPickupText ?? null,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PUT",
        }
      );

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        tripVerification?: EntryTripVerification;
      };

      if (!response.ok || !body.tripVerification) {
        throw new Error(body.error || "Failed to save trip verification.");
      }

      return body.tripVerification;
    },
    onSuccess: async () => {
      setSaveMessage("Trip verification saved.");
      setHasUnsavedPreview(false);
      await queryClient.invalidateQueries({ queryKey: ["entries", entryId] });
    },
  });

  const currentPreview = preview;
  const currentRadarDistanceMiles = currentPreview?.radarDistanceMiles ?? null;
  const currentRadarDurationSeconds =
    currentPreview?.radarDurationSeconds ?? null;
  const distanceDeltaMiles = getTripDistanceDeltaMiles(
    screenshotDistanceMiles,
    currentRadarDistanceMiles
  );
  const verifiedAtLabel = formatDateLabel(tripVerification?.verifiedAt);
  const routeCalculatedAtLabel = formatDateLabel(
    tripVerification?.routeCalculatedAt
  );
  const isRadarReady = isRadarConfigured();
  const fallbackSearchContextLabel = useMemo(
    () =>
      deriveTripSearchContextLabel({
        locationText: searchContext?.user?.locationText ?? null,
        profileAddress: searchContext?.verificationProfile?.address ?? null,
      }),
    [
      searchContext?.user?.locationText,
      searchContext?.verificationProfile?.address,
    ]
  );
  const fallbackProfileAddress =
    searchContext?.verificationProfile?.address?.trim() || null;
  const searchNearLocation = browserNearLocation ?? profileNearLocation;
  let searchBiasLabel: string | null = null;
  if (browserNearLocation) {
    searchBiasLabel = "Suggestions are biased toward your current location.";
  } else if (fallbackSearchContextLabel) {
    searchBiasLabel = `Suggestions are biased toward ${fallbackSearchContextLabel}.`;
  }

  const resetDraftState = useCallback(() => {
    setPreview(null);
    setHasUnsavedPreview(false);
    setSaveMessage("");
    setCalculateError("");
  }, []);

  const requestBrowserNearLocation = useCallback(() => {
    if (
      browserNearAttempted ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      setBrowserNearAttempted(true);
      return;
    }

    setBrowserNearAttempted(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBrowserNearLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setBrowserNearLocation(null);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 5000,
      }
    );
  }, [browserNearAttempted]);

  const resolveProfileNearLocation = useCallback(async () => {
    if (!isRadarReady || profileNearResolved || !fallbackProfileAddress) {
      return;
    }

    setProfileNearResolved(true);

    try {
      const Radar = await getRadarBrowserClient();
      const response = await Radar.forwardGeocode({
        query: fallbackProfileAddress,
      });
      const [match] = response.addresses as RadarGeocodeAddress[];
      if (!match) {
        return;
      }

      setProfileNearLocation({
        latitude: match.latitude,
        longitude: match.longitude,
      });
    } catch {
      setProfileNearLocation(null);
    }
  }, [fallbackProfileAddress, isRadarReady, profileNearResolved]);

  const ensureSearchContext = useCallback(async () => {
    requestBrowserNearLocation();
    await resolveProfileNearLocation();
  }, [requestBrowserNearLocation, resolveProfileNearLocation]);

  const normalizeAddressKey = useCallback(
    (value: string) => value.trim().toLowerCase(),
    []
  );

  const resolveTripLocation = useCallback(
    async (args: {
      label: string;
      query: string;
      selectedLocation: TripLocation | null;
    }) => {
      const normalizedQuery = args.query.trim();
      if (!normalizedQuery) {
        throw new Error(`Enter the ${args.label} first.`);
      }

      if (
        args.selectedLocation &&
        normalizeAddressKey(args.selectedLocation.address) ===
          normalizeAddressKey(normalizedQuery)
      ) {
        return args.selectedLocation;
      }

      const Radar = await getRadarBrowserClient();
      let response;
      try {
        response = await Radar.forwardGeocode({ query: normalizedQuery });
      } catch (error) {
        if (isRadarRateLimitError(error)) {
          throw new Error(
            "Radar is rate-limiting lookups right now. Keep the verified address text as-is and try route calculation again in a minute.",
            { cause: error }
          );
        }

        throw error;
      }

      return getBestGeocodeResult(
        args.label,
        normalizedQuery,
        response.addresses as RadarGeocodeAddress[]
      );
    },
    [normalizeAddressKey]
  );

  const handleAddressChange = useCallback(
    (
      nextValue: string,
      setter: (value: string) => void,
      clearLocation: (value: TripLocation | null) => void
    ) => {
      setter(nextValue);
      clearLocation(null);
      resetDraftState();
    },
    [resetDraftState]
  );

  const handleOriginAddressChange = useCallback(
    (nextValue: string) => {
      handleAddressChange(nextValue, setOriginAddress, setOriginLocation);
    },
    [handleAddressChange]
  );

  const handlePickupAddressChange = useCallback(
    (nextValue: string) => {
      handleAddressChange(nextValue, setPickupAddress, setPickupLocation);
    },
    [handleAddressChange]
  );

  const handleDropoffAddressChange = useCallback(
    (nextValue: string) => {
      handleAddressChange(nextValue, setDropoffAddress, setDropoffLocation);
    },
    [handleAddressChange]
  );

  const handleReturnAddressChange = useCallback(
    (nextValue: string) => {
      handleAddressChange(nextValue, setReturnAddress, setReturnLocation);
    },
    [handleAddressChange]
  );

  const handlePickupLocationSelect = useCallback(
    (location: TripLocation) => {
      setPickupAddress(location.address);
      setPickupLocation(location);
      resetDraftState();
    },
    [resetDraftState]
  );

  const handleOriginLocationSelect = useCallback(
    (location: TripLocation) => {
      setOriginAddress(location.address);
      setOriginLocation(location);
      resetDraftState();
    },
    [resetDraftState]
  );

  const handleDropoffLocationSelect = useCallback(
    (location: TripLocation) => {
      setDropoffAddress(location.address);
      setDropoffLocation(location);
      resetDraftState();
    },
    [resetDraftState]
  );

  const handleReturnLocationSelect = useCallback(
    (location: TripLocation) => {
      setReturnAddress(location.address);
      setReturnLocation(location);
      resetDraftState();
    },
    [resetDraftState]
  );

  const updateIntermediateStop = useCallback(
    (index: number, value: string) => {
      setIntermediateStops((current) =>
        current.map((stop, stopIndex) => (stopIndex === index ? value : stop))
      );
      setIntermediateStopLocations((current) =>
        current.map((stop, stopIndex) => (stopIndex === index ? null : stop))
      );
      resetDraftState();
    },
    [resetDraftState]
  );

  const addIntermediateStop = useCallback(() => {
    setIntermediateStops((current) => {
      if (current.length >= MAX_INTERMEDIATE_STOPS) {
        return current;
      }

      return [...current, ""];
    });
    setIntermediateStopLocations((current) => [...current, null]);
    setIsStopsExpanded(true);
    resetDraftState();
  }, [resetDraftState]);

  const removeIntermediateStop = useCallback(
    (index: number) => {
      setIntermediateStops((current) =>
        current.filter((_, stopIndex) => stopIndex !== index)
      );
      setIntermediateStopLocations((current) =>
        current.filter((_, stopIndex) => stopIndex !== index)
      );
      resetDraftState();
    },
    [resetDraftState]
  );

  const handleIntermediateStopLocationSelect = useCallback(
    (index: number, location: TripLocation) => {
      setIntermediateStops((current) =>
        current.map((stop, stopIndex) =>
          stopIndex === index ? location.address : stop
        )
      );
      setIntermediateStopLocations((current) =>
        current.map((stop, stopIndex) =>
          stopIndex === index ? location : stop
        )
      );
      resetDraftState();
    },
    [resetDraftState]
  );

  const handleIntermediateStopRemove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const index = Number(event.currentTarget.dataset.stopIndex);
      if (!Number.isInteger(index)) {
        return;
      }

      removeIntermediateStop(index);
    },
    [removeIntermediateStop]
  );

  const toggleStopsExpanded = useCallback(() => {
    setIsStopsExpanded((current) => !current);
  }, []);

  const toggleOriginExpanded = useCallback(() => {
    setIsOriginExpanded((current) => {
      const nextValue = !current;
      if (!nextValue) {
        setOriginAddress("");
        setOriginLocation(null);
        resetDraftState();
      }

      return nextValue;
    });
  }, [resetDraftState]);

  const handleCalculate = useCallback(async () => {
    if (!isRadarReady) {
      setCalculateError(
        "Add NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY to enable Radar trip verification."
      );
      return;
    }

    const originQuery = originAddress.trim();
    const pickupQuery = pickupAddress.trim();
    const dropoffQuery = dropoffAddress.trim();
    const returnQuery = returnAddress.trim();
    const trimmedIntermediateStops = intermediateStops.map((stop) =>
      stop.trim()
    );

    if (!pickupQuery || !dropoffQuery || !returnQuery) {
      setCalculateError("Enter pickup, dropoff, and return addresses first.");
      return;
    }

    if (trimmedIntermediateStops.some((stop) => stop.length === 0)) {
      setCalculateError("Fill in each extra stop or remove the empty one.");
      return;
    }

    setIsCalculating(true);
    setCalculateError("");
    setSaveMessage("");

    try {
      const geocodeInputs = [
        ...(originQuery
          ? [
              {
                label: "starting point before pickup",
                query: originQuery,
                selectedLocation: originLocation,
              },
            ]
          : []),
        {
          label: "pickup address",
          query: pickupQuery,
          selectedLocation: pickupLocation,
        },
        ...trimmedIntermediateStops.map((query, index) => ({
          label: `stop ${index + 1}`,
          query,
          selectedLocation: intermediateStopLocations[index] ?? null,
        })),
        {
          label: "dropoff address",
          query: dropoffQuery,
          selectedLocation: dropoffLocation,
        },
        {
          label: "return address",
          query: returnQuery,
          selectedLocation: returnLocation,
        },
      ];
      const geocodedLocations = await Promise.all(
        geocodeInputs.map((input) => resolveTripLocation(input))
      );

      const resolvedOrigin = originQuery ? geocodedLocations[0] : null;
      const pickupIndex = resolvedOrigin ? 1 : 0;
      const pickup = geocodedLocations[pickupIndex];
      const resolvedIntermediateStopLocations = geocodedLocations.slice(
        pickupIndex + 1,
        pickupIndex + 1 + trimmedIntermediateStops.length
      );
      const dropoff = geocodedLocations.at(-2);
      const resolvedReturnLocation = geocodedLocations.at(-1);
      if (!pickup || !dropoff || !resolvedReturnLocation) {
        setPreview(null);
        setHasUnsavedPreview(false);
        setCalculateError("Radar could not build the full trip route.");
        setIsCalculating(false);
        return;
      }

      const prePickupToPickup =
        resolvedOrigin && pickup
          ? await calculateRadarLeg({
              destination: pickup,
              origin: resolvedOrigin,
            })
          : null;
      const outboundLocations: TripLocation[] = [
        pickup,
        ...resolvedIntermediateStopLocations,
        dropoff,
      ];
      const outboundLegs = await Promise.all(
        outboundLocations.slice(0, -1).map((origin, index) => {
          const destination = outboundLocations[index + 1];

          return destination
            ? calculateRadarLeg({
                destination,
                origin,
              })
            : Promise.reject(
                new Error("Radar could not build the next trip segment.")
              );
        })
      );
      const pickupToDropoff = combineTripRouteLegs(outboundLegs);
      const dropoffToReturn = await calculateRadarLeg({
        destination: resolvedReturnLocation,
        origin: dropoff,
      });
      const routeData: TripRouteData = {
        dropoffToReturn,
        intermediateStops:
          resolvedIntermediateStopLocations.length > 0
            ? resolvedIntermediateStopLocations
            : undefined,
        pickupToDropoff,
        pickupToDropoffLegs: outboundLegs.length > 1 ? outboundLegs : undefined,
        prePickupOrigin: resolvedOrigin ?? undefined,
        prePickupToPickup: prePickupToPickup ?? undefined,
      };

      setPreview({
        dropoff,
        pickup,
        radarDistanceMiles: getTripRouteDistanceMiles(routeData),
        radarDurationSeconds: getTripRouteDurationSeconds(routeData),
        returnLocation: resolvedReturnLocation,
        routeData,
      });
      setHasUnsavedPreview(true);
    } catch (error) {
      setPreview(null);
      setHasUnsavedPreview(false);
      setCalculateError(
        error instanceof Error
          ? error.message
          : "Failed to calculate the Radar route."
      );
    }
    setIsCalculating(false);
  }, [
    dropoffAddress,
    dropoffLocation,
    intermediateStops,
    intermediateStopLocations,
    isRadarReady,
    originAddress,
    originLocation,
    pickupAddress,
    pickupLocation,
    resolveTripLocation,
    returnAddress,
    returnLocation,
  ]);

  const handleSave = useCallback(async () => {
    if (!currentPreview) {
      setCalculateError("Calculate the route before saving it.");
      return;
    }

    setCalculateError("");
    setSaveMessage("");

    try {
      await saveTripVerification.mutateAsync({
        dropoff: currentPreview.dropoff,
        pickup: currentPreview.pickup,
        returnLocation: currentPreview.returnLocation,
        routeData: currentPreview.routeData,
      });
    } catch (error) {
      setCalculateError(
        error instanceof Error
          ? error.message
          : "Failed to save the trip verification."
      );
    }
  }, [currentPreview, saveTripVerification]);

  let comparisonTone = "border-border/50 bg-background/40";
  if (distanceDeltaMiles !== null) {
    comparisonTone =
      Math.abs(distanceDeltaMiles) <= 1
        ? "border-green-500/30 bg-green-500/10"
        : "border-amber-500/30 bg-amber-500/10";
  }
  const previewOrigin = currentPreview?.routeData.prePickupOrigin ?? null;
  const previewStops = currentPreview?.routeData.intermediateStops ?? [];

  return (
    <div id="trip-verification" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
            Trip Verification
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Rebuild the trip with Radar after upload so you can compare the
            screenshot miles against a mapped start, optional stops, final
            dropoff, and return route.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            tripVerification?.status === "verified"
              ? "bg-green-500/10 text-green-600"
              : "bg-amber-500/10 text-amber-600"
          }`}
        >
          {tripVerification?.status === "verified"
            ? "Verified"
            : "Needs verification"}
        </span>
      </div>

      {(tripVerification?.extractedPickupText ||
        tripVerification?.extractedDropoffText) && (
        <div className="grid gap-3 md:grid-cols-2">
          {tripVerification?.extractedPickupText ? (
            <div className="border-border/50 bg-background/40 rounded-xl border p-3 text-sm">
              <div className="text-foreground font-semibold">
                Screenshot pickup
              </div>
              <div className="text-muted-foreground mt-1">
                {tripVerification.extractedPickupText}
              </div>
            </div>
          ) : null}
          {tripVerification?.extractedDropoffText ? (
            <div className="border-border/50 bg-background/40 rounded-xl border p-3 text-sm">
              <div className="text-foreground font-semibold">
                Screenshot dropoff
              </div>
              <div className="text-muted-foreground mt-1">
                {tripVerification.extractedDropoffText}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {suggestedIntermediateStops > 0 ? (
        <div className="border-primary/20 bg-primary/5 text-muted-foreground rounded-xl border p-3 text-sm">
          This screenshot looks like a multi-stop trip. You can still verify
          with pickup, final dropoff, and return only, or add up to{" "}
          {suggestedIntermediateStops} optional stop
          {suggestedIntermediateStops === 1 ? "" : "s"} for a tighter mileage
          estimate.
        </div>
      ) : null}

      <div className="border-border/60 bg-background/30 rounded-2xl border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Route builder</h4>
            <p className="text-muted-foreground text-sm">
              We keep the screenshot pickup and final dropoff as the default
              route, then let you layer in a more exact starting point, stops,
              and return only when you need them.
            </p>
          </div>
          {isOriginExpanded ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleOriginExpanded}
            >
              Started somewhere else?
            </Button>
          )}
        </div>

        {(previewOrigin || previewStops.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previewOrigin ? (
              <span className="rounded-full bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-700">
                Started elsewhere: {previewOrigin.address}
              </span>
            ) : null}
            {previewStops.map((stop, index) => (
              <span
                key={`${stop.address}-${index}`}
                className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium"
              >
                Stop {index + 1}: {stop.address}
              </span>
            ))}
          </div>
        )}

        <div className="relative mt-5 pl-10">
          <div className="bg-border/70 absolute top-4 bottom-4 left-4 w-px" />

          <div className="space-y-4">
            {isOriginExpanded ? (
              <div className="relative space-y-2 rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
                <div className="ring-background absolute top-5 left-[-1.72rem] size-3 rounded-full bg-teal-600 ring-4" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label
                      className="text-sm font-semibold"
                      htmlFor="trip-origin-address"
                    >
                      Started somewhere else?
                    </label>
                    <p className="text-muted-foreground text-xs">
                      Optional. Leave this blank if the screenshot pickup was
                      where the trip really began.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleOriginExpanded}
                  >
                    Hide
                  </Button>
                </div>
                <TripLocationSearchInput
                  id="trip-origin-address"
                  onSearchIntent={ensureSearchContext}
                  onSuggestionSelect={handleOriginLocationSelect}
                  onValueChange={handleOriginAddressChange}
                  placeholder="Home, hotspot, or wherever you were before pickup"
                  searchBiasLabel={searchBiasLabel}
                  value={originAddress}
                  selectedAddress={originLocation?.address}
                  nearLocation={searchNearLocation}
                  fallbackContextLabel={fallbackSearchContextLabel}
                />
              </div>
            ) : null}

            <div className="border-border/60 bg-background/50 relative space-y-2 rounded-xl border p-4">
              <div className="ring-background absolute top-5 left-[-1.72rem] size-3 rounded-full bg-blue-600 ring-4" />
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="text-sm font-semibold"
                  htmlFor="trip-pickup-address"
                >
                  Pickup
                </label>
                {tripVerification?.extractedPickupText ? (
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                    From screenshot
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                This is the default first route point when your screenshot
                already captured the store or pickup spot.
              </p>
              <TripLocationSearchInput
                id="trip-pickup-address"
                onSearchIntent={ensureSearchContext}
                onSuggestionSelect={handlePickupLocationSelect}
                onValueChange={handlePickupAddressChange}
                placeholder="Store or pickup address"
                searchBiasLabel={isOriginExpanded ? null : searchBiasLabel}
                value={pickupAddress}
                selectedAddress={pickupLocation?.address}
                nearLocation={searchNearLocation}
                fallbackContextLabel={fallbackSearchContextLabel}
              />
            </div>

            <div className="border-border/70 bg-background/40 relative rounded-xl border border-dashed p-4">
              <div className="ring-background absolute top-5 left-[-1.72rem] size-3 rounded-full bg-amber-500 ring-4" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Optional stops</div>
                  <div className="text-muted-foreground text-xs">
                    Add these only when they materially improve mileage.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleStopsExpanded}
                  >
                    <ChevronDown
                      className={`mr-2 h-4 w-4 transition-transform ${
                        isStopsExpanded ? "rotate-180" : "rotate-0"
                      }`}
                    />
                    {isStopsExpanded ? "Hide stops" : "Review stops"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addIntermediateStop}
                    disabled={
                      intermediateStops.length >= MAX_INTERMEDIATE_STOPS
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add stop
                  </Button>
                </div>
              </div>

              {isStopsExpanded ? (
                <div className="mt-4 space-y-3">
                  {intermediateStops.length === 0 ? (
                    <div className="border-border/60 bg-background/40 text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                      No extra stops added. Skip this when the pickup to dropoff
                      route is already accurate enough.
                    </div>
                  ) : (
                    intermediateStops.map((stop, index) => (
                      <div
                        key={`trip-stop-${index}`}
                        className="border-border/50 bg-background/60 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1 space-y-2">
                          <label
                            className="text-sm font-semibold"
                            htmlFor={`trip-stop-${index}`}
                          >
                            Stop {index + 1}
                          </label>
                          <TripLocationSearchInput
                            id={`trip-stop-${index}`}
                            onSearchIntent={ensureSearchContext}
                            onSuggestionSelect={(location) => {
                              handleIntermediateStopLocationSelect(
                                index,
                                location
                              );
                            }}
                            onValueChange={(nextValue) => {
                              updateIntermediateStop(index, nextValue);
                            }}
                            placeholder="Restaurant, customer, or waypoint address"
                            value={stop}
                            selectedAddress={
                              intermediateStopLocations[index]?.address
                            }
                            nearLocation={searchNearLocation}
                            fallbackContextLabel={fallbackSearchContextLabel}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 self-end sm:self-auto"
                          data-stop-index={index}
                          onClick={handleIntermediateStopRemove}
                          aria-label={`Remove stop ${index + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="border-border/60 bg-background/50 relative space-y-2 rounded-xl border p-4">
              <div className="ring-background absolute top-5 left-[-1.72rem] size-3 rounded-full bg-violet-600 ring-4" />
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="text-sm font-semibold"
                  htmlFor="trip-dropoff-address"
                >
                  Final dropoff
                </label>
                {tripVerification?.extractedDropoffText ? (
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-700">
                    From screenshot
                  </span>
                ) : null}
              </div>
              <TripLocationSearchInput
                id="trip-dropoff-address"
                onSearchIntent={ensureSearchContext}
                onSuggestionSelect={handleDropoffLocationSelect}
                onValueChange={handleDropoffAddressChange}
                placeholder="Customer or final destination address"
                value={dropoffAddress}
                selectedAddress={dropoffLocation?.address}
                nearLocation={searchNearLocation}
                fallbackContextLabel={fallbackSearchContextLabel}
              />
            </div>

            <div className="relative space-y-2 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="ring-background absolute top-5 left-[-1.72rem] size-3 rounded-full bg-green-600 ring-4" />
              <label
                className="text-sm font-semibold"
                htmlFor="trip-return-address"
              >
                Return location
              </label>
              <p className="text-muted-foreground text-xs">
                This is the one field most drivers need to add manually after we
                seed the rest of the route from the screenshot.
              </p>
              <TripLocationSearchInput
                id="trip-return-address"
                onSearchIntent={ensureSearchContext}
                onSuggestionSelect={handleReturnLocationSelect}
                onValueChange={handleReturnAddressChange}
                placeholder="Home, hotspot, or wherever you went after dropoff"
                value={returnAddress}
                selectedAddress={returnLocation?.address}
                nearLocation={searchNearLocation}
                fallbackContextLabel={fallbackSearchContextLabel}
              />
            </div>
          </div>
        </div>
      </div>

      {isRadarReady ? null : (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700">
          Radar is not configured in this environment yet. Add{" "}
          <code>NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY</code> to enable route
          calculation and map rendering.
        </div>
      )}

      {calculateError ? (
        <div className="border-destructive/20 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
          {calculateError}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700">
          {saveMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={handleCalculate}
          disabled={isCalculating || saveTripVerification.isPending}
        >
          {isCalculating ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Route className="mr-2 h-4 w-4" />
          )}
          {isCalculating ? "Calculating..." : "Calculate with Radar"}
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={handleSave}
          disabled={
            !currentPreview ||
            !hasUnsavedPreview ||
            isCalculating ||
            saveTripVerification.isPending
          }
        >
          {saveTripVerification.isPending ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {saveTripVerification.isPending ? "Saving..." : "Save verification"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className={comparisonTone}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Navigation className="h-4 w-4" />
              Screenshot miles
            </div>
            <div className="mt-2 text-2xl font-bold">
              {formatMilesLabel(screenshotDistanceMiles)}
            </div>
          </CardContent>
        </Card>
        <Card className={comparisonTone}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Route className="h-4 w-4" />
              Radar miles
            </div>
            <div className="mt-2 text-2xl font-bold">
              {formatMilesLabel(currentRadarDistanceMiles)}
            </div>
            {distanceDeltaMiles === null ? null : (
              <div className="text-muted-foreground mt-1 text-sm">
                {distanceDeltaMiles >= 0 ? "+" : ""}
                {distanceDeltaMiles.toFixed(2)} mi vs screenshot
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-background/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPinned className="h-4 w-4" />
              Route duration
            </div>
            <div className="mt-2 text-2xl font-bold">
              {formatDurationLabel(currentRadarDurationSeconds)}
            </div>
            {verifiedAtLabel || routeCalculatedAtLabel ? (
              <div className="text-muted-foreground mt-1 text-sm">
                {verifiedAtLabel
                  ? `Verified ${verifiedAtLabel}`
                  : `Calculated ${routeCalculatedAtLabel}`}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {currentPreview ? (
        <TripRouteMap
          dropoff={currentPreview.dropoff}
          pickup={currentPreview.pickup}
          returnLocation={currentPreview.returnLocation}
          routeData={currentPreview.routeData}
        />
      ) : (
        <div className="border-border/60 bg-background/30 text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
          Calculate the Radar route to preview the map and save the verified
          trip.
        </div>
      )}
    </div>
  );
}
