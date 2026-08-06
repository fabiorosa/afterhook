import { describe, expect, it } from "vitest";

import {
  createDestinationInputSchema,
  deliveryAttemptSchema,
  deliveryJobSchema,
  endpointSlugSchema,
  eventDetailSchema,
  eventFilterSchema,
  eventListItemSchema,
  idempotencyKeySchema,
  ingestionReceiptSchema,
  manualRetryErrorSchema,
  manualRetryResponseSchema,
  systemHealthSchema,
  workerHeartbeatSchema,
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
  it("accepts only an event identifier in delivery jobs", () => {
    const eventId = "75339b4d-bb60-43b6-93bd-30436cb6454a";
    expect(deliveryJobSchema.parse({ eventId })).toEqual({ eventId });
    expect(() => deliveryJobSchema.parse({ eventId, payload: {} })).toThrow();
    expect(() => deliveryJobSchema.parse({ eventId: "not-a-uuid" })).toThrow();
  });

  it("validates timestamped worker heartbeats", () => {
    expect(
      workerHeartbeatSchema.parse({
        workerId: "worker-local-1",
        recordedAt: "2026-08-05T23:59:00.000Z",
      }),
    ).toEqual({
      workerId: "worker-local-1",
      recordedAt: "2026-08-05T23:59:00.000Z",
    });
  });

  it("keeps public health output narrow", () => {
    expect(
      systemHealthSchema.parse({
        status: "ok",
        worker: {
          status: "healthy",
          lastSeenAt: "2026-08-05T23:59:00.000Z",
        },
      }),
    ).toEqual({
      status: "ok",
      worker: {
        status: "healthy",
        lastSeenAt: "2026-08-05T23:59:00.000Z",
      },
    });
  });

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

  it("requires a stable event identity and duplicate outcome", () => {
    expect(
      ingestionReceiptSchema.parse({
        accepted: true,
        eventId: "75339b4d-bb60-43b6-93bd-30436cb6454a",
        endpointId: "b102edbf-3ce2-4f4f-b7b3-607cefc2f5c8",
        idempotencyKey: "billing.event:2026-08-05",
        payloadDigest: `sha256:${"a".repeat(64)}`,
        duplicate: false,
      }),
    ).toMatchObject({ duplicate: false });
  });
});

describe("event inspection contracts", () => {
  const event = {
    id: "75339b4d-bb60-43b6-93bd-30436cb6454a",
    endpoint: {
      id: "b102edbf-3ce2-4f4f-b7b3-607cefc2f5c8",
      name: "Billing events",
      slug: "billing-events-ab12cd",
    },
    idempotencyKey: "invoice-4200",
    status: "RECEIVED" as const,
    receivedAt: "2026-08-05T12:00:00.000Z",
    attemptCount: 0,
  };

  it("validates safe list and detail projections", () => {
    expect(eventListItemSchema.parse(event)).toEqual(event);
    expect(
      eventDetailSchema.parse({
        ...event,
        payloadDigest: `sha256:${"a".repeat(64)}`,
        payloadRedacted: { event: "invoice.paid", token: "[REDACTED]" },
        activities: [
          {
            id: "17bfabde-4c6c-4722-a3a2-6c9c9e77e49c",
            type: "event.received",
            metadata: { payloadDigest: `sha256:${"a".repeat(64)}` },
            createdAt: "2026-08-05T12:00:00.000Z",
          },
        ],
        attempts: [],
        manualRetry: { allowed: false, reason: "DELIVERY_ACTIVE" },
      }),
    ).toMatchObject({ payloadRedacted: { token: "[REDACTED]" } });
  });

  it("validates narrow manual retry outcomes", () => {
    expect(
      manualRetryResponseSchema.parse({
        accepted: true,
        eventId: event.id,
        attemptNumber: 4,
        status: "QUEUED",
      }),
    ).toMatchObject({ attemptNumber: 4 });
    expect(
      manualRetryErrorSchema.parse({
        error: "RETRY_NOT_ALLOWED",
        message: "Manual retry is unavailable.",
      }),
    ).toMatchObject({ error: "RETRY_NOT_ALLOWED" });
  });

  it("rejects unsafe event states and malformed attempt counts", () => {
    expect(
      eventListItemSchema.safeParse({ ...event, status: "ACCEPTED" }).success,
    ).toBe(false);
    expect(
      eventListItemSchema.safeParse({ ...event, attemptCount: -1 }).success,
    ).toBe(false);
  });

  it("validates event filters and safe attempt detail", () => {
    expect(
      eventFilterSchema.parse({
        status: "FAILED",
        endpointId: event.endpoint.id,
      }),
    ).toEqual({ status: "FAILED", endpointId: event.endpoint.id });
    expect(eventFilterSchema.safeParse({ status: "UNKNOWN" }).success).toBe(
      false,
    );
    expect(
      deliveryAttemptSchema.parse({
        id: "17bfabde-4c6c-4722-a3a2-6c9c9e77e49c",
        attemptNumber: 1,
        trigger: "AUTOMATIC",
        status: "TERMINAL_FAILURE",
        scheduledAt: "2026-08-06T04:00:00.000Z",
        startedAt: "2026-08-06T04:00:01.000Z",
        finishedAt: "2026-08-06T04:00:02.000Z",
        durationMilliseconds: 820,
        responseStatus: 400,
        errorCode: "HTTP_FAILURE",
        safeErrorMessage: "The destination did not accept the delivery.",
      }),
    ).toMatchObject({ status: "TERMINAL_FAILURE", responseStatus: 400 });
  });
});
