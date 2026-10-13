import { useDebouncedValue } from "@tanstack/react-pacer";
import { LoaderCircle, MapPin } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FocusEvent, KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { getRadarBrowserClient, isRadarConfigured } from "@/lib/radar/client";
import {
  RADAR_SEARCH_RESULT_LIMIT,
  buildRadarAutocompleteQuery,
  buildRadarPlaceSearchChains,
  getRadarSearchMode,
  mergeRadarSearchSuggestions,
  normalizeRadarAutocompleteSuggestions,
  normalizeRadarPlaceSuggestions,
  toTripLocationFromSuggestion,
} from "@/lib/radar/search";
import type {
  RadarAddressSuggestion,
  RadarSearchNearLocation,
} from "@/lib/radar/search";
import type { TripLocation } from "@/lib/trip-verification";
import { cn } from "@/lib/utils";

const DEBOUNCE_WAIT_MS = 250;
const MINIMUM_QUERY_LENGTH = 6;
const PLACE_SEARCH_RADIUS_METERS = 25_000;
const RADAR_RATE_LIMIT_COOLDOWN_MS = 60_000;

let radarSearchCooldownUntil = 0;

const getRadarRateLimitMessage = () =>
  "Radar suggestions are cooling down after a rate limit. Keep typing the full address manually for now, or try suggestions again in a minute.";

const isRadarRateLimitError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ("code" in error ? (error as { code?: number }).code === 429 : false);

interface TripLocationSearchInputProps {
  disabled?: boolean;
  fallbackContextLabel?: string | null;
  id?: string;
  nearLocation?: RadarSearchNearLocation | null;
  onSearchIntent?: () => Promise<void> | void;
  onSuggestionSelect: (location: TripLocation) => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  searchBiasLabel?: string | null;
  selectedAddress?: string | null;
  value: string;
}

export const TripLocationSearchInput = ({
  disabled = false,
  fallbackContextLabel = null,
  id,
  nearLocation = null,
  onSearchIntent,
  onSuggestionSelect,
  onValueChange,
  placeholder,
  searchBiasLabel = null,
  selectedAddress = null,
  value,
}: TripLocationSearchInputProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestRequestIdRef = useRef(0);
  const listboxId = useId();
  const statusMessageId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RadarAddressSuggestion[]>([]);

  const [debouncedQuery, debouncer] = useDebouncedValue(
    value,
    { wait: DEBOUNCE_WAIT_MS },
    (state) => ({ isPending: state.isPending })
  );

  const trimmedValue = value.trim();
  const trimmedDebouncedQuery = debouncedQuery.trim();
  const normalizedSelectedAddress = selectedAddress?.trim().toLowerCase() ?? "";
  const normalizedDebouncedQuery = trimmedDebouncedQuery.toLowerCase();
  const isStableSelectedAddress =
    normalizedSelectedAddress.length > 0 &&
    normalizedSelectedAddress === normalizedDebouncedQuery;
  const searchMode = useMemo(
    () => getRadarSearchMode(trimmedDebouncedQuery),
    [trimmedDebouncedQuery]
  );
  const canSearch =
    !disabled &&
    isRadarConfigured() &&
    trimmedDebouncedQuery.length >= MINIMUM_QUERY_LENGTH &&
    !isStableSelectedAddress;

  const shouldShowDropdown =
    isOpen &&
    trimmedValue.length >= MINIMUM_QUERY_LENGTH &&
    (isLoading ||
      Boolean(searchError) ||
      suggestions.length > 0 ||
      hasSearched);
  const shouldShowListbox = shouldShowDropdown && suggestions.length > 0;
  const activeSuggestionId =
    shouldShowListbox && activeIndex >= 0 && suggestions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const selectSuggestion = useCallback(
    (suggestion: RadarAddressSuggestion) => {
      onSuggestionSelect(toTripLocationFromSuggestion(suggestion));
      setSuggestions([]);
      setHasSearched(false);
      setSearchError(null);
      closeDropdown();
    },
    [closeDropdown, onSuggestionSelect]
  );

  useEffect(() => {
    const resetSearch = (
      message: string | null,
      searched: boolean,
      force: boolean
    ) => {
      if (suggestions.length > 0) {
        setSuggestions([]);
      }
      if (hasSearched !== searched || force) {
        setHasSearched(searched);
      }
      if (isLoading) {
        setIsLoading(false);
      }
      if (searchError !== message) {
        setSearchError(message);
      }
      if (activeIndex !== -1) {
        setActiveIndex(-1);
      }
    };

    const loadSuggestions = async () => {
      if (!canSearch) {
        resetSearch(null, false, true);
        return;
      }

      if (Date.now() < radarSearchCooldownUntil) {
        resetSearch(getRadarRateLimitMessage(), true, true);
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;

      setIsLoading(true);
      setSearchError(null);
      try {
        try {
          await onSearchIntent?.();
        } catch {
          return;
        }

        const Radar = await getRadarBrowserClient();
        const locationBias = nearLocation
          ? {
              latitude: nearLocation.latitude,
              longitude: nearLocation.longitude,
            }
          : undefined;
        const autocompletePromise = Radar.autocomplete({
          limit: RADAR_SEARCH_RESULT_LIMIT,
          near: locationBias,
          query: buildRadarAutocompleteQuery(
            trimmedDebouncedQuery,
            nearLocation ? null : fallbackContextLabel
          ),
        });
        const placeChains =
          searchMode === "place"
            ? buildRadarPlaceSearchChains(
                trimmedDebouncedQuery,
                fallbackContextLabel
              )
            : [];
        const placeSearchPromise =
          searchMode === "place" && locationBias && placeChains.length > 0
            ? Radar.searchPlaces({
                chains: placeChains,
                limit: RADAR_SEARCH_RESULT_LIMIT,
                near: locationBias,
                radius: PLACE_SEARCH_RADIUS_METERS,
              })
            : null;
        const [autocompleteResponse, placeSearchResponse] = await Promise.all([
          autocompletePromise,
          placeSearchPromise,
        ]);

        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        const nextSuggestions = mergeRadarSearchSuggestions(
          normalizeRadarPlaceSuggestions(
            placeSearchResponse?.places ?? [],
            fallbackContextLabel
          ),
          normalizeRadarAutocompleteSuggestions(
            autocompleteResponse.addresses,
            trimmedDebouncedQuery
          )
        );

        setSuggestions(nextSuggestions);
        setHasSearched(true);
        setIsOpen(true);
        setActiveIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch (error) {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setSuggestions([]);
        setHasSearched(true);
        if (isRadarRateLimitError(error)) {
          radarSearchCooldownUntil = Date.now() + RADAR_RATE_LIMIT_COOLDOWN_MS;
        }
        setSearchError(
          isRadarRateLimitError(error)
            ? getRadarRateLimitMessage()
            : error instanceof Error
              ? error.message
              : "Unable to load address suggestions right now."
        );
      }
      if (latestRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [
    activeIndex,
    canSearch,
    fallbackContextLabel,
    hasSearched,
    isLoading,
    nearLocation,
    onSearchIntent,
    searchMode,
    searchError,
    suggestions.length,
    trimmedDebouncedQuery,
  ]);

  useEffect(() => {
    if (!shouldShowDropdown) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeDropdown, shouldShowDropdown]);

  const handleInputChange = useCallback(
    (nextValue: string) => {
      onValueChange(nextValue);
      setHasSearched(false);
      setSearchError(null);
      setActiveIndex(-1);
      setIsOpen(nextValue.trim().length >= MINIMUM_QUERY_LENGTH);
    },
    [onValueChange]
  );

  const handleInputFocus = useCallback(() => {
    if (
      trimmedValue.length >= MINIMUM_QUERY_LENGTH &&
      !isStableSelectedAddress &&
      Date.now() >= radarSearchCooldownUntil
    ) {
      setIsOpen(true);
    }
  }, [isStableSelectedAddress, trimmedValue.length]);

  const handleContainerBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextFocused = event.relatedTarget;
      if (
        nextFocused instanceof Node &&
        containerRef.current?.contains(nextFocused)
      ) {
        return;
      }

      closeDropdown();
    },
    [closeDropdown]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!shouldShowDropdown || suggestions.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((currentIndex) =>
          currentIndex >= suggestions.length - 1 ? 0 : currentIndex + 1
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((currentIndex) =>
          currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1
        );
        return;
      }

      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        const activeSuggestion = suggestions[activeIndex];
        if (activeSuggestion) {
          selectSuggestion(activeSuggestion);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
      }
    },
    [
      activeIndex,
      closeDropdown,
      selectSuggestion,
      shouldShowDropdown,
      suggestions,
    ]
  );

  const statusMessage = useMemo(() => {
    if (searchError) {
      return searchError;
    }

    if (isLoading) {
      return searchMode === "place"
        ? "Searching nearby stores, restaurants, and addresses..."
        : "Searching nearby addresses...";
    }

    if (hasSearched && suggestions.length === 0) {
      return searchMode === "place"
        ? "No nearby place matches yet. You can still type the full address manually."
        : "No address suggestions yet. You can still type the full address manually.";
    }

    return null;
  }, [hasSearched, isLoading, searchError, searchMode, suggestions.length]);

  return (
    <div
      className="relative z-20 space-y-2"
      onBlur={handleContainerBlur}
      ref={containerRef}
    >
      <div className="relative">
        <Input
          aria-activedescendant={activeSuggestionId}
          aria-autocomplete="list"
          aria-controls={shouldShowListbox ? listboxId : undefined}
          aria-describedby={statusMessage ? statusMessageId : undefined}
          aria-expanded={shouldShowDropdown}
          autoComplete="off"
          className="pr-9"
          disabled={disabled}
          id={id}
          onChange={(event) => {
            handleInputChange(event.target.value);
          }}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={value}
        />
        {(isLoading || debouncer.state.isPending) && (
          <div className="text-muted-foreground absolute inset-y-0 right-3 flex items-center">
            <LoaderCircle className="size-4 animate-spin" />
          </div>
        )}
        {shouldShowDropdown && (
          <div className="absolute top-[calc(100%+0.25rem)] right-0 left-0 z-30 space-y-1">
            {shouldShowListbox ? (
              <div
                className="text-popover-foreground border-border/80 bg-background max-h-72 overflow-y-auto rounded-md border shadow-xl"
                id={listboxId}
                role="listbox"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    aria-selected={activeIndex === index}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-3 px-3 py-2 text-left",
                      activeIndex === index &&
                        "bg-accent text-accent-foreground"
                    )}
                    id={`${listboxId}-option-${index}`}
                    key={suggestion.id}
                    onClick={() => {
                      selectSuggestion(suggestion);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block truncate text-sm font-medium">
                        {suggestion.primaryText}
                      </span>
                      {suggestion.secondaryText ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {suggestion.secondaryText}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {statusMessage ? (
              <div
                className="text-muted-foreground border-border/80 bg-background rounded-md border px-3 py-2 text-xs shadow-xl"
                id={statusMessageId}
                role="status"
              >
                {statusMessage}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {searchBiasLabel ? (
        <p className="text-muted-foreground text-xs">{searchBiasLabel}</p>
      ) : null}
    </div>
  );
};
