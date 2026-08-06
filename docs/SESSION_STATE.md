# Session state

Updated: 2026-08-05.

## Completed and validated

- WOP-001 selected and verified the AfterHook name.
- WOP-002 published the product foundation at
  `https://github.com/fabiorosa/afterhook`.
- WOP-003 established the strict TypeScript workspace and CI.
- WOP-101 created secret-safe endpoint and destination setup through
  PostgreSQL, Fastify, and the React console.
- WOP-102 created the signed JSON ingestion boundary with exact raw-byte HMAC,
  a five-minute timestamp window, a 256 KiB limit, and safe endpoint lookup.
- WOP-103 adds PostgreSQL `events` and `activity_events` records. New ingestion
  atomically commits one `RECEIVED` event and one `event.received` activity.
- The `(endpoint_id, idempotency_key)` unique boundary resolves concurrent
  equivalent requests to one stable event. Same-digest reuse returns that event
  and different-digest reuse returns a safe `409` conflict.
- Stored JSON recursively redacts authorization, cookie, password, secret,
  token, API key, client secret, access token, and refresh token keys. The raw
  payload is authenticated and digested but not persisted by WOP-103.
- WOP-104 adds safe newest-first event list and redacted event detail API
  projections, with chronological activity and indistinguishable not-found
  responses.
- The React console has addressable Events and Setup views. Event inspection
  explains that receipt is durable evidence, not destination delivery, and
  covers loading, empty, error, retry, keyboard, desktop, and 390 px states.
- WOP-104 was merged through PR #10. Main Quality run `31058043837` passed.
- WOP-201 adds Redis and BullMQ with strict `{ eventId }` jobs keyed by the
  stable event UUID. PostgreSQL persistence happens before queue handoff.
- Queue failure preserves the event and returns a safe temporary response. An
  equivalent retry can enqueue the same job without duplicating the event.
- The worker publishes an expiring heartbeat. `/health` exposes only healthy or
  unavailable status plus the last observed timestamp.
- Unit, HTTP contract, real PostgreSQL concurrency, conflict, atomic rollback,
  redaction, lint, typecheck, migration, build, and browser gates pass.

## In progress

WOP-201 is on `agent/queue-handoff` for draft pull request review.

## Pending work

1. Review and merge WOP-201 after terminal GitHub checks.
2. Open WOP-202 separately for destination assignment, SSRF boundaries, and
   bounded HTTP delivery.

## Decisions

- PostgreSQL owns idempotency through a composite unique index.
- Event and first activity commit in one transaction.
- Equivalent duplicates do not append activity.
- Raw payload storage, destination association, delivery, Redis, BullMQ,
  retries, accounts, and deployment remain outside WOP-104.
- Event APIs return narrow Zod projections; malformed and missing IDs share one
  safe not-found response.
- The console uses hash routes until navigation needs justify a router.
- BullMQ job data contains only the event UUID and uses it as the job ID.
- The WOP-201 worker publishes heartbeat only. It does not consume delivery
  jobs or transition event state.

## Dead ends

- Drizzle migration generation requires `DATABASE_URL` even though generation
  does not use product data. Use the documented local PostgreSQL URL.
- PostgreSQL driver errors wrap trigger messages. The rollback regression test
  asserts rejection and committed state instead of private driver wording.
- PowerShell may block `npm.ps1`. Use `npm.cmd` for local checks.

## Open questions

None for WOP-201.

## Next step

Review WOP-201 as one queue handoff slice. Do not begin WOP-202 before its merge
gate passes.

## Pending validation

Push and pull-request Quality checks must reach a terminal green state.

## Continuation prompt

```text
Review and merge WOP-201 only after terminal GitHub checks. Then open WOP-202 as
a separate issue and branch for bounded HTTP delivery. Do not add attempts,
retry policy, dead-letter behavior, accounts, or deploy to WOP-201.
```
