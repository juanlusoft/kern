# M11 - Installation Config and Runtime Slice / Spark Wiring

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-30
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3, M4, M5, M6, M7, M8, M9, M10, ADR-0002, ADR-0003

## 1. What M11 introduces

M11 adds the first installation-driven runtime slice that can compose the already established modules without moving any authority into Core.

The slice does not add a database, a web framework, Docker, a plugin marketplace, or any kind of dynamic registry. It only wires the modules that already exist behind explicit configuration.

The guiding rule remains the same:

`Core proposes the boundary; installation config decides what is active.`

## 2. Installation configuration

M11 introduces a structured installation configuration that is validated before the runtime starts.

The configuration covers:

- organization identity and activation;
- principals and their scopes;
- channel identity mappings;
- active modules;
- secret references;
- runtime options.

Validation is fail-closed:

- missing organization data blocks startup;
- missing or ambiguous principals block startup;
- invalid identity mappings block startup;
- unsupported module keys block startup;
- missing required secret references block startup;
- invalid runtime options block startup.

The configuration can be loaded from:

- a JSON payload passed in the environment;
- a JSON file referenced by the environment.

No checked-in `.env` file is required.

## 3. Module registry and composition

M11 adds a small in-memory module registry used to compose the runtime slice.

The registry knows about the modules required for Spark:

- `telegram-channel`
- `qwen-orchestrator`
- `holded-read`

The registry records:

- the supported module list;
- which modules are active for the installation;
- whether a required module is missing.

If a required module is not active, startup is blocked. The slice does not guess, substitute, or fall back to a hidden default.

## 4. Runtime slice

The runtime slice composes:

- the Telegram channel adapter;
- the Qwen orchestrator;
- the Holded read adapter;
- the governed workflow runtime;
- the orchestration boundary.

The slice keeps the same policy order already established by earlier milestones:

1. organization and identity are resolved first;
2. policy and capability checks happen before execution;
3. the orchestrator only proposes;
4. the workflow runtime only executes when the proposal is valid;
5. the external read adapter stays behind the governed port;
6. evidence is recorded for startup, module activation, message receipt, processing, and failure.

If a required module or secret is missing, startup is blocked and evidence is recorded.

## 5. Entry point

M11 adds an executable Node entry point that loads the installation config and starts the slice.

The entry point is designed to be run directly, but it remains safe by default:

- it reads configuration from JSON;
- it validates configuration before wiring modules;
- it fails closed when config or secrets are missing;
- it never hardcodes secrets;
- it never requires a persistent store.

The entry point exists so Spark can start the runtime in a repeatable way without turning the repo into an application framework.

## 6. What M11 does not implement

M11 does not implement:

- RFC changes;
- a database of record;
- a web UI;
- Docker;
- a plugin marketplace;
- a registry backend;
- dynamic plugin execution;
- real external writes;
- real hidden defaults;
- any new source of authority.

It also does not add:

- LLM authority;
- RAG;
- embeddings;
- Python workers;
- hardcoded secrets;
- a `.env` file in source control.

## 7. Tests

M11 is covered by:

- unit tests for installation config validation and secret resolution;
- unit tests for the runtime slice wiring;
- compliance tests for the installation path and fail-closed startup.

The tests stay offline and deterministic by default.

## 8. Run

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## 9. Debt for M12

Future work can split the runtime slice into clearer bootstrap stages, add deployment-specific documentation, and tighten operational diagnostics without changing the installation-driven composition model.
