import { describe, expect, it } from "vitest";

import {
  legalNameSchema,
  phoneSchema,
  sanitizePhoneInput,
} from "@/lib/validations";

describe("onboarding validation helpers", () => {
  it("strips unsupported characters from phone input", () => {
    expect(sanitizePhoneInput("abc123-45x")).toBe("123-45");
  });

  it("rejects obviously invalid legal names", () => {
    const result = legalNameSchema.safeParse("12");

    expect(result.success).toBe(false);
  });

  it("rejects phone numbers without enough digits", () => {
    const result = phoneSchema.safeParse("555");

    expect(result.success).toBe(false);
  });
});
