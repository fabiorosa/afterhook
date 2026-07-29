# Session state

Updated: 2026-07-29.

## Completed and validated

- WOP-001 selected and verified the AfterHook name.
- WOP-002 published the product foundation at
  `https://github.com/fabiorosa/afterhook`.
- WOP-003 established the strict TypeScript workspace and CI.
- WOP-101 created secret-safe endpoint and destination setup through
  PostgreSQL, Fastify, and the React console. Pull request #4 passed review,
  merged into `main`, and retained green post-merge Quality.
- WOP-102 defines signed-ingestion Zod contracts and framework-independent
  SHA-256 payload digests, HMAC verification, constant-time comparison,
  five-minute timestamp tolerance, and a 256 KiB body limit.
- Fastify preserves the exact raw JSON bytes used for signature verification
  and returns only endpoint ID, idempotency key, and payload digest.
- The ingestion route rejects missing or malformed headers, invalid and
  non-object JSON, unsupported media types, stale or altered signatures,
  unknown or disabled endpoints, and oversized bodies with safe errors.
- PostgreSQL lookup decrypts the signing secret only through a narrow internal
  ingestion projection. No API response exposes it.

## In progress

WOP-102 is the only active ticket.

Active public work:

- issue: `https://github.com/fabiorosa/afterhook/issues/5`;
- draft PR: `https://github.com/fabiorosa/afterhook/pull/6`;
- branch: `agent/signed-ingestion`.

## Pending work

1. Retain green local and GitHub quality gates for pull request #6.
2. Review and merge WOP-102 before beginning WOP-103.

## Decisions

- Signatures use HMAC SHA-256 over `<unix-seconds>.<exact-raw-json-bytes>`.
- Signature comparison is constant-time and timestamps allow five minutes of
  clock difference in either direction.
- Ingestion accepts only JSON objects up to 262,144 bytes.
- Idempotency keys are validated now, but event persistence, reservation,
  duplicate reuse, and conflict outcomes belong to WOP-103.
- WOP-102 does not add event tables, activities, delivery, Redis, BullMQ,
  retries, accounts, console event views, or deployment.

## Dead ends

- The first Fastify parser integration exposed that its callback body type
  remains `string | Buffer` and that the built-in `text/plain` parser reaches
  route handlers instead of producing an unsupported-media error. The final
  boundary normalizes parser input to `Buffer` and rejects non-JSON content
  explicitly at the ingestion route.
- PowerShell may block `npm.ps1`. Use `npm.cmd` for local checks.

## Open questions

None. WOP-103 already owns the next persistence boundary.

## Next step

Review and merge pull request #6 after terminal CI success. Do not begin
WOP-103 in the same branch.

## Pending validation

The complete root quality command passes locally on 2026-07-29. Pull request #6
must retain a terminal green GitHub Actions Quality run before review or merge.

## Continuation prompt

```text
Review draft PR #6 for WOP-102 after CI is green. If it merges, begin WOP-103
as a separate issue and branch. Preserve the boundary: WOP-103 persists one
authoritative event and its initial activity but does not add delivery,
queues, retries, accounts, event-list UI, or deploy.
```
