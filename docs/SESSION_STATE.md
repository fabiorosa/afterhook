# Session state

Updated: 2026-07-25.

## Current status

WOP-003 is implemented in a review branch. The repository has a strict
TypeScript npm workspace, automated quality gates, CI, and intentionally empty
application and package boundaries. No product behavior exists yet.

## Decisions made

- Build a real operations product for software teams, not a queue demo.
- Use TypeScript as the primary language.
- Focus the MVP on signed ingestion, idempotency, asynchronous delivery,
  attempt history, failure classification, and safe retry.
- Keep PostgreSQL authoritative and use Redis plus BullMQ only for work
  coordination.
- Exclude accounts, multi-tenancy, visual workflow editing, and AI from the
  MVP.
- Introduce human approval before considering one bounded AI step.
- Publish development incrementally through real issues, branches, pull
  requests, CI, and releases.
- Product name approved as `AfterHook`; repository and npm name use
  lowercase `afterhook`.
- GitHub and npm availability were checked before approval. The npm package
  name is available.
- WOP-002 contains the README, MIT license, agent entry points, product brief,
  MVP scope, architecture, decisions, testing strategy, executable backlog, and
  session state required for the public foundation.
- The first public commit contains documentation only. Repository topics
  describe TypeScript, webhooks, event-driven work, observability, BullMQ,
  PostgreSQL, open source, and developer tooling.
- GitHub issue #1 defines WOP-003 as an isolated quality-foundation phase.
- Node.js 22 is the documented runtime baseline.
- The root `npm run quality` command checks formatting, lint, strict types,
  tests, and builds across the workspace.
- The API, worker, console, domain, and contracts boundaries contain no
  speculative behavior.

## Naming record

Names rejected due to existing products or repositories include RelayOps,
FlowRelay, RunTrace, SignalDock, Eventrail, Hooktrail, and Retrylane.

## Next action

Review and merge the draft pull request for WOP-003. After that, define WOP-101
as the next public issue before implementing endpoint and destination setup.
