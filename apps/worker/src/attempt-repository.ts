import type { DeliveryResult } from "@afterhook/delivery";
import type { SecretCipher } from "@afterhook/domain";
import postgres from "postgres";

export type ClaimedDelivery = Readonly<{
  attemptId: string;
  eventId: string;
  url: string;
  body: string;
  authorization?: string;
}>;

export type AttemptRepository = Readonly<{
  claim: (eventId: string) => Promise<ClaimedDelivery | null>;
  complete: (attemptId: string, result: DeliveryResult) => Promise<boolean>;
  close: () => Promise<void>;
}>;

type ClaimRow = Readonly<{
  event_id: string;
  destination_url: string;
  payload_encrypted: string;
  authorization_encrypted: string | null;
}>;

function completionFor(result: DeliveryResult) {
  if (result.outcome === "succeeded") {
    return {
      attemptStatus: "SUCCEEDED",
      eventStatus: "DELIVERED",
      activityType: "attempt.succeeded",
      errorCode: null,
      safeErrorMessage: null,
    } as const;
  }

  return {
    attemptStatus:
      result.outcome === "timed_out" ? "TIMED_OUT" : "TERMINAL_FAILURE",
    eventStatus: "FAILED",
    activityType: "attempt.failed",
    errorCode: result.outcome.toUpperCase(),
    safeErrorMessage:
      result.outcome === "timed_out"
        ? "The destination did not respond before the timeout."
        : "The destination did not accept the delivery.",
  } as const;
}

export function createAttemptRepository(
  databaseUrl: string,
  cipher: SecretCipher,
): AttemptRepository {
  const client = postgres(databaseUrl, { max: 3 });

  return {
    async claim(eventId) {
      return client.begin(async (transaction) => {
        const [event] = await transaction<ClaimRow[]>`
          SELECT
            e.id AS event_id,
            e.payload_encrypted,
            d.url AS destination_url,
            d.authorization_encrypted
          FROM events e
          INNER JOIN destinations d ON d.id = e.destination_id
          WHERE e.id = ${eventId}
            AND e.status = 'RECEIVED'
            AND e.payload_encrypted IS NOT NULL
            AND d.enabled = true
          FOR UPDATE OF e
        `;

        if (event === undefined) return null;

        const [attempt] = await transaction<{ id: string }[]>`
          INSERT INTO delivery_attempts (
            event_id, attempt_number, trigger, status, scheduled_at, started_at
          ) VALUES (${eventId}, 1, 'AUTOMATIC', 'RUNNING', NOW(), NOW())
          ON CONFLICT (event_id, attempt_number) DO NOTHING
          RETURNING id
        `;
        if (attempt === undefined) return null;

        await transaction`
          UPDATE events
          SET status = 'PROCESSING', updated_at = NOW()
          WHERE id = ${eventId}
        `;
        await transaction`
          INSERT INTO activity_events (event_id, attempt_id, type, metadata)
          VALUES (
            ${eventId}, ${attempt.id}, 'attempt.started',
            ${transaction.json({ attemptNumber: 1, trigger: "AUTOMATIC" })}
          )
        `;

        return {
          attemptId: attempt.id,
          eventId: event.event_id,
          url: event.destination_url,
          body: cipher.decrypt(event.payload_encrypted),
          ...(event.authorization_encrypted === null
            ? {}
            : {
                authorization: cipher.decrypt(event.authorization_encrypted),
              }),
        };
      });
    },
    async complete(attemptId, result) {
      const completion = completionFor(result);
      return client.begin(async (transaction) => {
        const [attempt] = await transaction<
          { event_id: string; attempt_number: number }[]
        >`
          UPDATE delivery_attempts
          SET
            status = ${completion.attemptStatus},
            finished_at = NOW(),
            duration_ms = ${result.durationMilliseconds},
            response_status = ${result.responseStatus},
            error_code = ${completion.errorCode},
            safe_error_message = ${completion.safeErrorMessage}
          WHERE id = ${attemptId} AND status = 'RUNNING'
          RETURNING event_id, attempt_number
        `;
        if (attempt === undefined) return false;

        await transaction`
          UPDATE events
          SET
            status = ${completion.eventStatus},
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${attempt.event_id} AND status = 'PROCESSING'
        `;
        await transaction`
          INSERT INTO activity_events (event_id, attempt_id, type, metadata)
          VALUES (
            ${attempt.event_id}, ${attemptId}, ${completion.activityType},
            ${transaction.json({
              attemptNumber: attempt.attempt_number,
              durationMilliseconds: result.durationMilliseconds,
              outcome: result.outcome,
              responseStatus: result.responseStatus,
            })}
          )
        `;
        return true;
      });
    },
    close: () => client.end(),
  };
}
