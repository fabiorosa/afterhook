# Deployment runbook

## Status and scope

WOP-305 selects Railway for the first public demo. The deployment is not live:
the authenticated account rejected project creation because its trial has
expired. No Railway project or billable resource was created. Do not treat the
local release evidence as a hosted-service, uptime, or scale claim.

## Railway topology

- `afterhook-api`: public domain, API role, compiled React console enabled;
- `afterhook-worker`: private worker role;
- `afterhook-destination`: private fictional destination role on port `3201`;
- managed PostgreSQL: authoritative product and execution records;
- managed Redis: identifier-only queue and heartbeat coordination.

All three application services build the repository's root `Dockerfile`.
Set `AFTERHOOK_SERVICE_ROLE` to `api`, `worker`, or `destination`. Set
`AFTERHOOK_SERVE_CONSOLE=true` only on the API. The image binds to `::` so it
can receive Railway public and private dual-stack traffic.

Use reference variables rather than copied credentials:

- API and worker `DATABASE_URL` reference the PostgreSQL service;
- API and worker `REDIS_URL` reference the Redis service;
- API `AFTERHOOK_DEMO_DESTINATION_ORIGIN` uses
  `http://${{afterhook-destination.RAILWAY_PRIVATE_DOMAIN}}:${{afterhook-destination.PORT}}`;
- destination `PORT` is explicitly `3201`;
- worker `ALLOW_PRIVATE_DESTINATIONS=true` permits only the controlled demo
  topology for this deployment;
- API and worker share one sealed, randomly generated
  `SECRET_ENCRYPTION_KEY`.

Only the API receives a public domain. PostgreSQL, Redis, worker, and
destination remain private.

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
