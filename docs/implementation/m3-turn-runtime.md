# M3 - Turn Runtime

- **Status:** Draft implementation note
- **Date:** 2026-06-29
- **Base:** RFC-0000 to RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1 and M2

## What M3 introduces

M3 adds the minimum in-memory `Turn` runtime needed to model governed execution lifecycle, state transitions, pending effects, unknown outcomes, and reconciliation.

## Minimum Turn model

The runtime tracks a `Turn` with:

- `turn_id`
- `organization_id`
- `correlation_id`
- `actor`
- `state`
- `execution_context`
- `pending_effects`
- `unknown_outcomes`
- `evidence_links`
- `created_at`
- `updated_at`

It also models minimum `TurnEffect`, `UnknownOutcome`, and reconciliation state.

## Unknown Outcome

An `Unknown Outcome` represents an external effect whose final result is not yet known. It must prevent `Completed` until reconciliation is resolved.

## Why Completed stays blocked

`Completed` is blocked when there are unresolved unknown outcomes, unresolved point-of-no-return effects, or pending reconciliation.

## What stays in-memory or stubbed

M3 still uses in-memory state and stubbed persistence only. It does not add:

- LLMs
- real integrations
- a definitive database
- real queues
- real web frameworks
- Docker
- real outbound effects

## What M3 does not implement yet

M3 does not implement future resumption, durable orchestration, or deeper Core integration beyond optional `turn_id` association.

## Running tests

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## Debt for M4

M4 can connect the runtime more deeply into execution orchestration, reconciliation workflows, and durable evidence handling.
