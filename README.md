# AfterHook

AfterHook is an open-source webhook operations system for receiving,
inspecting, delivering, and safely recovering webhook-driven work.

Repository and npm name: `afterhook`.

## Current stage

The current local-first MVP supports signed JSON ingestion, PostgreSQL
idempotency, identifier-only BullMQ handoff, bounded HTTP delivery, append-only
attempt history, automatic retries, dead-letter handling, safe manual recovery,
and an operational React console. Explicitly enabled demo controls create only
fictional success, timeout, and retryable-failure scenarios and can reset only
their own persistently marked records.

The [public demo](https://afterhook.onrender.com) runs on zero-cost Render,
Render Key Value, and Neon tiers. It contains only fictional, redacted data.
The Render free service sleeps after inactivity, so its first request can take
about a minute. This is a portfolio demonstration, not an uptime claim.

## Product evidence

The final Chromium walkthrough runs against real local PostgreSQL, Redis,
BullMQ, Fastify, and destination processes. Payload credentials are redacted,
delivery authorization is absent, and manual recovery appends attempt four
without rewriting prior failures.

![AfterHook event list with fictional delivery states](docs/evidence/event-list.png)

![AfterHook failed attempt detail with redacted payload](docs/evidence/failed-attempt-detail.png)

[Watch the failure-to-safe-retry walkthrough](docs/evidence/failure-to-safe-retry.webm).

The deployed commit was also checked at the public URL. These captures show
the fictional event list and dead-letter detail as served by Render:

![Hosted AfterHook event list](docs/evidence/hosted-event-list.png)

![Hosted AfterHook dead-letter detail](docs/evidence/hosted-failed-attempt-detail.png)

## Local development

AfterHook requires Node.js 22 or later and npm.

```bash
npm ci
docker compose up -d postgres redis
```

Copy `.env.example` to `.env` for reference, then set its values in the shell
that starts the API. The application deliberately does not load secret files by
itself.

```powershell
$env:DATABASE_URL = "postgres://afterhook:afterhook@127.0.0.1:54329/afterhook"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:REDIS_URL = "redis://127.0.0.1:56379/0"
$env:TEST_REDIS_URL = "redis://127.0.0.1:56379/15"
$env:SECRET_ENCRYPTION_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
$env:AFTERHOOK_DEMO_ENABLED = "true"
$env:AFTERHOOK_DEMO_DESTINATION_ORIGIN = "http://127.0.0.1:3201"
npm --workspace @afterhook/api run db:migrate
npm run build
npm run quality
```

In separate terminals with the same `DATABASE_URL`, `REDIS_URL`, and
`SECRET_ENCRYPTION_KEY`, start the worker, API, and console:

```powershell
npm --workspace @afterhook/worker run start
node apps/api/dist/index.js
npm --workspace @afterhook/destination run start
npm --workspace @afterhook/console run dev
```

Open `http://127.0.0.1:5173`. The quality command runs formatting, lint,
strict TypeScript, unit tests, a fresh PostgreSQL migration and integration
tests, Chromium journeys, and production builds. It requires the local
PostgreSQL and Redis containers to be running. Use `npm.cmd` in PowerShell if
the machine blocks `npm.ps1`.

## Signed ingestion contract

Send JSON to `POST /v1/endpoints/:slug/events` with:

- `Content-Type: application/json`;
- `Idempotency-Key`: 1 to 128 letters, numbers, `.`, `_`, `:`, or `-`;
- `X-AfterHook-Timestamp`: the current Unix time in seconds;
- `X-AfterHook-Signature`: `sha256=<hex HMAC>`.

The HMAC SHA-256 input is the ASCII timestamp, one period, then the exact raw
JSON bytes:

```text
<timestamp>.<raw-json-body>
```

Requests must be within five minutes of the API clock and no larger than
262,144 bytes. A new request returns `202 Accepted` with the stable event ID,
endpoint ID, idempotency key, SHA-256 payload digest, and `duplicate: false`.
The same key and digest return the same event with `200 OK` and
`duplicate: true`. The same key with another digest returns `409 Conflict`.
Stored payloads redact common credential keys recursively. Raw payload bytes
are encrypted only for delivery and are never returned by inspection APIs.

## API and operations

The versioned draft [OpenAPI contract](docs/openapi.yaml) covers every public
route and safe response shape. Read [SECURITY.md](SECURITY.md) before reporting
a vulnerability and the [deployment runbook](docs/DEPLOYMENT.md) for the
documented public-demo topology and its limits.

## First release

The `v0.1.0` MVP proves one complete local journey:

1. create an endpoint and destination;
2. send a signed webhook;
3. reject invalid or duplicate input safely;
4. process the event in a background worker;
5. inspect the delivery timeline;
6. retry a failed delivery without creating uncontrolled duplicates.

Read the [product brief](docs/PRODUCT.md), [MVP scope](docs/SCOPE.md), and
[executable backlog](docs/BACKLOG.md).
