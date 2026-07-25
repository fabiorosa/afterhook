# AfterHook agent contract

Read `../CAREER_CONTEXT.md`, `../PORTFOLIO_PROJECT_STANDARD.md`,
`docs/PRODUCT.md`, `docs/SCOPE.md`, `docs/ARCHITECTURE.md`,
`docs/DECISIONS.md`, `docs/TESTING.md`, `docs/BACKLOG.md`, and
`docs/SESSION_STATE.md` before changing this project.

The approved product name is `AfterHook`. Use `afterhook` for the repository,
npm scope-free package name, directory references, and machine identifiers.

## Delivery rules

- Work on exactly one backlog ticket at a time.
- Deliver small vertical slices. Do not implement the complete roadmap at once.
- Every completed ticket must leave the repository coherent and reviewable.
- Update `docs/BACKLOG.md` and `docs/SESSION_STATE.md` before ending a session.
- Use a public issue for each material slice after the repository is published.
- Use branches and pull requests for reviewable changes.
- Never fabricate history, users, adoption, metrics, incidents, or benchmarks.

## Product rules

- This is a real open-source product, not a queue demonstration.
- The primary user is a software team operating webhook-driven integrations.
- Reliability must be visible in the product experience, not hidden in logs.
- PostgreSQL is authoritative for product and execution records.
- Redis and BullMQ coordinate work but are not the source of truth.
- Every delivery is idempotent, traceable, bounded, and safe to retry.
- Raw secrets are never displayed after creation.
- Payloads must be redacted by default in public demos and evidence.
- Product copy, documentation, comments, and commits use natural US English.
- Do not use em dashes in public text.

## Engineering rules

- TypeScript strict mode. Do not use `any` as an escape hatch.
- Validate all external input at runtime.
- Keep domain rules outside React components and transport handlers.
- Separate ingestion, orchestration, delivery, and presentation boundaries.
- Every bug fix requires a regression test.
- Material architectural decisions require an ADR.
- No new service, framework, or infrastructure dependency without a real
  consumer in the active slice.

## Definition of done

A ticket is complete only when its behavior, validation, failure states,
security boundary, tests, documentation, lint, typecheck, and production build
pass. Browser work also requires keyboard and responsive verification.
