# M4 - Capability Runtime Skeleton

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2 y M3

## 1. What M4 introduces

M4 adds the minimum in-memory capability runtime needed to register governed capabilities, validate a binding path when one is required, execute a capability in a controlled skeleton, and emit durable evidence for the request and its result.

## 2. Capability model

The runtime models a capability definition with:

- `capability_id`
- `organization_id`
- `title`
- `description`
- `kind`
- `version`
- `enabled`
- `approval_requirement`

Invocation input carries:

- `capability_id`
- `organization_id`
- `principal_id`
- `correlation_id`
- `input`
- `binding_id`
- `policy_decision_id`
- `approval_requirement`
- `evidence_reference`

Invocation output returns:

- `invocation_id`
- `status`
- `runtime_decision`
- `binding_id`
- `policy_decision_id`
- `evidence_reference`
- `reason`
- `output`

## 3. What remains in-memory / stub

M4 still uses:

- in-memory capability registry;
- in-memory capability invocation tracking;
- in-memory evidence emission;
- deterministic request and capability fingerprints;
- no production integration backend.

## 4. What M4 does not implement yet

M4 does not add:

- LLMs;
- real integrations;
- database persistence;
- ORM models;
- message queues;
- Docker;
- Python workers;
- external side effects;
- real cryptography;
- workflow orchestration beyond the minimum invocation skeleton.

The prevention of fragmentation of compound effects is out of scope for M4.
M4 only requires binding/approval per individual effectful invocation.
Aggregation and anti-fragmentation for delegated workflows will be addressed in a later milestone.

## 5. Core integration

Core can pass an optional capability invocation into the governed execution path. When a runtime is available, the invocation is executed through the in-memory capability runtime; when it is absent, the request keeps the capability branch visible as unavailable instead of silently dropping it.

## 6. Running tests

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## 7. Debt for M5

The next phase can focus on:

- richer capability policy mapping;
- stronger binding/replay correlation for capabilities;
- more explicit organization-scoped capability catalogs;
- future operational documentation;
- any later production-grade runtime or storage decisions.
