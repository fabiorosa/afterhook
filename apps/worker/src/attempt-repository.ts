import type { DeliveryResult } from "@afterhook/delivery";
import {
  calculateRetryDelayMilliseconds,
  classifyDeliveryFailure,
  maximumAutomaticAttempts,
  type SecretCipher,
} from "@afterhook/domain";
import postgres from "postgres";

export type ClaimedDelivery = Readonly<{
  attemptId: string;
  attemptNumber: number;
  eventId: string;
  url: string;
  body: string;
  authorization?: string;
}>;

export type RetrySchedule = Readonly<{
  eventId: string;
  attemptNumber: number;
  scheduledAt: Date;
}>;

export type CompletionOutcome =
  | Readonly<{ outcome: "complete" }>
  | Readonly<{ outcome: "retry_scheduled"; schedule: RetrySchedule }>;

export type AttemptRepository = Readonly<{
  claim: (eventId: string) => Promise<ClaimedDelivery | null>;
  complete: (
    attemptId: string,
    result: DeliveryResult,
  ) => Promise<CompletionOutcome | null>;
  listRetrySchedules: () => Promise<RetrySchedule[]>;
  close: () => Promise<void>;
}>;

type ClaimRow = Readonly<{
  event_id: string;
  destination_url: string;
  payload_encrypted: string;
  authorization_encrypted: string | null;
  attempt_number: number;
  scheduled_attempt_id: string | null;
  scheduled_trigger: "MANUAL" | null;
}>;

type RepositoryOptions = Readonly<{
  now?: () => Date;
  random?: () => number;
}>;

function failureDetails(result: DeliveryResult) {
  return {
    errorCode: result.outcome.toUpperCase(),
    safeErrorMessage:
      result.outcome === "timed_out"
        ? "The destination did not respond before the timeout."
        : "The destination did not accept the delivery.",
  };
}

export function createAttemptRepository(
  databaseUrl: string,
  cipher: SecretCipher,
  options: RepositoryOptions = {},
): AttemptRepository {
  const client = postgres(databaseUrl, { max: 3 });
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;

  return {
    async claim(eventId) {
      const claimedAt = now();
      return client.begin(async (transaction) => {
        const [event] = await transaction<ClaimRow[]>`
          SELECT
            e.id AS event_id,
            e.payload_encrypted,
            d.url AS destination_url,
            d.authorization_encrypted,
            (
              SELECT a.id
              FROM delivery_attempts a
              WHERE a.event_id = e.id AND a.status = 'SCHEDULED'
              ORDER BY a.attempt_number ASC
              LIMIT 1
            ) AS scheduled_attempt_id,
            (
              SELECT a.trigger
              FROM delivery_attempts a
              WHERE a.event_id = e.id AND a.status = 'SCHEDULED'
              ORDER BY a.attempt_number ASC
              LIMIT 1
            ) AS scheduled_trigger,
            (
              SELECT CASE
                WHEN MAX(a.attempt_number) FILTER (WHERE a.status = 'SCHEDULED') IS NOT NULL
                  THEN MAX(a.attempt_number) FILTER (WHERE a.status = 'SCHEDULED')
                ELSE COALESCE(MAX(a.attempt_number), 0) + 1
              END::integer
              FROM delivery_attempts a
              WHERE a.event_id = e.id
            ) AS attempt_number
          FROM events e
          INNER JOIN destinations d ON d.id = e.destination_id
          WHERE e.id = ${eventId}
            AND e.status IN ('RECEIVED', 'QUEUED')
            AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= ${claimedAt})
            AND e.payload_encrypted IS NOT NULL
            AND d.enabled = true
          FOR UPDATE OF e
        `;

        if (event === undefined) {
          return null;
        }
        if (
          event.scheduled_attempt_id === null &&
          event.attempt_number > maximumAutomaticAttempts
        )
          return null;

        const [attempt] =
          event.scheduled_attempt_id === null
            ? await transaction<{ id: string }[]>`
                INSERT INTO delivery_attempts (
                  event_id, attempt_number, trigger, status, scheduled_at, started_at
                ) VALUES (
                  ${eventId}, ${event.attempt_number}, 'AUTOMATIC', 'RUNNING',
                  ${claimedAt}, ${claimedAt}
                )
                ON CONFLICT (event_id, attempt_number) DO NOTHING
                RETURNING id
              `
            : await transaction<{ id: string }[]>`
                UPDATE delivery_attempts
                SET status = 'RUNNING', started_at = ${claimedAt}
                WHERE id = ${event.scheduled_attempt_id} AND status = 'SCHEDULED'
                RETURNING id
              `;
        if (attempt === undefined) return null;
        const trigger = event.scheduled_trigger ?? "AUTOMATIC";

        await transaction`
          UPDATE events
          SET status = 'PROCESSING', next_attempt_at = NULL, updated_at = ${claimedAt}
          WHERE id = ${eventId}
        `;
        await transaction`
          INSERT INTO activity_events (
            event_id, attempt_id, type, metadata, created_at
          ) VALUES (
            ${eventId}, ${attempt.id}, 'attempt.started',
            ${transaction.json({
              attemptNumber: event.attempt_number,
              trigger,
            })},
            ${claimedAt}
          )
        `;

        return {
          attemptId: attempt.id,
          attemptNumber: event.attempt_number,
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
      const requestedFinishedAt = now();
      return client.begin(async (transaction) => {
        const [running] = await transaction<
          {
            event_id: string;
            attempt_number: number;
            started_at: Date;
            trigger: "AUTOMATIC" | "MANUAL";
          }[]
        >`
          SELECT event_id, attempt_number, started_at, trigger
          FROM delivery_attempts
          WHERE id = ${attemptId} AND status = 'RUNNING'
          FOR UPDATE
        `;
        if (running === undefined) return null;
        const finishedAt = new Date(
          Math.max(
            requestedFinishedAt.getTime(),
            running.started_at.getTime() + 1,
          ),
        );

        if (result.outcome === "succeeded") {
          await transaction`
            UPDATE delivery_attempts
            SET
              status = 'SUCCEEDED', finished_at = ${finishedAt},
              duration_ms = ${result.durationMilliseconds},
              response_status = ${result.responseStatus}
            WHERE id = ${attemptId} AND status = 'RUNNING'
          `;
          await transaction`
            UPDATE events
            SET
              status = 'DELIVERED', completed_at = ${finishedAt},
              next_attempt_at = NULL, updated_at = ${finishedAt}
            WHERE id = ${running.event_id} AND status = 'PROCESSING'
          `;
          await transaction`
            INSERT INTO activity_events (
              event_id, attempt_id, type, metadata, created_at
            ) VALUES (
              ${running.event_id}, ${attemptId}, 'attempt.succeeded',
              ${transaction.json({
                attemptNumber: running.attempt_number,
                durationMilliseconds: result.durationMilliseconds,
                outcome: result.outcome,
                responseStatus: result.responseStatus,
              })},
              ${new Date(finishedAt.getTime() + 1)}
            )
          `;
          return { outcome: "complete" } as const;
        }

        const classification = classifyDeliveryFailure({
          outcome: result.outcome,
          responseStatus: result.responseStatus,
        });
        const canRetry =
          running.trigger === "AUTOMATIC" &&
          classification === "retryable" &&
          running.attempt_number < maximumAutomaticAttempts;
        const exhausted =
          running.trigger === "AUTOMATIC" &&
          classification === "retryable" &&
          running.attempt_number >= maximumAutomaticAttempts;
        const nextAttemptAt = canRetry
          ? new Date(
              finishedAt.getTime() +
                Math.max(
                  calculateRetryDelayMilliseconds(
                    running.attempt_number,
                    random(),
                  ),
                  result.retryAfterMilliseconds ?? 0,
                ),
            )
          : null;
        const failure = failureDetails(result);
        const attemptStatus =
          result.outcome === "timed_out"
            ? "TIMED_OUT"
            : classification === "retryable"
              ? "RETRYABLE_FAILURE"
              : "TERMINAL_FAILURE";
        const eventStatus = canRetry
          ? "QUEUED"
          : exhausted
            ? "DEAD_LETTER"
            : "FAILED";

        await transaction`
          UPDATE delivery_attempts
          SET
            status = ${attemptStatus}, finished_at = ${finishedAt},
            duration_ms = ${result.durationMilliseconds},
            response_status = ${result.responseStatus},
            error_code = ${failure.errorCode},
            safe_error_message = ${failure.safeErrorMessage}
          WHERE id = ${attemptId} AND status = 'RUNNING'
        `;
        await transaction`
          UPDATE events
          SET
            status = ${eventStatus},
            completed_at = ${canRetry ? null : finishedAt},
            next_attempt_at = ${nextAttemptAt},
            updated_at = ${finishedAt}
          WHERE id = ${running.event_id} AND status = 'PROCESSING'
        `;
        await transaction`
          INSERT INTO activity_events (
            event_id, attempt_id, type, metadata, created_at
          ) VALUES (
            ${running.event_id}, ${attemptId}, 'attempt.failed',
            ${transaction.json({
              attemptNumber: running.attempt_number,
              classification,
              durationMilliseconds: result.durationMilliseconds,
              outcome: result.outcome,
              responseStatus: result.responseStatus,
            })},
            ${finishedAt}
          )
        `;

        if (nextAttemptAt !== null) {
          const schedule = {
            eventId: running.event_id,
            attemptNumber: running.attempt_number + 1,
            scheduledAt: nextAttemptAt,
          };
          await transaction`
            INSERT INTO activity_events (
              event_id, attempt_id, type, metadata, created_at
            ) VALUES (
              ${running.event_id}, ${attemptId}, 'retry.scheduled',
              ${transaction.json({
                attemptNumber: schedule.attemptNumber,
                scheduledAt: schedule.scheduledAt.toISOString(),
              })},
              ${new Date(finishedAt.getTime() + 1)}
            )
          `;
          return { outcome: "retry_scheduled", schedule } as const;
        }

        if (exhausted) {
          await transaction`
            INSERT INTO activity_events (
              event_id, attempt_id, type, metadata, created_at
            ) VALUES (
              ${running.event_id}, ${attemptId}, 'event.dead_lettered',
              ${transaction.json({
                attempts: running.attempt_number,
                reason: "RETRY_BUDGET_EXHAUSTED",
              })},
              ${new Date(finishedAt.getTime() + 1)}
            )
          `;
        }
        return { outcome: "complete" } as const;
      });
    },
    async listRetrySchedules() {
      const rows = await client<
        { event_id: string; attempt_number: number; next_attempt_at: Date }[]
      >`
        SELECT
          e.id AS event_id,
          COALESCE(
            MAX(a.attempt_number) FILTER (WHERE a.status = 'SCHEDULED'),
            MAX(a.attempt_number) + 1,
            1
          )::integer AS attempt_number,
          e.next_attempt_at
        FROM events e
        LEFT JOIN delivery_attempts a ON a.event_id = e.id
        WHERE e.status = 'QUEUED' AND e.next_attempt_at IS NOT NULL
        GROUP BY e.id
        ORDER BY e.next_attempt_at ASC
        LIMIT 100
      `;
      return rows.map((row) => ({
        eventId: row.event_id,
        attemptNumber: row.attempt_number,
        scheduledAt: row.next_attempt_at,
      }));
    },
    close: () => client.end(),
  };
}
