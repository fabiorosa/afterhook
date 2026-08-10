# Test strategy

## Principles

- Test the failure path as seriously as the successful path.
- Run integration tests against real PostgreSQL and Redis.
- Never allow integration tests to skip silently in CI.
- Time, randomness, HTTP, and queue behavior must be controllable in tests.
- Tests should prove contracts, not implementation formatting.

## Unit tests

- signature creation, verification, and timestamp tolerance;
- payload digest and idempotency outcomes;
- event and attempt transition matrices;
- retry classification and backoff bounds;
- manual retry eligibility;
- secret and payload redaction;
- destination URL and SSRF policy;
- safe error mapping.

WOP-101 adds deterministic coverage for Zod setup contracts, slug validation,
server-side secret generation, secret fingerprinting, AES-256-GCM round trips,
tamper rejection, and safe Fastify response shapes.

WOP-102 adds deterministic coverage for ingestion header contracts, exact-byte
payload digests, HMAC creation and verification, altered timestamp and body
rejection, malformed signature lengths, and inclusive replay-window bounds.

WOP-103 adds recursive credential-key redaction coverage and validates the
stable event identity plus duplicate receipt contract.

WOP-104 validates the safe event list and detail contracts, allowed status
values, chronological activity projection, and indistinguishable missing or
malformed event responses.

WOP-201 validates identifier-only delivery jobs, strict heartbeat records,
safe public health projections, persistence-before-queue ordering, temporary
queue failures, and same-key queue retry behavior.

WOP-202 validates URL credentials and protocols, public and private IP ranges,
local-only overrides, DNS pinning, authorization forwarding without result
leakage, success, timeout, redirect refusal, and bounded response discarding.
Integration coverage uses the real local Fastify destination and Undici stack.

## PostgreSQL integration tests

- same key and same digest returns the existing event;
- same key and different digest returns conflict;
- concurrent duplicate ingestion creates one event;
- event and first activity commit atomically;
- attempts increment without collisions;
- completed attempts cannot be rewritten;
- manual retry appends a new attempt;
- event filters remain stable under pagination.

WOP-101 runs a real PostgreSQL migration before its repository tests. Those
tests assert that endpoint secrets and destination authorization values are
stored encrypted and that list projections do not expose them.

WOP-103 proves new event plus initial activity commit, eight concurrent
equivalent ingestions resolving to one event, same-digest reuse, different-
digest conflict, and transaction rollback when activity insertion fails. A
real Fastify and PostgreSQL test covers `202`, `200`, and `409` outcomes and
verifies that credential-shaped payload values never appear in responses or
stored redacted JSON.

WOP-104 proves newest-first list ordering, chronological activity ordering,
zero attempts before delivery exists, safe redacted detail, and missing-event
behavior against real PostgreSQL.

## Redis and worker integration tests

WOP-201 uses real Redis to prove that duplicate event handoffs create one
waiting BullMQ job containing only the event UUID. It also proves heartbeat
renewal, TTL bounds, and expiry after the publisher stops.

- persisted event becomes a queued job;
- worker records start before delivery;
- success commits attempt and event state;
- retryable failure schedules bounded retry;
- terminal failure does not retry automatically;
- timeout aborts the request;
- duplicate queue delivery does not create concurrent duplicate attempts;
- worker restart recovers eligible work without losing history.

## HTTP contract tests

- valid signed JSON is accepted;
- invalid, missing, or stale signatures are rejected;
- oversized and non-JSON requests are rejected;
- idempotency conflict returns a stable safe error;
- response never exposes secrets or internal stack traces.

WOP-102 exercises valid signed ingestion plus missing headers, malformed JSON,
non-object JSON, wrong media type, stale timestamps, altered raw bytes, unknown
and disabled endpoints, and payloads above 256 KiB. Repository integration
coverage proves the encrypted signing secret is decrypted only through the
narrow internal ingestion lookup.

## Browser tests

One Playwright MVP walkthrough:

1. create an endpoint and destination;
2. copy the generated cURL request;
3. send a deterministic event;
4. observe processing and failure;
5. inspect the attempt timeline;
6. trigger manual retry;
7. observe successful completion.

Repeat the critical inspection and retry path with keyboard navigation and a
mobile viewport.

WOP-101 adds a Chromium setup journey: create endpoint, copy and dismiss the
one-time secret, create a destination with authorization, and confirm the
console only communicates encrypted authorization metadata.

WOP-104 adds Chromium coverage for event list and redacted detail, received
versus delivered language, loading, empty, error and retry states, keyboard row
navigation, and a 390 px viewport without horizontal overflow.

WOP-203 adds encrypted raw-payload storage, transactional attempt claim,
conditional completion, append-only enforcement, duplicate claim rejection,
and safe success and failure integration coverage. Its browser journey uses a
real BullMQ worker and local Fastify destination, waits for PostgreSQL to report
`DELIVERED`, and verifies the three-step timeline on desktop and at 390 px
without exposing payload or authorization values.

WOP-204 adds deterministic classification, jitter and `Retry-After` bounds;
real PostgreSQL coverage for two scheduled retries, terminal failure, and
dead-letter exhaustion; BullMQ coverage for idempotent delayed jobs; and worker
reconciliation coverage for lost queue state. Chromium proves both recovery on
the third attempt and dead-letter after three retryable failures.

WOP-205 adds strict manual retry contracts and domain eligibility coverage.
Real PostgreSQL tests issue eight concurrent recovery requests and prove one
`MANUAL` attempt is reserved, enforce the cooldown, and retain append-only
history. Worker coverage claims the reserved attempt and proves its failure
does not schedule automatic work. BullMQ coverage verifies one identifier-only
manual job. Chromium reaches dead-letter after three failures, performs a
keyboard manual retry that succeeds on attempt four, and rechecks the recovered
detail at 390 px without exposing credentials.

WOP-301 validates strict combined status and endpoint filters plus safe ordered
attempt projections. PostgreSQL coverage proves filtering before presentation
and reads append-only attempt evidence. Unit coverage verifies deterministic
event and attempt diagnostics and proves extra payload, authorization, header,
and body-shaped fields are ignored. Chromium combines and clears filters,
inspects attempt four, validates clipboard success and denial feedback, follows
manual recovery to its terminal result without reload, and repeats the detail
at 390 px without overflow or credential exposure.

WOP-302 validates strict scenario and empty reset contracts, disabled demo
mutations, identifier-only queue handoff, and safe responses. PostgreSQL
coverage maps all three scenarios to the local destination and proves an
idempotent reset removes only demo-owned events while preserving an ordinary
endpoint, destination, event, and attempt. Chromium launches a fictional event
and resets it by keyboard at 390 px without credential exposure or overflow.

WOP-303 reads the published OpenAPI document and asserts every public Fastify
route is present, including the guarded demo routes. Fresh-clone instructions
run the existing migration, quality, and process boundaries; security and
deployment documents state their limitations rather than claim a hosted state.

WOP-304 keeps one final Chromium walkthrough for the complete operator path.
It creates a deterministic failure, opens the event from the desktop list with
the keyboard, verifies that payload and delivery credentials are absent,
requests the safe manual recovery, waits for the fourth attempt to finish, and
rechecks the recovered detail at 390 px without horizontal overflow. The
walkthrough runs against the real local Fastify, PostgreSQL, Redis, BullMQ, and
destination processes. It is a verification gate only: public evidence,
deployment, and the `v0.1.0` release remain WOP-305 work.

## Static gates

- TypeScript strict typecheck.
- Clean generated build outputs before lint so workspace type resolution is
  verified from source in local and CI environments.
- Install the Playwright Chromium runtime explicitly on fresh CI runners.
- ESLint with no unexplained disable comments.
- Formatting check.
- Secret scan.
- Migration consistency from a fresh database.
- Production build for every application package.
- Dependency audit reviewed before releases.

## MVP release evidence

- fresh clone instructions verified;
- full test pipeline green in CI;
- public demo contains only fictional redacted data;
- one screenshot for event list;
- one screenshot for failed attempt detail;
- one short walkthrough from failure to safe retry;
- README claims match observable behavior.

WOP-305 makes evidence capture an explicit mode of the final Chromium
walkthrough. Set `AFTERHOOK_CAPTURE_RELEASE_EVIDENCE=true` and run the named
operator test to write the event list, failed attempt detail, and a video of
the failure-to-safe-retry journey. The local capture was made on 2026-08-10
against real PostgreSQL, Redis, BullMQ, Fastify, and Chromium processes.

The same date, the deployed Render commit was checked through its public URL:
12 consecutive `/health` and `/v1/demo` requests returned `200`; the fictional
retryable-failure scenario reached `DEAD_LETTER` after three attempts; and
`hosted-event-list.png` plus `hosted-failed-attempt-detail.png` were captured
from the public console. The walkthrough video remains labeled as local
real-process evidence rather than a claim about the hosted browser capture.
