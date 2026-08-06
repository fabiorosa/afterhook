# Security policy

## Supported state

The current `main` branch is the supported pre-release line. AfterHook is a
local-first portfolio product and has no hosted production service or user
accounts yet.

## Reporting a vulnerability

Do not open a public issue with a proof of concept, secret, payload, endpoint
URL, or customer data. Report privately through the repository owner's GitHub
profile. Include affected revision, reproduction steps using fictional data,
impact, and a safe remediation suggestion if available.

We acknowledge reports within seven calendar days and will coordinate public
disclosure only after a fix or documented mitigation exists.

## Security boundaries

- signing secrets and destination authorization are encrypted at rest and only
  returned at endpoint creation or rotation;
- inbound signatures cover exact raw JSON bytes plus a five-minute timestamp;
- public inspection uses redacted payloads and narrow projections;
- delivery rejects unsafe destination networks outside an explicit local fixture
  mode;
- PostgreSQL owns identity and attempt history; Redis contains identifier-only
  coordination data;
- demo reset requires explicit enablement and deletes only persistently marked
  fictional records.

## Out of scope

Do not test against third-party endpoints, shared infrastructure, or data you
do not own. Availability claims, multi-tenant isolation, and hosted deployment
are not yet supported promises.
