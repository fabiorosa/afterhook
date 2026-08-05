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
- Unit, HTTP contract, real PostgreSQL concurrency, conflict, atomic rollback,
  redaction, lint, typecheck, migration, build, and browser gates pass.

## In progress

WOP-103 is on `agent/event-persistence` for pull request review.

## Pending work

1. Review and merge WOP-103 after terminal GitHub checks.
2. Open WOP-104 separately to show received events and their initial timeline.

## Decisions

- PostgreSQL owns idempotency through a composite unique index.
- Event and first activity commit in one transaction.
- Equivalent duplicates do not append activity.
- Raw payload storage, destination association, delivery, Redis, BullMQ,
  retries, accounts, event UI, and deployment remain outside WOP-103.

## Dead ends

- Drizzle migration generation requires `DATABASE_URL` even though generation
  does not use product data. Use the documented local PostgreSQL URL.
- PostgreSQL driver errors wrap trigger messages. The rollback regression test
  asserts rejection and committed state instead of private driver wording.
- PowerShell may block `npm.ps1`. Use `npm.cmd` for local checks.

## Open questions

None for WOP-103.

## Next step

Review WOP-103 as one persistence slice. Do not begin WOP-104 before its merge
gate passes.

## Pending validation

Push and pull-request Quality checks must reach a terminal green state.

## Continuation prompt

```text
Review and merge WOP-103 only after terminal GitHub checks. Then begin WOP-104
as a separate issue and branch to show the received event list, detail, and
initial timeline. Do not add delivery, queues, retries, accounts, or deploy.
```
