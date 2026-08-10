# Deployment runbook

## Status and scope

WOP-305 selects a zero-cost portfolio topology. The deployment is not live
until the Render Blueprint is connected and a Neon free connection string is
provided. Do not treat local release evidence as a hosted-service, uptime, or
scale claim.

## Free-tier topology

- one Render free web service runs independent API, worker, and fictional
  destination processes from the same image;
- the API serves the compiled React console on the public Render port;
- the destination binds only to `127.0.0.1:3201` inside the container;
- Neon free PostgreSQL owns authoritative product and execution records;
- Render free Key Value coordinates identifier-only jobs and heartbeat state.

The root `render.yaml` defines the Render resources and non-secret variables.
The root `Dockerfile` builds the release artifact. Set
`AFTERHOOK_SERVICE_ROLE=all` to start the three processes. The image binds the
API to `::` and gives the destination a separate loopback host and port.

Configuration boundaries:

- provide the pooled Neon `DATABASE_URL` only through Render's secret prompt;
- `REDIS_URL` references the Blueprint's Key Value connection string;
- Render generates `SECRET_ENCRYPTION_KEY` as a 256-bit secret;
- `ALLOW_PRIVATE_DESTINATIONS=true` is limited to the controlled loopback demo
  destination;
- only the web service receives a public domain.

Render free web services sleep after 15 minutes without inbound traffic and can
take about one minute to wake. Free Key Value has no persistence, which is
acceptable because Redis is not authoritative and the worker reconciles retry
schedules from PostgreSQL. Neon free compute scales to zero when idle. This is
a public portfolio demo, not a production availability promise.

## Required processes

Run API, worker, PostgreSQL, Redis, and the chosen destination as separate
processes. PostgreSQL is authoritative. Redis coordinates identifier-only jobs
and may be rebuilt without losing product history.

## Required configuration

- `DATABASE_URL`
- `REDIS_URL`
- `SECRET_ENCRYPTION_KEY`: a stable base64 32-byte key, stored by the chosen
  secret manager and never logged or committed
- `PORT` for the API when the platform assigns one
- `AFTERHOOK_DEMO_ENABLED=true` only in an intentionally public fictional demo
- `AFTERHOOK_DEMO_DESTINATION_ORIGIN` only for that demo's controlled target

Use independent database credentials with least privilege. Never share the
test Redis database or local example key with a deployed environment.

## Release order

1. Build the exact commit and run the full Quality workflow.
2. Back up PostgreSQL and verify restoration separately.
3. Apply migrations before accepting API traffic.
4. Start the worker, then API, and verify `/health` reports a healthy worker.
5. Verify the success, retryable failure, and manual recovery scenarios contain
   only fictional redacted values.
6. Capture the release evidence from the deployed commit.
7. Enable public traffic only after the above checks are recorded.

## Rollback and recovery

Application code can roll back only when the database schema remains
compatible. Never reverse or edit an applied migration blindly. If a release
fails after migration, stop traffic, preserve PostgreSQL evidence, restore from
a tested backup when necessary, and reconcile persisted scheduled attempts
through the worker. Redis can be rebuilt; it is not a rollback authority.

## Observability and incident limits

Monitor API health, worker heartbeat, PostgreSQL availability, Redis
availability, and safe delivery outcomes. Do not put payloads, authorization,
request headers, response bodies, encryption keys, or internal addresses in
alerts. This project has no on-call or uptime commitment before a future
deployment decision.
