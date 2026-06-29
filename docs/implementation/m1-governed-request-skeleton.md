# M1 Governed Request Skeleton and M1.1 Contract Cleanup

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base normativa:** RFC-0000 a RFC-0010 Accepted
- **Base de implementación:** Core v1 Implementation Plan, Core v1 Build Backlog

## 1. Propósito
This document explains the minimal governed-request foundation delivered by M1 and the contract-cleanup follow-up in M1.1.

M1 establishes the smallest executable path for governed requests. M1.1 tightens the supporting contracts so the runtime can resolve organization and identity with stricter boundaries, keep payload fingerprints stable, and make the intent/policy/binding flow easier to test and reason about.

## 2. Qué implementa M1
M1 provides the governed-request skeleton:

- organization resolution before any effect;
- identity resolution after organization is known;
- policy evaluation with fail-closed behavior;
- evidence capture for intent and policy decisions;
- Decision Binding creation only when policy allows and a binding is required;
- blocking behavior for deny, defer, and failed-closed outcomes;
- compliance tests that exercise the governing path and the negative paths.

## 3. Qué aclara M1.1
M1.1 does not add a new product surface. It cleans up the contracts around the M1 skeleton so the implementation is easier to verify:

- request payloads are modeled explicitly instead of as loose shape fragments;
- organization resolution is membership-aware and fails closed when a principal cannot act in the target organization;
- identity resolution uses the same structured payload contract as policy and bindings;
- binding validation compares the current request against the stored payload reference and fingerprint;
- policy input attributes are normalized through the same request payload contract used elsewhere.

## 4. Cómo ejecutar y verificar
Use the repository scripts to validate the current state:

```bash
npm install
npm run typecheck
npm test
git diff --check
git status --short
```

The order matters: install first, then typecheck, then the tests, and finally confirm that no local changes remain after the run.

The expected outcome is:

- type checking passes;
- tests pass;
- no local changes remain after verification.

## 5. Qué queda fuera
M1 and M1.1 do not introduce:

- LLMs;
- external integrations;
- definitive database choices;
- queues;
- Docker;
- Python workers;
- web frameworks;
- OAuth flows;
- RAG;
- embeddings;
- Telegram;
- secrets management;
- any real external action path.

## 6. Stubs permitidos
The following are acceptable only as minimal, non-authoritative stubs:

- in-memory evidence storage;
- in-memory binding storage;
- fixture-based organization and identity resolution;
- deterministic policy evaluation for the governed skeleton;
- conceptual payload normalization and fingerprinting.

These stubs exist to make the governed path testable. They are not production authority.

## 7. Riesgos y deuda pendiente
The main remaining debt belongs to M2 and beyond:

- richer evidence durability and retention policy;
- stronger binding lifecycle and reconciliation semantics;
- broader policy composition and obligation handling;
- package-level documentation for operational usage;
- future persistence and runtime decisions once the stack is chosen.

M1.1 intentionally stops before those decisions so the core contract stays small and verifiable.
