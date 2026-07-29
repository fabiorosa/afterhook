# Initial architecture

## Status

This architecture covers only the MVP. It is allowed to evolve through ADRs as
real implementation constraints appear.

## Proposed stack

- TypeScript strict across application packages.
- React for the operations console.
- Node.js for the HTTP API and background worker.
- PostgreSQL for product records, event state, attempts, and audit history.
- Redis plus BullMQ for delayed jobs, backoff, and worker coordination.
- Zod for runtime boundary validation.
- OpenAPI for the inbound HTTP contract.
- Vitest for unit and integration tests.
- Playwright for the critical browser journey.
- Docker Compose for PostgreSQL, Redis, API, worker, and local destination.

The React framework and HTTP framework remain open decisions until the first
implementation ticket. Choose the smallest tools that support the active slice.

## Runtime topology

```text
Webhook sender
    |
    v
HTTP API
    | verify signature, validate, enforce idempotency
    v
PostgreSQL event record
    |
    v
BullMQ job in Redis
    |
    v
Delivery worker
    | bounded HTTP request
    v
Destination
    |
    v
PostgreSQL attempt and event state
    |
    v
React operations console
```

## Mandatory boundaries

### Ingestion

Owns HTTP validation, signature verification, timestamp tolerance, payload
limits, idempotency lookup, and durable event creation. It does not deliver the
event.

WOP-102 implements the HTTP boundary through
`POST /v1/endpoints/:slug/events`. Fastify retains the exact
`application/json` bytes before parsing. HMAC SHA-256 covers
`<unix-seconds>.<raw-body>` and uses constant-time comparison. Requests are
limited to 256 KiB and a five-minute replay window. The route validates the
idempotency key and returns a digest receipt but deliberately does not reserve
the key or persist an event. WOP-103 owns those authoritative transactions.

### Orchestration

Owns queue scheduling, attempt allocation, retry policy, leases, and transition
rules. Queue messages contain identifiers, not authoritative payload state.

### Delivery

Owns the bounded HTTP call, destination authentication, response
classification, duration measurement, and safe metadata capture.

### Domain

Owns state machines, retry eligibility, idempotency outcomes, error codes, and
redaction rules. Domain functions do not import React, BullMQ, or database
drivers.

### Persistence

Owns tenant-independent MVP records and transactions. Repository functions do
not expose unrestricted query builders to presentation code.

### Presentation

Owns human-readable status, filtering, timelines, feedback, and recovery
actions. It does not infer delivery truth from queue state.

## Source-of-truth rules

- PostgreSQL is authoritative for event and attempt state.
- Redis may be deleted and rebuilt without losing event history.
- Queue completion alone never marks an event delivered.
- A destination response and the committed attempt transition determine the
  visible outcome.
- Attempt records are append-only after completion.
- Manual retry creates a new attempt linked to the same event.

## Idempotency contract

The inbound uniqueness boundary is `(endpoint_id, idempotency_key)`.

- Same key and same payload digest returns the existing event.
- Same key and different payload digest returns `409 Conflict`.
- Event creation and idempotency reservation occur in one transaction.
- Destination delivery includes the stable event ID as an idempotency header.
- The product does not claim exactly-once delivery. It provides at-least-once
  delivery with idempotency controls and observable attempts.

## Retry policy

Initial automatic policy:

- maximum 3 automatic attempts;
- exponential backoff with bounded jitter;
- timeout, connection failure, `408`, `425`, `429`, and `5xx` are retryable;
- most other `4xx` responses are terminal;
- `Retry-After` is honored within a documented maximum;
- manual retry is available only after no attempt is running or scheduled.

Exact durations are implementation constants covered by tests and documented
before the MVP release.

## Data model

### endpoints

- `id`
- `name`
- `slug`
- `secret_hash`
- `secret_encrypted`
- `enabled`
- `created_at`
- `updated_at`

WOP-101 implements this record with a generated UUID, generated unique slug,
AES-256-GCM `secret_encrypted` envelope, and a truncated SHA-256 fingerprint.
The response projection deliberately omits the encrypted material.

### destinations

- `id`
- `name`
- `url`
- `authorization_encrypted`
- `enabled`
- `created_at`
- `updated_at`

WOP-101 implements this record with an optional AES-256-GCM
`authorization_encrypted` envelope. Its response projection exposes only the
boolean `hasAuthorization`.

### events

- `id`
- `endpoint_id`
- `destination_id`
- `idempotency_key`
- `payload_digest`
- `payload_redacted`
- `status`
- `received_at`
- `completed_at`
- `created_at`
- `updated_at`

### delivery_attempts

- `id`
- `event_id`
- `attempt_number`
- `trigger`
- `status`
- `scheduled_at`
- `started_at`
- `finished_at`
- `duration_ms`
- `response_status`
- `error_code`
- `safe_error_message`
- `response_headers_redacted`

### activity_events

- `id`
- `event_id`
- `attempt_id`
- `type`
- `metadata`
- `created_at`

## Security baseline

- HMAC SHA-256 signatures with constant-time comparison.
- Timestamp replay window.
- Secrets encrypted at rest and redacted from logs.
- Secret values shown only at creation or rotation.
- Destination URL validation and SSRF protection.
- Private, loopback, link-local, and metadata-network destinations blocked
  outside explicit local development mode.
- Bounded payload, header, response, timeout, and redirect limits.
- No arbitrary HTML rendering from payloads.
- Structured logging with correlation IDs and secret-key redaction.
- Rate limits on ingestion and manual retry.

## Observability

The MVP must expose:

- structured logs for API and worker;
- correlation by event and attempt ID;
- delivery duration;
- queue-to-start delay;
- attempt result classification;
- health checks for API, PostgreSQL, Redis, and worker heartbeat.

OpenTelemetry export is deferred. Internal trace structure should allow it
later without rewriting the domain.
