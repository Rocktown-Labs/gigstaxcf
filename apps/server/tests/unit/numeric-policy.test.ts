import { describe, expect, it } from "vitest";

import {
  formatFixed,
  hasMaxFractionDigits,
  parseFiniteNumber,
  roundToFractionDigits,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-policy";

describe("numeric-policy", () => {
  it("rounds decimals to configured precision", () => {
    expect(roundToFractionDigits(100.458494, 2)).toBe(100.46);
    expect(roundToFractionDigits(6.789, 2)).toBe(6.79);
  });

  it("checks decimal precision with floating-point tolerance", () => {
    expect(hasMaxFractionDigits(10.12, 2)).toBe(true);
    expect(hasMaxFractionDigits(10.123, 2)).toBe(false);
    expect(hasMaxFractionDigits(0.1 + 0.2, 2)).toBe(true);
  });

  it("formats rounded values to fixed digits", () => {
    expect(formatFixed(100.458494, 2)).toBe("100.46");
    expect(formatFixed(4, 2)).toBe("4.00");
  });

  it("sanitizes decimal text input", () => {
    expect(sanitizeDecimalInput("abc100.458494xyz", 2)).toBe("100.458494");
    expect(sanitizeDecimalInput(".5", 2)).toBe("0.5");
    expect(sanitizeDecimalInput("0012.30", 2)).toBe("12.30");
  });

  it("sanitizes integer text input", () => {
    expect(sanitizeIntegerInput("00a12b3")).toBe("123");
    expect(sanitizeIntegerInput("000")).toBe("0");
    expect(sanitizeIntegerInput("abc")).toBe("");
  });

  it("parses only finite numeric values", () => {
    expect(parseFiniteNumber("100.46")).toBe(100.46);
    expect(parseFiniteNumber(6.79)).toBe(6.79);
    expect(parseFiniteNumber("")).toBeNull();
    expect(parseFiniteNumber("abc")).toBeNull();
    expect(parseFiniteNumber(Infinity)).toBeNull();
    expect(parseFiniteNumber(-Infinity)).toBeNull();
  });
});
