# M7 - First Real Read Adapter: Holded estimate read as an installable module

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3, M4, M5, M6, ADR-0002, ADR-0003

## 1. What M7 introduces

M7 adds the first real external read adapter in Kern. It implements the generic `ExternalReadAdapter` port defined by M6, but it remains an isolated module and not Core.

This milestone is about governed reading, not writing. The new adapter can read Holded estimates through injected HTTP transport, and it can be installed or left inactive per installation.

## 2. Architectural boundaries

M7 follows ADR-0002 strictly:

- Core hosts the runtime, but Core is not Holded.
- Core does not know Holded.
- Core does not import Holded.
- Core does not name Holded.
- The adapter is registered by a stable module key.
- The installation decides whether the module is active.
- Workflows and capabilities keep using the generic port.

The model also remains behind the runtime, as fixed by ADR-0003. M7 does not allow a caller or a model to invent read results.

## 3. What the adapter does

M7 introduces a Holded read adapter that can:

- read a Holded estimate by id;
- read a Holded estimate by customer when that fits the generic `ResourceQuery` naturally;
- return `found`, `not_found`, `unavailable`, `error`, `denied`, or `blocked` as distinct outcomes;
- attach `SourceEvidence` to every `found` result;
- keep API keys out of logs, evidence, errors, and serialized results.

## 4. Activation and registration

The adapter is installable as a module under a stable key such as `holded-read`.

A minimal module registry can register the adapter factory, and each installation can declare whether the module is active. If the module is not installed or not active for that installation, the adapter fails closed with `denied` or `unavailable` and does not fall through to another module.

This does not add a marketplace, plugin runtime, or hot reload.

## 5. Transport and secrets

The adapter receives HTTP transport by injection. Tests can stub the transport so they never touch the network.

The Holded API key is read from `KERN_HOLDED_API_KEY` or injected explicitly. The repository never commits a real `.env` file and never hardcodes the key.

The adapter must not leak the key in:

- output;
- evidence;
- errors;
- logs;
- test snapshots.

A read-only token is preferred if the upstream system supports it.

## 6. Status mapping

M7 keeps the M6 semantics:

- `found` means Holded returned a valid resource and the adapter could attach `SourceEvidence`;
- `not_found` means Holded responded correctly and the resource was not present;
- `unavailable` means the network, timeout, or transport failed;
- `error` means the response was invalid, unexpected, or unparseable;
- `denied` and `blocked` cover inactive modules, authorization problems, or malformed queries.

Important distinction: `not_found` is not used for malformed queries, bad endpoints, invalid parameters, parse failures, token problems, timeouts, or network failure.

## 7. Testability

M7 is designed for deterministic offline tests:

- contract tests run with injected transport stubs;
- workflow tests run with the adapter injected through the generic M6 port;
- source evidence is asserted explicitly;
- claimed results from caller or model are ignored.

An opt-in live integration test can be documented separately and enabled only when `KERN_HOLDED_API_KEY` and a base URL are available. It stays skipped by default and never blocks CI.

## 8. What M7 does not implement

M7 does not implement:

- writing to Holded;
- external effects;
- Gmail;
- Odoo;
- Drive;
- Telegram;
- LLMs;
- SDKs for OpenAI, Anthropic, or Gemini;
- embeddings;
- real RAG;
- a definitive database;
- ORM;
- real queueing;
- a web framework;
- Docker;
- OAuth real flow;
- Python;
- Python workers;
- real persistence;
- RFC-0010 anti-fragmentation of delegated workflows.

## 9. How to run

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## 10. Debt for later milestones

The next steps can harden provider-specific nuances, richer live integration coverage, and further operational documentation without changing the contract established here.
