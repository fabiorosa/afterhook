# AfterHook

AfterHook is an open-source webhook operations system. It starts by giving
software teams a safe way to configure an inbound endpoint and an HTTP
destination before ingestion, delivery, and retry behavior are introduced.

Repository and npm name: `afterhook`.

## Current stage

WOP-101 is complete: a local operator can create and list endpoints and
destinations through a Fastify API and React console. Endpoint signing secrets
are generated server-side, shown once, fingerprinted safely, and encrypted at
rest. Optional destination authorization is encrypted at rest and never
returned by the API or console.

## Local development

AfterHook requires Node.js 22 or later and npm.

```bash
npm ci
docker compose up -d postgres
```

Copy `.env.example` to `.env` for reference, then set its values in the shell
that starts the API. The application deliberately does not load secret files by
itself.

```powershell
$env:DATABASE_URL = "postgres://afterhook:afterhook@127.0.0.1:54329/afterhook"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:SECRET_ENCRYPTION_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npm --workspace @afterhook/api run db:migrate
npm run quality
```

In separate terminals with the same `DATABASE_URL` and
`SECRET_ENCRYPTION_KEY`, start the API and console:

```powershell
node apps/api/dist/index.js
npm --workspace @afterhook/console run dev
```

Open `http://127.0.0.1:5173`. The quality command runs formatting, lint,
strict TypeScript, unit tests, a fresh PostgreSQL migration and integration
tests, a Chromium setup journey, and production builds. It requires the local
PostgreSQL container to be running.

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
