# Session state

Updated: 2026-07-25.

## Current status

Product specification complete and published at
`https://github.com/fabiorosa/afterhook`. No application code exists.

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
- GitHub issue #1 defines WOP-003 as the next isolated phase.

## Naming record

Names rejected due to existing products or repositories include RelayOps,
FlowRelay, RunTrace, SignalDock, Eventrail, Hooktrail, and Retrylane.

## Next action

Complete GitHub issue #1 and WOP-003 only: add the TypeScript workspace and
automated quality foundation without implementing webhook ingestion or product
features.
