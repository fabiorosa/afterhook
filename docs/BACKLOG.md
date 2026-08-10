# Executable backlog

One ticket at a time. Tickets become public GitHub issues after the repository
is created.

Status values: `todo`, `active`, `done`.

## Phase 0: Public foundation

| ID      | Ticket                                                                                                                                            | Status |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| WOP-001 | Select final name, verify GitHub and npm availability, approve one-sentence positioning                                                           | done   |
| WOP-002 | Create public repository with README, license, agent contract, product brief, scope, architecture, decisions, testing, backlog, and session state | done   |
| WOP-003 | Add TypeScript workspace, formatting, lint, typecheck, Vitest, CI, and empty package boundaries. GitHub #1                                        | done   |

**Gate:** the repository is public, the product can be understood without code,
CI is green, and the next ticket is a single vertical capability.

## Phase 1: Receive and inspect

| ID      | Ticket                                                                         | Status |
| ------- | ------------------------------------------------------------------------------ | ------ |
| WOP-101 | Create endpoint and destination records with secret-safe setup UX. GitHub #3   | done   |
| WOP-102 | Accept signed JSON with timestamp, size, and idempotency validation. GitHub #5 | done   |
| WOP-103 | Persist one authoritative event and append its initial activity. GitHub #7     | done   |
| WOP-104 | Show event list and event detail with received-state timeline. GitHub #9       | done   |

**Gate:** a reviewer can create an endpoint, send one signed event, see it in
the console, and observe safe duplicate behavior. Invalid input and empty,
loading, error, focus, and mobile states are complete.

## Phase 2: Deliver and recover

| ID      | Ticket                                                                                 | Status |
| ------- | -------------------------------------------------------------------------------------- | ------ |
| WOP-201 | Add Redis and BullMQ with identifier-only jobs and worker heartbeat. GitHub #11        | done   |
| WOP-202 | Deliver to the local destination with timeout and SSRF boundaries. GitHub #13          | done   |
| WOP-203 | Record append-only attempts and update the human-readable timeline. GitHub #15         | done   |
| WOP-204 | Add retry classification, bounded automatic backoff, and dead-letter state. GitHub #17 | done   |
| WOP-205 | Add safe manual retry with concurrency protection. GitHub #19                          | done   |

**Gate:** success, timeout, retryable failure, terminal failure, automatic retry,
and manual recovery pass against real PostgreSQL, Redis, and HTTP processes.

## Phase 3: MVP product release

| ID      | Ticket                                                                                            | Status |
| ------- | ------------------------------------------------------------------------------------------------- | ------ |
| WOP-301 | Complete filters, attempt detail, copyable diagnostics, and recovery feedback. GitHub #21         | done   |
| WOP-302 | Add deterministic demo modes and guarded reset. GitHub #23                                        | done   |
| WOP-303 | Complete OpenAPI contract, fresh-clone setup, security policy, and deployment runbook. GitHub #25 | done   |
| WOP-304 | Add Playwright desktop, keyboard, privacy, and mobile walkthroughs                                | done   |
| WOP-305 | Capture evidence, deploy the public demo, and publish `v0.1.0`. GitHub #29                        | active |

**Gate:** one complete webhook-to-recovery journey is published, documented,
testable, and defensible in an interview. No post-MVP feature begins before
this gate passes.

## Phase 4: Human approval

| ID      | Ticket                                                                    | Status |
| ------- | ------------------------------------------------------------------------- | ------ |
| WOP-401 | Research one sensitive action that benefits from explicit approval        | todo   |
| WOP-402 | Add approval-required state with actor, reason, expiry, and audit history | todo   |
| WOP-403 | Prove that retries cannot bypass approval                                 | todo   |

**Gate:** automation pauses honestly and a human decision is recorded before
the sensitive action continues.

## Phase 5: Structured AI step

| ID      | Ticket                                                                         | Status |
| ------- | ------------------------------------------------------------------------------ | ------ |
| WOP-501 | Select one real extraction or classification task and define its schema        | todo   |
| WOP-502 | Add provider adapter, structured output validation, timeout, and cost boundary | todo   |
| WOP-503 | Add deterministic fixtures, evaluation cases, and approval before delivery     | todo   |
| WOP-504 | Expose prompt, model, validation, and human-decision evidence safely           | todo   |

**Gate:** the AI step is bounded, evaluated, observable, optional, and unable to
perform the final sensitive action without human approval.

## Deferred ideas

- CLI.
- Generated SDK.
- Multi-step workflows.
- Multiple destinations.
- Multi-tenancy and RBAC.
- External OpenTelemetry collector.
- Framework integrations.

Deferred ideas are not backlog tickets until Fabio explicitly promotes one.
