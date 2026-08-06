import { describe, expect, it } from "vitest";

import { isDeliveryAddressAllowed, parseDestinationUrl } from "./index.js";

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
