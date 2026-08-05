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

## Redis and worker integration tests

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
