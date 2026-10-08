import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripLocationSearchInput } from "@/components/dashboard/trip-location-search-input";
import { getRadarBrowserClient, isRadarConfigured } from "@/lib/radar/client";

vi.mock("@tanstack/react-pacer", () => ({
  useDebouncedValue: (value: string) => [
    value,
    { state: { isPending: false } },
  ],
}));

vi.mock("@/lib/radar/client", () => ({
  getRadarBrowserClient: vi.fn(),
  isRadarConfigured: vi.fn(() => true),
}));

const createAutocompleteAddress = (index: number) => ({
  city: "Searcy",
  formattedAddress: `${100 + index} Main St, Searcy, AR 72143`,
  geometry: {
    coordinates: [-91.736 + index / 1000, 35.2506 + index / 1000],
    type: "Point" as const,
  },
  latitude: 35.2506 + index / 1000,
  longitude: -91.736 + index / 1000,
  number: `${100 + index}`,
  postalCode: "72143",
  stateCode: "AR",
  street: "Main St",
});

describe("TripLocationSearchInput", () => {
  beforeEach(() => {
    vi.mocked(isRadarConfigured).mockReturnValue(true);
    vi.mocked(getRadarBrowserClient).mockResolvedValue({
      autocomplete: vi.fn().mockResolvedValue({
        addresses: [createAutocompleteAddress(0), createAutocompleteAddress(1)],
      }),
      searchPlaces: vi.fn().mockResolvedValue({ places: [] }),
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tracks the active option and closes when focus leaves the combobox", async () => {
    render(
      <>
        <TripLocationSearchInput
          onSuggestionSelect={vi.fn()}
          onValueChange={vi.fn()}
          placeholder="Search addresses"
          value="123456"
        />
        <button type="button">Outside</button>
      </>
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");

    expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input).toHaveAttribute("aria-activedescendant", options[1]?.id);

    fireEvent.blur(input, {
      relatedTarget: screen.getByRole("button", { name: "Outside" }),
    });

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("renders search status outside of the listbox when no suggestions are available", async () => {
    vi.mocked(getRadarBrowserClient).mockResolvedValue({
      autocomplete: vi.fn().mockResolvedValue({ addresses: [] }),
      searchPlaces: vi.fn().mockResolvedValue({ places: [] }),
    } as never);

    render(
      <TripLocationSearchInput
        onSuggestionSelect={vi.fn()}
        onValueChange={vi.fn()}
        placeholder="Search addresses"
        value="123456"
      />
    );

    const status = await screen.findByRole("status");

    expect(status).toHaveTextContent(
      "No address suggestions yet. You can still type the full address manually."
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
