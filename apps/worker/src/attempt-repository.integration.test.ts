import { randomBytes } from "node:crypto";

import { createSecretCipher } from "@afterhook/domain";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createAttemptRepository } from "./attempt-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("A PostgreSQL URL is required for worker integration tests.");
}

const client = postgres(databaseUrl);
const cipher = createSecretCipher(randomBytes(32).toString("base64"));
let currentTime = new Date("2026-08-05T20:01:00.000Z");
const attempts = createAttemptRepository(databaseUrl, cipher, {
  now: () => currentTime,
  random: () => 0.5,
});

beforeEach(async () => {
  currentTime = new Date("2026-08-05T20:01:00.000Z");
  await client.unsafe(
    'TRUNCATE TABLE "activity_events", "delivery_attempts", "events", "destinations", "endpoints"',
  );
});

afterAll(async () => {
  await attempts.close();
  await client.end();
});

async function persistDeliverableEvent() {
  const [endpoint] = await client<{ id: string }[]>`
    INSERT INTO endpoints (
      name, slug, secret_encrypted, secret_fingerprint, enabled
    ) VALUES (
      'Worker endpoint', 'worker-endpoint', ${cipher.encrypt("signing-secret")},
      'sha256:0123456789abcdef', true
    ) RETURNING id
  `;
  const [destination] = await client<{ id: string }[]>`
    INSERT INTO destinations (name, url, authorization_encrypted, enabled)
    VALUES (
      'Worker destination', 'https://example.test/success',
      ${cipher.encrypt("Bearer private-worker-value")}, true
    ) RETURNING id
  `;
  if (endpoint === undefined || destination === undefined) {
    throw new Error("Fixture setup failed.");
  }
  const rawPayload = '{"event":"invoice.paid","token":"private-payload"}';
  const [event] = await client<{ id: string }[]>`
    INSERT INTO events (
      endpoint_id, destination_id, idempotency_key, payload_digest,
      payload_redacted, payload_encrypted, status, received_at
    ) VALUES (
      ${endpoint.id}, ${destination.id}, 'worker-attempt-1',
      ${`sha256:${"a".repeat(64)}`},
      ${client.json({ event: "invoice.paid", token: "[REDACTED]" })},
      ${cipher.encrypt(rawPayload)}, 'RECEIVED',
      '2026-08-05T20:00:00.000Z'
    ) RETURNING id
  `;
  if (event === undefined) throw new Error("Event fixture setup failed.");
  await client`
    INSERT INTO activity_events (event_id, type, metadata, created_at)
    VALUES (
      ${event.id}, 'event.received', ${client.json({ received: true })},
      '2026-08-05T20:00:00.000Z'
    )
  `;
  return { eventId: event.id, rawPayload };
}

describe("delivery attempt repository", () => {
  it("claims before delivery and completes one append-only success", async () => {
    const event = await persistDeliverableEvent();
    const claimed = await attempts.claim(event.eventId);

    expect(claimed).toMatchObject({
      eventId: event.eventId,
      body: event.rawPayload,
      authorization: "Bearer private-worker-value",
    });
    await expect(attempts.claim(event.eventId)).resolves.toBeNull();
    if (claimed === null) throw new Error("Attempt was not claimed.");

    await expect(
      attempts.complete(claimed.attemptId, {
        outcome: "succeeded",
        responseStatus: 204,
        durationMilliseconds: 18,
      }),
    ).resolves.toEqual({ outcome: "complete" });
    await expect(
      attempts.complete(claimed.attemptId, {
        outcome: "succeeded",
        responseStatus: 204,
        durationMilliseconds: 19,
      }),
    ).resolves.toBeNull();

    const [stored] = await client<
      {
        event_status: string;
        attempt_status: string;
        duration_ms: number;
        response_status: number;
        activity_types: string[];
        payload_encrypted: string;
      }[]
    >`
      SELECT
        e.status AS event_status,
        e.payload_encrypted,
        a.status AS attempt_status,
        a.duration_ms,
        a.response_status,
        array_agg(x.type ORDER BY x.created_at) AS activity_types
      FROM events e
      INNER JOIN delivery_attempts a ON a.event_id = e.id
      INNER JOIN activity_events x ON x.event_id = e.id
      WHERE e.id = ${event.eventId}
      GROUP BY e.id, a.id
    `;
    expect(stored).toMatchObject({
      event_status: "DELIVERED",
      attempt_status: "SUCCEEDED",
      duration_ms: 18,
      response_status: 204,
      activity_types: [
        "event.received",
        "attempt.started",
        "attempt.succeeded",
      ],
    });
    expect(stored?.payload_encrypted).not.toContain("private-payload");
    await expect(
      client`UPDATE delivery_attempts SET duration_ms = 99 WHERE id = ${claimed.attemptId}`,
    ).rejects.toThrow(/append-only/);
  });

  it("records a safe terminal HTTP failure without scheduling a retry", async () => {
    const event = await persistDeliverableEvent();
    const claimed = await attempts.claim(event.eventId);
    if (claimed === null) throw new Error("Attempt was not claimed.");

    await attempts.complete(claimed.attemptId, {
      outcome: "http_failure",
      responseStatus: 400,
      durationMilliseconds: 7,
    });

    const [stored] = await client<
      {
        event_status: string;
        attempt_status: string;
        error_code: string;
        safe_error_message: string;
      }[]
    >`
      SELECT
        e.status AS event_status,
        a.status AS attempt_status,
        a.error_code,
        a.safe_error_message
      FROM events e
      INNER JOIN delivery_attempts a ON a.event_id = e.id
      WHERE e.id = ${event.eventId}
    `;
    expect(stored).toEqual({
      event_status: "FAILED",
      attempt_status: "TERMINAL_FAILURE",
      error_code: "HTTP_FAILURE",
      safe_error_message: "The destination did not accept the delivery.",
    });
  });

  it("schedules two bounded retries then dead-letters the third failure", async () => {
    const event = await persistDeliverableEvent();

    for (const attemptNumber of [1, 2, 3]) {
      const claimed = await attempts.claim(event.eventId);
      expect(claimed?.attemptNumber).toBe(attemptNumber);
      if (claimed === null) throw new Error("Attempt was not claimed.");

      const completed = await attempts.complete(claimed.attemptId, {
        outcome: "http_failure",
        responseStatus: 503,
        durationMilliseconds: attemptNumber * 10,
        retryAfterMilliseconds: attemptNumber === 1 ? 1_500 : null,
      });

      if (attemptNumber < 3) {
        expect(completed).toEqual({
          outcome: "retry_scheduled",
          schedule: {
            eventId: event.eventId,
            attemptNumber: attemptNumber + 1,
            scheduledAt: new Date(
              currentTime.getTime() +
                1 +
                (attemptNumber === 1
                  ? 1_500
                  : 1_000 * 2 ** (attemptNumber - 1)),
            ),
          },
        });
        await expect(attempts.listRetrySchedules()).resolves.toEqual([
          completed?.outcome === "retry_scheduled"
            ? completed.schedule
            : undefined,
        ]);
        await expect(attempts.claim(event.eventId)).resolves.toBeNull();
        if (completed?.outcome === "retry_scheduled") {
          currentTime = completed.schedule.scheduledAt;
        }
      } else {
        expect(completed).toEqual({ outcome: "complete" });
      }
    }

    const [stored] = await client<
      {
        status: string;
        attempt_count: number;
        next_attempt_at: Date | null;
      }[]
    >`
      SELECT
        e.status,
        e.next_attempt_at,
        COUNT(a.id)::integer AS attempt_count
      FROM events e
      INNER JOIN delivery_attempts a ON a.event_id = e.id
      WHERE e.id = ${event.eventId}
      GROUP BY e.id
    `;
    const activityTypes = await client<{ type: string }[]>`
      SELECT type
      FROM activity_events
      WHERE event_id = ${event.eventId}
      ORDER BY created_at, id
    `;
    expect(stored).toMatchObject({
      status: "DEAD_LETTER",
      attempt_count: 3,
      next_attempt_at: null,
    });
    expect(activityTypes.map(({ type }) => type)).toEqual([
      "event.received",
      "attempt.started",
      "attempt.failed",
      "retry.scheduled",
      "attempt.started",
      "attempt.failed",
      "retry.scheduled",
      "attempt.started",
      "attempt.failed",
      "event.dead_lettered",
    ]);
  });

  it("runs a reserved manual attempt without restarting automatic retries", async () => {
    const event = await persistDeliverableEvent();
    await client`
      UPDATE events
      SET status = 'QUEUED', next_attempt_at = ${currentTime}
      WHERE id = ${event.eventId}
    `;
    const [reserved] = await client<{ id: string }[]>`
      INSERT INTO delivery_attempts (
        event_id, attempt_number, trigger, status, scheduled_at
      ) VALUES (${event.eventId}, 4, 'MANUAL', 'SCHEDULED', ${currentTime})
      RETURNING id
    `;
    if (reserved === undefined)
      throw new Error("Manual attempt was not reserved.");

    await expect(attempts.listRetrySchedules()).resolves.toEqual([
      { eventId: event.eventId, attemptNumber: 4, scheduledAt: currentTime },
    ]);
    const claimed = await attempts.claim(event.eventId);
    expect(claimed).toMatchObject({
      attemptId: reserved.id,
      attemptNumber: 4,
      eventId: event.eventId,
    });
    if (claimed === null) throw new Error("Manual attempt was not claimed.");
    currentTime = new Date(currentTime.getTime() + 100);
    await expect(
      attempts.complete(claimed.attemptId, {
        outcome: "http_failure",
        responseStatus: 503,
        durationMilliseconds: 100,
        retryAfterMilliseconds: 1_000,
      }),
    ).resolves.toEqual({ outcome: "complete" });

    const [stored] = await client<
      { event_status: string; attempt_status: string; trigger: string }[]
    >`
      SELECT
        e.status AS event_status,
        a.status AS attempt_status,
        a.trigger
      FROM events e
      INNER JOIN delivery_attempts a ON a.event_id = e.id
      WHERE a.id = ${reserved.id}
    `;
    expect(stored).toEqual({
      event_status: "FAILED",
      attempt_status: "RETRYABLE_FAILURE",
      trigger: "MANUAL",
    });
    await expect(attempts.listRetrySchedules()).resolves.toEqual([]);
  });
});
