# M2 Evidence and Binding Hardening

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base normativa:** RFC-0000 a RFC-0010 Accepted
- **Implementation base:** Core v1 Implementation Plan, Core v1 Build Backlog, M1 Governed Request Skeleton and M1.1 Contract Cleanup

## 1. What M2 hardens
M2 hardens the evidence and binding path without adding production storage, real cryptography, external integrations, or any new authority surface.

It strengthens:

- evidence record structure;
- append-only ledger behavior;
- binding lifecycle states;
- binding validation reasons;
- correlation between intent, policy decision, binding, and blocking;
- negative tests for evidence and binding handling.

## 2. What remains in-memory / stub
M2 still uses:

- in-memory evidence storage;
- in-memory binding storage;
- deterministic test fixtures;
- conceptual request fingerprinting;
- non-cryptographic identifiers and hashes.

No production persistence layer is introduced here.

## 3. What is not implemented yet
M2 does not introduce:

- a real database;
- ORM models;
- message queues;
- Docker;
- LLMs;
- external integrations;
- OAuth;
- RAG;
- embeddings;
- Python workers;
- real outbound actions;
- real cryptography.

## 4. How to run tests
Run the repository checks and test suite through the standard scripts:

```bash
npm install
npm run typecheck
npm test
git diff --check
git status --short
git diff --name-only origin/main...HEAD
```

## 5. New guarantees
M2 adds clearer guarantees around:

- append-only evidence with monotonic sequence numbers;
- defensive copies when reading evidence back;
- organization-scoped evidence queries;
- correlation-scoped evidence reconstruction;
- explicit binding rejection reasons;
- validated bindings distinct from created bindings;
- blocked and failed-closed outcomes leaving evidence behind when possible.

## 6. Debt left for M3
The next phase can focus on:

- richer policy/binding lifecycle integration;
- persistence strategy;
- long-lived reconciliation and retention;
- stronger operational documentation;
- any future production-grade storage or enforcement work.
