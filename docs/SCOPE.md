# Scope

## MVP goal

Deliver one complete, local-first workflow from signed webhook ingestion to an
inspectable destination attempt and safe manual retry.

## MVP capabilities

### Endpoint setup

- Create one inbound endpoint.
- Generate a signing secret once.
- Show the endpoint URL and a copyable cURL example.
- Rotate the signing secret without exposing its stored value.
- Enable or disable the endpoint.

### Destination setup

- Configure one HTTP destination URL.
- Configure an optional static authorization header stored encrypted.
- Enable or disable the destination.
- Provide a built-in local test destination for the public demo.

### Event ingestion

- Accept JSON payloads only.
- Verify an HMAC signature and timestamp.
- Reject stale signatures.
- Require an idempotency key.
- Enforce a payload size limit.
- Store a payload digest and a redacted payload representation.
- Return a stable event identifier.
- Return the existing event identifier for a repeated idempotency key with the
  same payload.
- Reject reuse of an idempotency key with a different payload.

### Asynchronous delivery

- Persist the event before queueing work.
- Process delivery outside the request lifecycle.
- Use bounded timeouts.
- Record request and response metadata with secret redaction.
- Classify retryable and terminal failures.
- Apply a small automatic retry policy with exponential backoff and jitter.
- Keep PostgreSQL as the authoritative execution record.

### Operations console

- Event list with status, endpoint, received time, and attempt count.
- Filters for status and endpoint.
- Event detail with payload summary and chronological timeline.
- Attempt detail with duration, response status, and safe error information.
- Manual retry for eligible terminal or exhausted failures.
- Clear disabled state explaining when retry is unsafe or unavailable.

### Public demonstration

- Deterministic fictional events.
- Built-in destination modes for success, timeout, and retryable failure.
- One-click reset restricted to the local or explicitly enabled demo
  environment.
- No real customer, credential, or payload data.

## MVP statuses

### Event

- `RECEIVED`
- `QUEUED`
- `PROCESSING`
- `DELIVERED`
- `FAILED`
- `DEAD_LETTER`

### Attempt

- `SCHEDULED`
- `RUNNING`
- `SUCCEEDED`
- `RETRYABLE_FAILURE`
- `TERMINAL_FAILURE`
- `TIMED_OUT`

## Explicit MVP exclusions

- Multi-tenancy and user accounts.
- Billing and subscriptions.
- Visual workflow builder.
- Multiple destinations per event.
- Arbitrary user-authored code.
- Scheduled or recurring workflows.
- Email, Slack, or SMS notifications.
- Third-party OAuth integrations.
- Kafka, Kubernetes, or infrastructure as code.
- AI classification or generation.
- Guaranteed production throughput or uptime claims.

## Post-MVP candidates

Candidates are not commitments. Each requires evidence that it adds portfolio
value without weakening the core product.

1. Human approval step before a sensitive destination action.
2. Structured AI extraction with schema validation and approval.
3. Multiple sequential workflow steps.
4. CLI for sending fixtures and inspecting events.
5. OpenAPI-generated TypeScript client.
6. Multi-tenant workspaces and role-based access.
7. OpenTelemetry export to an external collector.
