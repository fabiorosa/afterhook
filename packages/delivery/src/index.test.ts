import { describe, expect, it } from "vitest";

import {
  isDeliveryAddressAllowed,
  parseDestinationUrl,
  parseRetryAfterMilliseconds,
} from "./index.js";

describe("destination network policy", () => {
  it("accepts only credential-free HTTP destinations", () => {
    expect(
      parseDestinationUrl("https://hooks.example.com/events").hostname,
    ).toBe("hooks.example.com");
    expect(() => parseDestinationUrl("ftp://example.com/file")).toThrow();
    expect(() =>
      parseDestinationUrl("https://user:secret@example.com/events"),
    ).toThrow();
  });

  it("blocks non-public address ranges unless explicitly local", () => {
    expect(isDeliveryAddressAllowed("93.184.216.34")).toBe(true);
    expect(isDeliveryAddressAllowed("127.0.0.1")).toBe(false);
    expect(isDeliveryAddressAllowed("10.0.0.1")).toBe(false);
    expect(isDeliveryAddressAllowed("169.254.169.254", true)).toBe(false);
    expect(isDeliveryAddressAllowed("::1")).toBe(false);
    expect(isDeliveryAddressAllowed("127.0.0.1", true)).toBe(true);
    expect(isDeliveryAddressAllowed("::1", true)).toBe(true);
  });
});

describe("Retry-After policy", () => {
  const now = new Date("2026-08-06T01:00:00.000Z");

  it("parses seconds and dates within the documented maximum", () => {
    expect(parseRetryAfterMilliseconds("2", now)).toBe(2_000);
    expect(
      parseRetryAfterMilliseconds("Thu, 06 Aug 2026 01:00:05 GMT", now),
    ).toBe(5_000);
    expect(parseRetryAfterMilliseconds("90", now)).toBe(30_000);
  });

  it("ignores missing, invalid, and expired values", () => {
    expect(parseRetryAfterMilliseconds(undefined, now)).toBeNull();
    expect(parseRetryAfterMilliseconds("invalid", now)).toBeNull();
    expect(parseRetryAfterMilliseconds("0", now)).toBeNull();
  });
});
