# Product brief

## One sentence

AfterHook gives software teams one place to receive, inspect, deliver, and
safely retry webhook-driven work.

## Problem

Webhooks and background jobs often fail between systems with little useful
context. A `200 Accepted` response proves only that one server received a
request. It does not prove that the event was validated, processed, delivered,
or applied by the destination.

Teams commonly troubleshoot these failures through scattered application logs,
queue dashboards, database records, and manual replays. This creates four
risks:

- the same event may be processed more than once;
- a retry may repeat an action that already succeeded;
- sensitive payloads may be copied into unsafe support channels;
- operators may not know which system owns the next action.

## Primary user

A product engineer, integration engineer, or technical operations teammate at a
small software company that connects its product to external systems.

## Core job

When an integration event fails, the team needs to understand where it stopped,
why it stopped, and whether it can be retried safely.

## Product promise

Every accepted event receives a durable record and an understandable execution
timeline. Failures expose a safe next action. Retries preserve idempotency and
never erase the original attempt.

## Product principles

1. Accepted is not the same as delivered.
2. Every event has one stable identity.
3. Attempts are append-only evidence.
4. Retry creates a new attempt, not a rewritten history.
5. Secrets stay secret and payload exposure is minimized.
6. Reliability states must make sense to a human operator.
7. Automation performs bounded work. A human approves sensitive recovery.

## Why this belongs in Fabio's portfolio

The product complements the existing projects:

- CaseLane proves full-stack SaaS, product workflows, authorization, and UX.
- OGsmith proves open-source library design, deterministic rendering, npm, and
  developer experience.
- This project proves event ingestion, asynchronous work, idempotency, retries,
  API contracts, operational UX, and observability.

## Portfolio success

A technical reviewer can run the system locally, send one webhook, observe a
successful or failed attempt, retry it, and explain how the implementation
prevents duplicate uncontrolled work.

No adoption, scale, latency, or reliability claims are required.
