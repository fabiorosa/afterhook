# Session state

Updated: 2026-08-10.

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
- WOP-203 was merged through PR #16. Main Quality run `31067599325` passed.
- WOP-204 classifies transient failures, persists `next_attempt_at`, schedules
  at most three automatic attempts, and records dead-letter exhaustion.
- The worker reconciles PostgreSQL retry schedules into idempotent BullMQ jobs
  on startup and every five seconds, so Redis remains coordination only.
- Exponential backoff starts at one second with bounded 20 percent jitter.
  Calculated delay and safe `Retry-After` handling are capped at 30 seconds.
- Local Quality passes with 40 unit and HTTP tests, 18 integrations, and 8
  Chromium scenarios for WOP-204.
- WOP-204 was merged through PR #18. Main Quality run `31068900346` passed.
- WOP-205 reserves one `MANUAL` attempt in PostgreSQL before queue handoff.
  Only failed or dead-letter events are eligible, concurrent requests resolve
  to one reservation, and repeated requests have a five-second cooldown.
- The worker claims the persisted scheduled attempt without replacing it.
  Manual failure returns to `FAILED` without restarting automatic retries.
- Event detail exposes server-owned retry eligibility, honest disabled and
  submitting states, safe feedback, and a manual recovery timeline entry.
- Local Quality passes with 44 unit and HTTP tests, 22 integrations, and 9
  Chromium scenarios for WOP-205.
- WOP-205 was merged through PR #20. Main Quality run `31071132657` passed.
- WOP-301 adds combinable status and endpoint filters validated at the API and
  applied by PostgreSQL while retaining newest-first ordering.
- Event detail exposes ordered safe attempt evidence without URLs, bodies,
  headers, payloads, authorization, or encrypted fields.
- Operators can copy deterministic event or attempt diagnostics with explicit
  clipboard success and failure feedback. Manual recovery remains visible from
  queueing through its terminal PostgreSQL state without a reload.
- Local Quality passes with 48 unit and HTTP tests, 22 integrations, and 10
  Chromium scenarios for WOP-301.
- WOP-301 was merged through PR #22. Main Quality run `31076175776` passed.
- WOP-302 adds explicitly enabled success, timeout, and retryable-failure demo
  scenarios with fixed fictional payloads and identifier-only queue handoff.
- Persisted demo ownership scopes reset independently of names and preserves
  ordinary endpoint, destination, event, and attempt history.
- The console adds restrained demo controls with honest pending, success,
  error, keyboard, and 390 px behavior.
- Local gates pass with 52 unit and HTTP tests, 24 integrations, and 11
  Chromium scenarios. On Windows, Playwright completes every assertion but its
  web-server teardown can outlive the command timeout; GitHub CI remains the
  terminal browser-process gate.
- WOP-302 was merged through PR #24. Main Quality is pending for merge
  `54c6614`.
- WOP-303 adds a route-complete OpenAPI 3.1 contract, clone-clean setup,
  security reporting boundary, and pre-deployment runbook without claiming a
  hosted environment.
- WOP-304 names the final real-process Chromium journey: an operator opens a
  dead-letter event from the desktop list by keyboard, confirms private payload
  and delivery values remain absent, safely requests recovery, and rechecks the
  fourth delivered attempt at 390 px without horizontal overflow.
- WOP-304 was merged through PR #28. Main Quality run `31419392270` passed for
  merge `ec9627d`.
- WOP-305 issue #29 and branch `agent/public-demo-release` are active.
- The release Docker image builds successfully and selects isolated API,
  worker, or destination process roles. Runtime dependency audit reports zero
  vulnerabilities after upgrading `@fastify/static` to `10.1.3`.
- The final real-process Chromium walkthrough passed in 6.6 seconds and wrote
  the event list, failed-attempt detail, and failure-to-safe-retry video under
  `docs/evidence`.
- The zero-cost co-located image was exercised as a real container: migrations
  passed, all three processes started, health reported a live worker, the
  console returned `200`, and a fictional event reached `DELIVERED`.

## In progress

WOP-305 is active on `agent/public-demo-release` for GitHub issue #29 and draft
PR #30. The paid Railway path was rejected as unsuitable for a portfolio demo.
The replacement zero-cost topology is Render web + Key Value with Neon
PostgreSQL.

## Pending work

1. Connect the repository Blueprint to a free Render account and provide a free
   Neon pooled `DATABASE_URL` through the secret prompt.
2. Verify the co-located three-process demo topology from the reviewed image.
3. Recapture evidence from the hosted commit, add the public URL, complete the
   PR checks, merge, and publish `v0.1.0`.

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
- WOP-204 permits exactly three automatic attempts and leaves manual recovery
  to WOP-205.
- WOP-205 persists a scheduled manual attempt before Redis coordination and
  never grants that attempt another automatic retry budget.
- WOP-301 builds clipboard diagnostics only from an explicit safe attempt
  projection and keeps filtering server-authoritative.
- WOP-302 requires explicit demo enablement and uses persisted ownership as the
  only reset authority.
- WOP-303 publishes only safe public contract fields and documents deployment
  requirements without selecting or claiming a hosted platform.
- WOP-304 proves the existing operator journey through the real local processes
  without adding product capability, publishing evidence, or deploying.
- WOP-305 uses one Docker image with separate Node.js processes co-located on a
  free Render web instance. Only the API port is public. Neon PostgreSQL remains
  authoritative and Render Key Value remains disposable coordination.

## Dead ends

- Drizzle migration generation requires `DATABASE_URL` even though generation
  does not use product data. Use the documented local PostgreSQL URL.
- PostgreSQL driver errors wrap trigger messages. The rollback regression test
  asserts rejection and committed state instead of private driver wording.
- PowerShell may block `npm.ps1`. Use `npm.cmd` for local checks.
- Vercel functions are time-bounded and cannot host the persistent BullMQ
  worker. Render's free sleep and cold-start limits must remain visible.

## Open questions

Render and Neon account authorization may require Fabio to complete provider
login if no authenticated session exists.

## Next step

Connect the free Render Blueprint and Neon database, then verify the hosted
journey.

## Pending validation

Full local Quality, draft PR Quality, hosted deployment verification, hosted
evidence recapture, merge Quality, and the `v0.1.0` release remain pending.

## Continuation prompt

```text
Continue WOP-305 from issue #29 and branch agent/public-demo-release. The code,
image and local browser evidence are prepared. Use the zero-cost Render web +
Key Value and Neon PostgreSQL topology. Deploy, verify fictional redacted data,
recapture hosted evidence, complete the PR, merge, and publish v0.1.0.
```
