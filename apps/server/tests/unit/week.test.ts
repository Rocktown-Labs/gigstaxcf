import { describe, expect, it } from "vitest";

import {
  getWeekStartDate,
  getWeekStartDateUtc,
  getWeekStartOffset,
  getWeekStartsOn,
  getWeekdayLabels,
  isWeekStartsOn,
} from "@/lib/week";

describe("week helpers", () => {
  it("detects valid week start values", () => {
    expect(isWeekStartsOn("sunday")).toBe(true);
    expect(isWeekStartsOn("monday")).toBe(true);
    expect(isWeekStartsOn("friday")).toBe(false);
    expect(isWeekStartsOn(null)).toBe(false);
  });

  it("uses fallback when week start input is invalid", () => {
    expect(getWeekStartsOn("invalid", "monday")).toBe("monday");
    expect(getWeekStartsOn(null)).toBe("sunday");
  });

  it("returns weekday labels by configured week start", () => {
    expect(getWeekdayLabels("sunday")).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(getWeekdayLabels("monday")).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("computes week offsets correctly for sunday and monday starts", () => {
    // Sunday (0) stays 0 when week starts on sunday.
    expect(getWeekStartOffset(0, "sunday")).toBe(0);
    // Sunday (0) maps to 6 when week starts on monday.
    expect(getWeekStartOffset(0, "monday")).toBe(6);
    // Monday (1) maps to 0 when week starts on monday.
    expect(getWeekStartOffset(1, "monday")).toBe(0);
  });

  it("computes local week start date", () => {
    // Wednesday, Feb 19 2026 local date.
    const date = new Date(2026, 1, 19, 10, 30, 0);

    const sundayStart = getWeekStartDate(date, "sunday");
    const mondayStart = getWeekStartDate(date, "monday");

    expect(sundayStart.getDate()).toBe(15);
    expect(mondayStart.getDate()).toBe(16);
  });

  it("computes UTC week start date", () => {
    // 2026-02-19T10:30:00Z is Thursday.
    const date = new Date("2026-02-19T10:30:00.000Z");

    const sundayStart = getWeekStartDateUtc(date, "sunday");
    const mondayStart = getWeekStartDateUtc(date, "monday");

    expect(sundayStart.toISOString().slice(0, 10)).toBe("2026-02-15");
    expect(mondayStart.toISOString().slice(0, 10)).toBe("2026-02-16");
  });
});
