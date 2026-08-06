import { randomBytes } from "node:crypto";

import { createSecretCipher, createWebhookSignature } from "@afterhook/domain";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresRepository } from "./repository.js";
import { buildServer } from "../server.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL is required for PostgreSQL integration tests.",
  );
}

const client = postgres(databaseUrl);
const repository = createPostgresRepository(
  databaseUrl,
  createSecretCipher(randomBytes(32).toString("base64")),
);

beforeEach(async () => {
  await client.unsafe(
    'TRUNCATE TABLE "activity_events", "delivery_attempts", "events", "destinations", "endpoints"',
  );
});

afterAll(async () => {
  await repository.close();
  await client.end();
});

describe("setup repository", () => {
  it("persists encrypted material while returning only safe endpoint metadata", async () => {
    const created = await repository.createEndpoint({ name: "Billing events" });
    const rows = await client<
      { secret_encrypted: string; secret_fingerprint: string }[]
    >`
      SELECT secret_encrypted, secret_fingerprint FROM endpoints
    `;

    expect(created.signingSecret).toMatch(/^ahsec_/);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.secret_encrypted).not.toContain(created.signingSecret);
    expect(rows[0]?.secret_fingerprint).toBe(
      created.endpoint.secretFingerprint,
    );
    await expect(repository.listEndpoints()).resolves.toEqual([
      created.endpoint,
    ]);
  });

  it("encrypts destination authorization and omits it from every safe read", async () => {
    const created = await repository.createDestination({
      name: "Billing receiver",
      url: "https://example.test/billing",
      authorization: "Bearer private-value",
    });
    const rows = await client<{ authorization_encrypted: string | null }[]>`
      SELECT authorization_encrypted FROM destinations
    `;

    expect(rows[0]?.authorization_encrypted).not.toContain(
      "Bearer private-value",
    );
    expect(created).toMatchObject({ hasAuthorization: true });
    expect(JSON.stringify(await repository.listDestinations())).not.toContain(
      "private-value",
    );
  });

  it("decrypts signing material only for the internal ingestion lookup", async () => {
    const created = await repository.createEndpoint({ name: "Billing events" });

    await expect(
      repository.findIngestionEndpoint(created.endpoint.slug),
    ).resolves.toEqual({
      id: created.endpoint.id,
      enabled: true,
      signingSecret: created.signingSecret,
    });
    await expect(
      repository.findIngestionEndpoint("missing-endpoint"),
    ).resolves.toBeNull();
  });
});

describe("event persistence", () => {
  async function createEventInput() {
    const created = await repository.createEndpoint({ name: "Billing events" });
    await repository.createDestination({
      name: "Billing receiver",
      url: "https://example.test/billing",
    });
    return {
      endpointId: created.endpoint.id,
      idempotencyKey: "invoice-4200",
      payloadDigest: `sha256:${"a".repeat(64)}`,
      payloadRedacted: {
        event: "invoice.paid",
        token: "[REDACTED]",
      },
      receivedAt: new Date("2026-08-05T12:00:00.000Z"),
    };
  }

  it("commits one event and its initial activity", async () => {
    const input = await createEventInput();
    const result = await repository.persistEvent(input);
    const eventRows = await client<
      {
        id: string;
        status: string;
        payload_redacted: unknown;
        received_at: Date;
      }[]
    >`
      SELECT id, status, payload_redacted, received_at FROM events
    `;
    const activityRows = await client<
      { event_id: string; type: string; metadata: unknown; created_at: Date }[]
    >`
      SELECT event_id, type, metadata, created_at FROM activity_events
    `;

    expect(result).toEqual({ outcome: "created", eventId: eventRows[0]?.id });
    expect(eventRows[0]).toMatchObject({
      status: "RECEIVED",
      payload_redacted: input.payloadRedacted,
      received_at: input.receivedAt,
    });
    expect(activityRows).toEqual([
      expect.objectContaining({
        event_id: eventRows[0]?.id,
        type: "event.received",
        metadata: { payloadDigest: input.payloadDigest },
        created_at: input.receivedAt,
      }),
    ]);
  });

  it("returns one identity for concurrent equivalent requests", async () => {
    const input = await createEventInput();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repository.persistEvent(input)),
    );
    const eventRows = await client<{ id: string }[]>`SELECT id FROM events`;
    const activityRows = await client<
      { event_id: string }[]
    >`SELECT event_id FROM activity_events`;

    expect(eventRows).toHaveLength(1);
    expect(activityRows).toEqual([{ event_id: eventRows[0]?.id }]);
    expect(
      results.filter((result) => result.outcome === "created"),
    ).toHaveLength(1);
    expect(
      results.every(
        (result) =>
          result.outcome !== "conflict" && result.eventId === eventRows[0]?.id,
      ),
    ).toBe(true);
  });

  it("separates equivalent reuse from a conflicting payload", async () => {
    const input = await createEventInput();
    const created = await repository.persistEvent(input);

    await expect(repository.persistEvent(input)).resolves.toEqual({
      outcome: "existing",
      eventId: created.outcome === "conflict" ? "" : created.eventId,
    });
    await expect(
      repository.persistEvent({
        ...input,
        payloadDigest: `sha256:${"b".repeat(64)}`,
      }),
    ).resolves.toEqual({ outcome: "conflict" });
  });

  it("rolls back the event when initial activity insertion fails", async () => {
    const input = await createEventInput();
    await client.unsafe(`
      CREATE FUNCTION reject_initial_activity() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced activity failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_initial_activity
      BEFORE INSERT ON activity_events
      FOR EACH ROW EXECUTE FUNCTION reject_initial_activity();
    `);

    try {
      await expect(repository.persistEvent(input)).rejects.toThrow();
      const rows = await client<{ count: number }[]>`
        SELECT count(*)::int AS count FROM events
      `;
      expect(rows).toEqual([{ count: 0 }]);
    } finally {
      await client.unsafe(`
        DROP TRIGGER reject_initial_activity ON activity_events;
        DROP FUNCTION reject_initial_activity();
      `);
    }
  });

  it("exposes stable HTTP duplicate and conflict outcomes", async () => {
    const created = await repository.createEndpoint({ name: "Billing events" });
    await repository.createDestination({
      name: "Billing receiver",
      url: "https://example.test/billing",
    });
    const timestamp = 1_785_945_600;
    const firstBody = '{"event":"invoice.paid","token":"private"}';
    const secondBody = '{"event":"invoice.failed"}';
    const app = buildServer(repository, {
      now: () => new Date(timestamp * 1000),
    });
    const headers = {
      "content-type": "application/json",
      "idempotency-key": "invoice-4200",
      "x-afterhook-timestamp": String(timestamp),
      "x-afterhook-signature": createWebhookSignature(
        created.signingSecret,
        timestamp,
        firstBody,
      ),
    };

    const first = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${created.endpoint.slug}/events`,
      headers,
      payload: firstBody,
    });
    const duplicate = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${created.endpoint.slug}/events`,
      headers,
      payload: firstBody,
    });
    const conflict = await app.inject({
      method: "POST",
      url: `/v1/endpoints/${created.endpoint.slug}/events`,
      headers: {
        ...headers,
        "x-afterhook-signature": createWebhookSignature(
          created.signingSecret,
          timestamp,
          secondBody,
        ),
      },
      payload: secondBody,
    });
    const rows = await client<
      { payload_redacted: { token: string } }[]
    >`SELECT payload_redacted FROM events`;

    expect(first.statusCode).toBe(202);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      eventId: first.json<{ eventId: string }>().eventId,
      duplicate: true,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: "IDEMPOTENCY_CONFLICT" });
    expect(rows).toEqual([
      { payload_redacted: { event: "invoice.paid", token: "[REDACTED]" } },
    ]);
    expect(`${first.body}${duplicate.body}${conflict.body}`).not.toContain(
      "private",
    );
  });

  it("returns newest-first list and chronological safe detail", async () => {
    const input = await createEventInput();
    const first = await repository.persistEvent(input);
    const second = await repository.persistEvent({
      ...input,
      idempotencyKey: "invoice-4201",
      payloadDigest: `sha256:${"b".repeat(64)}`,
      payloadRedacted: { event: "invoice.failed" },
      receivedAt: new Date("2026-08-05T12:01:00.000Z"),
    });

    const listed = await repository.listEvents();
    const firstId = first.outcome === "conflict" ? "" : first.eventId;
    const secondId = second.outcome === "conflict" ? "" : second.eventId;
    const detail = await repository.findEventDetail(firstId);

    expect(listed.map((event) => event.id)).toEqual([secondId, firstId]);
    expect(listed[0]).toMatchObject({
      endpoint: { name: "Billing events" },
      attemptCount: 0,
    });
    expect(detail).toMatchObject({
      id: firstId,
      payloadRedacted: { event: "invoice.paid", token: "[REDACTED]" },
      activities: [{ type: "event.received" }],
    });
    expect(JSON.stringify(detail)).not.toContain("secret_encrypted");
    await expect(
      repository.findEventDetail("39a92b9a-b6f5-4ea3-a06f-3f339669cbe2"),
    ).resolves.toBeNull();
  });
});
