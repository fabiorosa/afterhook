# Session state

Updated: 2026-07-25.

## Current status

WOP-003 was merged through pull request #2. WOP-101 is active in GitHub issue
#3 and branch `agent/secret-safe-setup`.

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
- Pull request #2 passed CI, was reviewed, and merged into `main`.
- WOP-101 uses Fastify, Vite with React, Drizzle, PostgreSQL, Zod, and Node.js
  AES-256-GCM encryption for the first end-to-end setup slice.

## Naming record

Names rejected due to existing products or repositories include RelayOps,
FlowRelay, RunTrace, SignalDock, Eventrail, Hooktrail, and Retrylane.

## Next action

Implement GitHub issue #3 only: secret-safe endpoint and destination setup
without webhook ingestion, delivery, queues, or retries.
