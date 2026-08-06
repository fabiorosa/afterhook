# AfterHook

AfterHook is an open-source webhook operations system. It starts by giving
software teams a safe way to configure an inbound endpoint and an HTTP
destination before ingestion, delivery, and retry behavior are introduced.

Repository and npm name: `afterhook`.

## Current stage

WOP-201 is complete. A local operator can create and list secret-safe endpoints
and destinations, then send a bounded JSON object signed with the endpoint
secret. The API verifies the timestamp and exact raw body, rejects replayed or
altered requests, and atomically persists one authoritative event with its
initial activity. Equivalent retries return the stable event ID. Reusing the
same key with a different payload returns a safe conflict. The console now
lists received events and opens a redacted detail with the chronological
activity that proves receipt without implying destination delivery.
Persisted events cross an idempotent BullMQ boundary as identifier-only jobs.
The worker publishes an expiring Redis heartbeat, and `/health` exposes only
safe worker availability and the last observed timestamp.

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
npm --workspace @afterhook/api run db:migrate
npm run build
npm run quality
```

In separate terminals with the same `DATABASE_URL`, `REDIS_URL`, and
`SECRET_ENCRYPTION_KEY`, start the worker, API, and console:

```powershell
npm --workspace @afterhook/worker run start
node apps/api/dist/index.js
npm --workspace @afterhook/console run dev
```

Open `http://127.0.0.1:5173`. The quality command runs formatting, lint,
strict TypeScript, unit tests, a fresh PostgreSQL migration and integration
tests, a Chromium setup journey, and production builds. It requires the local
PostgreSQL and Redis containers to be running.

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
are authenticated but are not stored by this slice.

## First release

The MVP will eventually prove one complete journey:

1. create an endpoint and destination;
2. send a signed webhook;
3. reject invalid or duplicate input safely;
4. process the event in a background worker;
5. inspect the delivery timeline;
6. retry a failed delivery without creating uncontrolled duplicates.

Read the [product brief](docs/PRODUCT.md), [MVP scope](docs/SCOPE.md), and
[executable backlog](docs/BACKLOG.md).
