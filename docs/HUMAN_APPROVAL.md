# Human approval boundary

## Purpose

AfterHook already makes manual recovery visible and bounded. It does not yet
separate the person who asks to replay an event from the person who authorizes
that external side effect. WOP-401 defines that boundary before an approval UI,
AI suggestion, or delivery policy is implemented.

## Selected action

The first approval-gated action is **manual recovery of a failed or
dead-letter event when it would create another HTTP delivery attempt**.

A replay can be safe at the protocol layer and still be sensitive in the
destination's business domain. A destination might create a payment, provision
access, notify a customer, or change inventory. The current manual retry is
therefore an explicit operator intent, not evidence of independent approval.

## Required decision record

Before a gated recovery is queued, the system needs an append-only approval
request containing only safe operational evidence:

- the event and endpoint identities;
- the proposed recovery trigger and next attempt number;
- the requester identity, reason, and requested timestamp;
- a pending, approved, denied, or expired decision state;
- the approver identity, decision timestamp, and optional reason;
- a server-calculated expiry timestamp.

It must not copy payload content, destination URLs, authorization, response
bodies, encrypted values, or raw headers into the approval record or its UI.

## Trust boundary

An actor name supplied by a browser, an API header, or a form field is not an
identity. It would make the audit record decorative and would let the same
untrusted caller claim both sides of a decision.

WOP-402 must introduce a minimum trusted operator identity boundary before an
approval can be audited. The future implementation may use a deliberately
small authenticated operator model, but it must provide server-verified actor
identities and require a different approver from the requester. Full
multi-tenant RBAC remains out of scope until it has a product consumer.

## State and delivery contract

1. A requester asks to recover an eligible event.
2. For destinations whose policy requires approval, PostgreSQL records a
   `PENDING` approval request. It does not reserve or queue a delivery attempt.
3. A distinct authenticated operator approves, denies, or lets the request
   expire.
4. Approval transactionally creates the scheduled manual attempt and activity
   evidence. Only then may identifier-only queue handoff occur.
5. Denial or expiry creates safe activity evidence and leaves the event's
   delivery and retry state unchanged.

Retries, worker reconciliation, duplicate queue jobs, and stale approval
requests must never create an attempt while a request is pending, denied, or
expired. Approval does not create a new automatic retry budget.

## Relationship to the future AI step

Any structured AI classification is advisory. It may provide a validated
recommendation from an explicitly redacted input, but it cannot approve,
queue, or deliver an event. The same human approval boundary remains the final
gate for a sensitive recovery.

## WOP-402 acceptance prerequisites

- server-verified requester and approver identities;
- a distinct-approver rule;
- append-only approval state and safe activity evidence;
- server-owned expiry;
- transactional approval-to-attempt creation;
- no payload or credential leakage in database projections, API responses,
  logs, clipboard diagnostics, or the console.

WOP-403 will prove that retries and queue reconciliation cannot bypass these
states.
