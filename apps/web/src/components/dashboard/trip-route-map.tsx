import { useMemo } from "react";

import { buildTripRouteStaticMapUrl } from "@/lib/radar/static-map";
import type { TripLocation, TripRouteData } from "@/lib/trip-verification";

interface TripRouteMapProps {
  dropoff: TripLocation;
  pickup: TripLocation;
  returnLocation: TripLocation;
  routeData: TripRouteData;
}

export function TripRouteMap({
  dropoff,
  pickup,
  returnLocation,
  routeData,
}: TripRouteMapProps) {
  const staticMapUrl = useMemo(
    () =>
      buildTripRouteStaticMapUrl({
        dropoff,
        pickup,
        returnLocation,
        routeData,
      }),
    [dropoff, pickup, returnLocation, routeData]
  );

  if (!staticMapUrl) {
    return (
      <div className="border-border/50 bg-background/40 text-muted-foreground flex h-80 w-full items-center justify-center rounded-xl border px-6 text-center text-sm">
        Radar is not configured yet, so the static route preview is unavailable.
      </div>
    );
  }

  return (
    <div className="border-border/50 bg-card overflow-hidden rounded-xl border shadow-sm">
      <img
        alt="Static preview of the verified trip route."
        className="block h-80 w-full object-cover"
        height={640}
        loading="lazy"
        src={staticMapUrl}
        width={1200}
      />
    </div>
  );
}
