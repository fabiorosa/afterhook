import { describe, expect, it } from "vitest";

import { createDestinationInputSchema, endpointSlugSchema } from "./index.js";

describe("setup contracts", () => {
  it("accepts a safe destination input", () => {
    expect(
      createDestinationInputSchema.parse({
        name: "Incident receiver",
        url: "https://hooks.example.test/incident",
        authorization: "Bearer token",
      }),
    ).toMatchObject({ name: "Incident receiver" });
  });

  it("rejects unsafe protocol, line breaks, and invalid slugs", () => {
    expect(
      createDestinationInputSchema.safeParse({
        name: "Destination",
        url: "ftp://example.test",
      }).success,
    ).toBe(false);
    expect(
      createDestinationInputSchema.safeParse({
        name: "Destination",
        url: "https://example.test",
        authorization: "Bearer safe\nInjected: value",
      }).success,
    ).toBe(false);
    expect(endpointSlugSchema.safeParse("Not-a-slug").success).toBe(false);
  });
});
