import { describe, expect, it } from "vitest";

import {
  createDestinationInputSchema,
  endpointSlugSchema,
  idempotencyKeySchema,
  webhookHeadersSchema,
  webhookPayloadSchema,
} from "./index.js";

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

describe("ingestion contracts", () => {
  it("accepts explicit signed-request metadata and an object payload", () => {
    expect(
      webhookHeadersSchema.parse({
        timestamp: "1785292800",
        signature: `sha256=${"a".repeat(64)}`,
        idempotencyKey: "billing.event:2026-07-29",
      }),
    ).toMatchObject({
      timestamp: 1785292800,
      idempotencyKey: "billing.event:2026-07-29",
    });
    expect(
      webhookPayloadSchema.safeParse({ event: "invoice.paid" }).success,
    ).toBe(true);
  });

  it("rejects ambiguous headers, unsafe keys, and non-object payloads", () => {
    expect(
      webhookHeadersSchema.safeParse({
        timestamp: "now",
        signature: "not-a-signature",
        idempotencyKey: "key with spaces",
      }).success,
    ).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(
      webhookPayloadSchema.safeParse(["not", "an", "object"]).success,
    ).toBe(false);
  });
});
