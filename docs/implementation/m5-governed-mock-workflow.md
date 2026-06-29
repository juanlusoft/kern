# M5 - Governed Mock Workflow / End-to-End Skeleton

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3 y M4

## 1. What M5 introduces

M5 is the first mini Kern that runs end to end entirely in memory. It connects intent, policy, turn runtime, capability runtime, decision binding, evidence, and final response for two mock flows: reading an estimate and preparing an email send.

The result is still a skeleton:

- no real integrations;
- no external network;
- no persistent storage;
- no production queue;
- no LLM authority;
- no anti-fragmentation of composite delegated workflows.

## 2. Mock flows

### Mock read flow

The read flow accepts a governed request to consult an estimate. The workflow:

1. records intent;
2. evaluates policy;
3. creates and advances a turn;
4. invokes `mock.estimate.read` through the capability runtime;
5. records evidence;
6. builds the final response from the runtime result only.

When the runtime returns `executed`, the response carries the mock estimate. When the runtime returns `not_found`, `unavailable`, `error`, or `denied`, the workflow surfaces that outcome without inventing estimate data.

### Mock effect flow

The effect flow prepares and sends a mock email:

1. creates a preview with `mock.email.preview`;
2. requests approval and builds a binding from the exact approved content;
3. validates the binding against the approved capability and fingerprint;
4. invokes `mock.email.send` only after approval and binding are valid;
5. consumes the binding when execution succeeds;
6. records the final response from the runtime only.

If approval is missing or denied, the send capability is never invoked and the workflow is blocked fail-closed.

## 3. Response rule

The final response is always derived from the typed `CapabilityInvocationResult` produced by the runtime. Caller claims, model claims, and assistant-asserted outputs are ignored if they appear in requests or tests.

The response carries an explicit source marker:

- `response_source = runtime_result` when the runtime produced the answer;
- `response_source = workflow_blocked` when approval or binding never allowed the runtime call.

## 4. Evidence chain

M5 leaves durable evidence that allows the run to be reconstructed:

- `intent`;
- `policy_decision`;
- `turn_created` / `turn_transitioned`;
- `preview_created` for the email flow;
- `approval_requested` for the email flow;
- `binding_created`;
- `binding_validated`;
- `capability_invocation_requested`;
- `capability_invocation_started` or `capability_invocation_denied`;
- `capability_invocation_completed` / `capability_invocation_not_found` / `capability_invocation_unavailable` / `capability_invocation_error`;
- `capability_result_bound` when a capability completes;
- `effect_blocked` when approval is missing or denied;
- `workflow_response_created`.

## 5. Tests

The tests in M5 act as a contract for the later real integrations:

- runtime output is the only source of truth for the final response;
- approval is required before effectful execution;
- binding must match capability and input fingerprint;
- denied or blocked paths do not execute the send capability;
- read paths do not invent estimate data;
- the workflow remains in-memory and mock-only.

## 6. How to run

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## 7. Deferred work

The following remain for later milestones:

- Holded real integration;
- Gmail real integration;
- Drive / Odoo / Telegram integrations;
- LLM-backed routing or generation authority;
- persistent database and ORM selection;
- queues;
- web framework choices;
- production hardening;
- anti-fragmentation of compound delegated workflows from RFC-0010.
