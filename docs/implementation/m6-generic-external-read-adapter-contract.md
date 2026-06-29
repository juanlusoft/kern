# M6 — Generic External Read Adapter Contract

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3, M4 y M5

## 1. What M6 introduces

M6 defines a generic external read adapter contract for governed reads. It is a port, not an integration, and it keeps all behavior fake, mock, and in-memory.

## 2. Direction of dependencies

The contract lives in `packages/contracts`. Core depends only on the port. Any future real adapter depends on the contracts, never the other way around. Core does not name providers.

## 3. Contract surface

M6 introduces:

- `ExternalReadAdapter`
- `ResourceQuery`
- `ResourceResult`
- `ResourceReadStatus`
- `SourceEvidence`
- `ExternalReadAdapterAuthorization`
- `ExternalReadAdapterDecision`

`ResourceQuery` captures organization, correlation, actor, resource type, and optional filters. Claimed results from caller or model are ignored.

`ResourceResult` returns typed outcomes:

- `found`
- `not_found`
- `unavailable`
- `error`
- `denied`
- `blocked`

## 4. SourceEvidence is mandatory

When a result is `found`, it must carry `SourceEvidence`. The contract rejects found data without source evidence. That keeps every returned datum tied to a concrete source, record, field, and observation timestamp.

## 5. Generic mock resource capability

M6 adds a single generic read capability, `mock.resource.read`, that consumes a `ResourceQuery` and returns a `ResourceResult` through the adapter port. It is read-only, fails closed, and ignores caller-claimed results.

## 6. Workflow integration

The M5 read workflow can route through the generic adapter port when one is provided. If no adapter is supplied, behavior remains fail-closed and explicit. Found data comes only from the adapter; not found, unavailable, and error remain distinct.

## 7. Evidence

M6 records evidence for:

- requested query;
- authorization decision;
- found / not found / unavailable / error / denied / blocked results;
- source evidence recording when data is returned;
- final result binding.

## 8. What M6 does not implement

M6 does not implement:

- Holded real;
- Gmail real;
- Drive real;
- Odoo real;
- Telegram;
- LLM;
- SDKs;
- embeddings;
- RAG real;
- DB definitive;
- ORM;
- queues;
- web framework;
- Docker;
- OAuth real;
- secrets or `.env`;
- credentials;
- Python;
- Python workers;
- external effects;
- real persistence;
- anti-fragmentation from RFC-0010.

## 9. Running tests

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## 10. Debt for M7

The next phase can harden provider-specific adapter boundaries, richer source provenance, and more operationally detailed contract tests without changing the port shape defined here.
