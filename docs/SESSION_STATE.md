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
- WOP-201 was merged through PR #12. Main Quality run `31060557739` passed.
- WOP-202 adds an independent Undici delivery transport and deterministic local
  Fastify destination. DNS is validated and pinned, redirects are not followed,
  and timeouts plus response discarding are bounded.
- Delivery results expose only outcome, HTTP status when present, and duration.
  Authorization, response bodies, socket errors, and addresses remain private.
- WOP-202 was merged through PR #14. Main Quality run `31063106441` passed.
- WOP-203 stores exact authenticated JSON only in an AES-256-GCM envelope and
  associates new events with the newest enabled destination.
- The worker transactionally creates one `RUNNING` attempt and changes the
  event to `PROCESSING` before HTTP. It then conditionally commits one terminal
  result and safe activity.
- PostgreSQL rejects updates to completed attempts. Duplicate or stale queue
  jobs cannot create another attempt.
- Event list counts and detail timelines expose delivery start, success or
  failure, response status when present, and duration without secret values.
- Local Quality passes with 34 unit and HTTP tests, 16 integrations, and 6
  Chromium scenarios.
- Unit, HTTP contract, real PostgreSQL concurrency, conflict, atomic rollback,
  redaction, lint, typecheck, migration, build, and browser gates pass.

## In progress

WOP-203 is on `agent/delivery-attempts` in draft PR #16.

## Pending work

1. Review and merge WOP-203 after terminal GitHub checks.
2. Open WOP-204 separately for retry classification, bounded automatic
   backoff, and dead-letter state.

## Decisions

- PostgreSQL owns idempotency through a composite unique index.
- Event and first activity commit in one transaction.
- Equivalent duplicates do not append activity.
- Exact raw payload is encrypted only for internal delivery; public reads use
  the redacted copy.
- Event APIs return narrow Zod projections; malformed and missing IDs share one
  safe not-found response.
- The console uses hash routes until navigation needs justify a router.
- BullMQ job data contains only the event UUID and uses it as the job ID.
- The WOP-201 worker publishes heartbeat only. It does not consume delivery
  jobs or transition event state.
- WOP-202 does not consume BullMQ jobs. WOP-203 must persist an attempt before
  network I/O and complete it after the delivery result.
- WOP-203 records one terminal attempt and never schedules a retry. WOP-204
  owns classification, backoff, and dead-letter transitions.

## Dead ends

- Drizzle migration generation requires `DATABASE_URL` even though generation
  does not use product data. Use the documented local PostgreSQL URL.
- PostgreSQL driver errors wrap trigger messages. The rollback regression test
  asserts rejection and committed state instead of private driver wording.
- PowerShell may block `npm.ps1`. Use `npm.cmd` for local checks.

## Open questions

None for WOP-203.

## Next step

Review WOP-203 as one bounded execution slice. Do not begin WOP-204 before its
merge gate passes.

## Pending validation

Push and pull-request Quality checks must reach a terminal green state.

## Continuation prompt

```text
Review and merge WOP-203 only after terminal GitHub checks. Then open WOP-204 as
a separate issue and branch for retry classification and bounded recovery. Do
not add manual retry, accounts, multi-tenancy, or deploy to WOP-203.
```
