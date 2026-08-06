# Deployment runbook

## Status and scope

This is an operational design runbook, not a deployment instruction for a
public service. WOP-303 documents the boundary required before WOP-305 chooses
and executes a hosting path. Do not treat it as an uptime or scale promise.

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
5. Verify one fictional success event and inspect its safe timeline.
6. Enable public traffic only after the above checks are recorded.

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
