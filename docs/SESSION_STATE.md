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
- Unit, HTTP contract, real PostgreSQL concurrency, conflict, atomic rollback,
  redaction, lint, typecheck, migration, build, and browser gates pass.

## In progress

WOP-104 is on `agent/event-inspection` for draft pull request review.

## Pending work

1. Review and merge WOP-104 after terminal GitHub checks.
2. Open the next delivery slice separately. Do not add it to WOP-104.

## Decisions

- PostgreSQL owns idempotency through a composite unique index.
- Event and first activity commit in one transaction.
- Equivalent duplicates do not append activity.
- Raw payload storage, destination association, delivery, Redis, BullMQ,
  retries, accounts, and deployment remain outside WOP-104.
- Event APIs return narrow Zod projections; malformed and missing IDs share one
  safe not-found response.
- The console uses hash routes until navigation needs justify a router.

## Dead ends

- Drizzle migration generation requires `DATABASE_URL` even though generation
  does not use product data. Use the documented local PostgreSQL URL.
- PostgreSQL driver errors wrap trigger messages. The rollback regression test
  asserts rejection and committed state instead of private driver wording.
- PowerShell may block `npm.ps1`. Use `npm.cmd` for local checks.

## Open questions

None for WOP-104.

## Next step

Review WOP-104 as one inspection slice. Do not begin delivery work before its
merge gate passes.

## Pending validation

Push and pull-request Quality checks must reach a terminal green state.

## Continuation prompt

```text
Review and merge WOP-104 only after terminal GitHub checks. Then select the next
delivery slice as a separate issue and branch. Do not add delivery, queues,
retries, accounts, or deploy to WOP-104.
```
