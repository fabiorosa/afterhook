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

## PostgreSQL integration tests

- same key and same digest returns the existing event;
- same key and different digest returns conflict;
- concurrent duplicate ingestion creates one event;
- event and first activity commit atomically;
- attempts increment without collisions;
- completed attempts cannot be rewritten;
- manual retry appends a new attempt;
- event filters remain stable under pagination.

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

## Static gates

- TypeScript strict typecheck.
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
