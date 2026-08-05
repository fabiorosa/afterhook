# Architecture decisions

## ADR-001: One product, three runtime processes

**Status:** proposed.

The MVP uses one repository and shared TypeScript contracts, but runs an API, a
worker, and a local destination as separate processes. This proves asynchronous
boundaries without creating independent services that require distributed
deployment.

## ADR-002: PostgreSQL remains authoritative

**Status:** proposed.

Redis and BullMQ coordinate delivery timing. PostgreSQL stores event identity,
attempt history, and visible state. Losing Redis must not erase operational
evidence.

## ADR-003: At-least-once delivery with idempotency

**Status:** proposed.

Exactly-once network delivery cannot be guaranteed across an HTTP boundary. The
product documents at-least-once behavior, uses stable event identifiers, and
makes every attempt visible.

## ADR-004: Single-workspace MVP

**Status:** proposed.

CaseLane already demonstrates multi-tenancy and authorization. The MVP omits
accounts and workspaces so this project can focus on ingestion, asynchronous
delivery, retries, and observability. Multi-tenancy requires a separate
post-MVP decision.

## ADR-005: AI is deferred

**Status:** accepted.

The first release proves reliable deterministic workflow execution. AI may
appear later only as one bounded step with structured output, evaluation, and
human approval. The project is not positioned as an AI agent product.

## ADR-006: Separate Fastify API and Vite React console

**Status:** accepted.

WOP-101 uses Fastify for the HTTP API and Vite with React for the operations
console. The API owns validation and secret-safe responses. The console remains
a separate client of that contract. This preserves the runtime boundary needed
by the later worker without introducing independent deployment units.

Drizzle defines the PostgreSQL schema and migrations, while the `postgres`
driver provides the database connection. Zod validates external input.
Node.js cryptography provides AES-256-GCM encryption, so secret storage does not
require an additional cryptography framework.

The console uses authored CSS and design tokens instead of a component
framework. This keeps the first interface small and makes its accessibility,
responsive behavior, and visual decisions explicit.

## ADR-007: Versioned AES-256-GCM secret envelopes

**Status:** accepted.

WOP-101 encrypts endpoint signing secrets and destination authorization values
with Node.js AES-256-GCM using a 32-byte key supplied through
`SECRET_ENCRYPTION_KEY`. The stored text is a versioned envelope containing the
random IV, authentication tag, and ciphertext. This permits authenticated
decryption without storing plaintext.

A separate truncated SHA-256 fingerprint is stored for the endpoint secret so
operators can distinguish a revealed secret without seeing it again. The
fingerprint is not accepted as a credential and is never used for signature
verification.

## ADR-008: Sign exact raw JSON bytes with a timestamp

**Status:** accepted.

WOP-102 signs `<unix-seconds>.<raw-json-body>` with HMAC SHA-256. The API keeps
the original JSON bytes for verification, compares signatures in constant
time, accepts only a five-minute timestamp window, and caps JSON bodies at
256 KiB.

Signing parsed or reserialized JSON would let whitespace and key-order changes
alter the authenticated representation. Raw bytes make the contract precise
and compatible with conventional webhook clients. Including the timestamp
limits replay exposure. Idempotency keys are validated in WOP-102, while their
transactional reservation and duplicate outcomes remain in WOP-103.

## ADR-009: Transactional event identity and initial evidence

**Status:** accepted.

WOP-103 uses the PostgreSQL unique boundary on
`(endpoint_id, idempotency_key)` as the concurrency authority. A transaction
inserts the `RECEIVED` event and its `event.received` activity together. If the
unique reservation already exists, the repository compares payload digests and
returns either the stable event identity or an idempotency conflict.

The authenticated raw body is used for the SHA-256 digest but is not persisted
in this slice. A recursively redacted JSON representation is stored for future
inspection. Destination association remains deferred until a ticket owns that
product decision.
