import type {
  DestinationResponse,
  EndpointResponse,
} from "@afterhook/contracts";
import {
  createWebhookSignature,
  digestWebhookPayload,
} from "@afterhook/domain";
import { afterEach, describe, expect, it } from "vitest";

import type { SetupRepository } from "./persistence/repository.js";
import { buildServer } from "./server.js";

const timestamp = "2026-07-26T00:00:00.000Z";
const endpoint: EndpointResponse = {
  id: "b102edbf-3ce2-4f4f-b7b3-607cefc2f5c8",
  name: "Billing events",
  slug: "billing-events-ab12cd",
  enabled: true,
  secretFingerprint: "sha256:0123456789abcdef",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const destination: DestinationResponse = {
  id: "e30d2dc1-afef-4b92-9b6d-2cf8ca03c6c6",
  name: "Billing receiver",
  url: "https://example.test/hooks/billing",
  enabled: true,
  hasAuthorization: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const signingSecret = "ahsec_only_returned_once";
const webhookTimestamp = 1785292800;
const webhookNow = new Date(webhookTimestamp * 1000);

function createRepository(
  ingestionEnabled = endpoint.enabled,
): SetupRepository {
  return {
    createEndpoint: () => Promise.resolve({ endpoint, signingSecret }),
    createDestination: () => Promise.resolve(destination),
    listEndpoints: () => Promise.resolve([endpoint]),
    listDestinations: () => Promise.resolve([destination]),
    findIngestionEndpoint: (slug) =>
      Promise.resolve(
        slug === endpoint.slug
          ? { id: endpoint.id, enabled: ingestionEnabled, signingSecret }
          : null,
      ),
  };
}

describe("setup HTTP contract", () => {
  const app = buildServer(createRepository());

  afterEach(async () => {
    await app.ready();
  });

  it("returns an endpoint secret only from creation", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/endpoints",
      payload: { name: "Billing events" },
    });
    const listed = await app.inject({ method: "GET", url: "/v1/endpoints" });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      signingSecret: "ahsec_only_returned_once",
      secretFingerprint: endpoint.secretFingerprint,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain("ahsec_only_returned_once");
    expect(listed.body).not.toContain("secret_encrypted");
  });

  it("validates setup input and never reflects authorization", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/destinations",
      payload: { name: "x", url: "ftp://example.test" },
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/destinations",
      payload: {
        name: "Billing receiver",
        url: "https://example.test/hooks",
        authorization: "Bearer private-value",
      },
    });

    expect(invalid.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain("private-value");
    expect(created.body).not.toContain("authorizationEncrypted");
  });
});

describe("ingestion HTTP contract", () => {
  const app = buildServer(createRepository(), { now: () => webhookNow });
  const rawBody = '{"event":"invoice.paid","amount":4200}';
  const validHeaders = {
    "content-type": "application/json",
    "idempotency-key": "invoice-4200",
    "x-afterhook-timestamp": String(webhookTimestamp),
    "x-afterhook-signature": createWebhookSignature(
      signingSecret,
      webhookTimestamp,
      rawBody,
    ),
  };

  it("accepts a current signature over the exact raw JSON bytes", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: rawBody,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: true,
      endpointId: endpoint.id,
      idempotencyKey: "invoice-4200",
      payloadDigest: digestWebhookPayload(rawBody),
    });
    expect(response.body).not.toContain(signingSecret);
  });

  it("rejects stale, altered, and unknown endpoint requests safely", async () => {
    const stale = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: {
        ...validHeaders,
        "x-afterhook-timestamp": String(webhookTimestamp - 301),
        "x-afterhook-signature": createWebhookSignature(
          signingSecret,
          webhookTimestamp - 301,
          rawBody,
        ),
      },
      payload: rawBody,
    });
    const altered = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: `${rawBody} `,
    });
    const missing = await app.inject({
      method: "POST",
      url: "/v1/endpoints/missing-endpoint/events",
      headers: validHeaders,
      payload: rawBody,
    });
    const disabledApp = buildServer(createRepository(false), {
      now: () => webhookNow,
    });
    const disabled = await disabledApp.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: rawBody,
    });

    expect(stale.statusCode).toBe(401);
    expect(altered.statusCode).toBe(401);
    expect(missing.statusCode).toBe(404);
    expect(disabled.statusCode).toBe(404);
    expect(
      `${stale.body}${altered.body}${missing.body}${disabled.body}`,
    ).not.toContain(signingSecret);
  });

  it("rejects invalid headers, JSON shapes, media types, and oversized bodies", async () => {
    const invalidHeaders = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });
    const arrayPayload = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: "[]",
    });
    const malformedJson = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: "{",
    });
    const wrongMediaType = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: { ...validHeaders, "content-type": "text/plain" },
      payload: rawBody,
    });
    const oversized = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: JSON.stringify({ value: "x".repeat(262_144) }),
    });

    expect(invalidHeaders.statusCode).toBe(400);
    expect(arrayPayload.statusCode).toBe(400);
    expect(malformedJson.statusCode).toBe(400);
    expect(wrongMediaType.statusCode).toBe(415);
    expect(oversized.statusCode).toBe(413);
  });

  it("classifies unexpected failures without exposing their cause", async () => {
    const failingRepository: SetupRepository = {
      ...createRepository(),
      findIngestionEndpoint: () =>
        Promise.reject(
          new Error("database connection includes private detail"),
        ),
    };
    const failingApp = buildServer(failingRepository, {
      now: () => webhookNow,
    });
    const response = await failingApp.inject({
      method: "POST",
      url: `/v1/endpoints/${endpoint.slug}/events`,
      headers: validHeaders,
      payload: rawBody,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "INTERNAL_ERROR",
      message: "The request could not be processed.",
    });
    expect(response.body).not.toContain("private detail");
  });
});
