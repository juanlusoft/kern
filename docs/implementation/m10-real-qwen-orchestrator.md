# M10 - Real Qwen Orchestrator / Model Proposes, Runtime Disposes

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-30
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3, M4, M5, M6, M7, M8, M9, ADR-0002, ADR-0003

## 1. What M10 introduces

M10 adds the first real orchestrator module behind `OrchestratorPort`.

It does not change Core. It does not move Qwen into Core. It does not turn the model into a source of truth. The module sits outside Core as an isolated adapter/module, and the installation decides whether to use it.

The rule remains the same:

`el modelo propone, el runtime dispone`

The model only proposes `capability_key + params`. The runtime still produces the authoritative result.

## 2. Architectural boundaries

- Core does not know Qwen.
- Core does not import Qwen.
- Core does not name Qwen.
- The Qwen orchestrator is a module, not Core.
- The Qwen orchestrator depends on the orchestrator port and shared contracts, not on Core.
- The orchestrator does not produce business data.
- The orchestrator does not execute tools.
- The orchestrator does not execute capabilities.
- The orchestrator does not fabricate evidence.

## 3. OpenAI-compatible endpoint

M10 targets an OpenAI-compatible chat-completions endpoint, such as:

```text
POST /v1/chat/completions
```

The request can use:

- `model`
- `messages`
- `tools`
- `tool_choice`
- `temperature`

The implementation remains provider-agnostic. Qwen is the canonical example, not a hard dependency on a specific hosted service.

## 4. Configuration

The orchestrator is configured by deployment settings or environment variables:

- `KERN_MODEL_BASE_URL`
- `KERN_MODEL_NAME`
- `KERN_MODEL_API_KEY` optional

Rules:

- nothing is hardcoded beyond safe documented defaults;
- no checked-in `.env` file is required;
- secrets stay out of source control;
- the API key is optional when the local endpoint does not need it;
- the API key must never appear in logs, evidence, serialized outputs, or errors.

## 5. Tools and proposal shape

The model receives the active capabilities of the installation as tools/functions.

Only active capabilities are presented.

The model may propose:

- `capability_key`
- `params`

It may also return:

- `no_proposal`
- `denied`
- `blocked`
- `error`

Anything else is ignored.

If the model returns content with invented business data, the content is ignored. Only the tool call matters when a tool call exists.

## 6. Transport

The transport is injected.

That means:

- tests stay offline;
- the transport can be mocked;
- the module does not require network access for unit testing;
- a real HTTP transport can be enabled separately.

The recommended shape is:

```text
createQwenOrchestrator({
  baseUrl,
  model,
  apiKey,
  chatCompletionsTransport,
  now
})
```

The live transport can use Node's native `fetch`, but it stays outside Core and remains optional.

## 7. Evidence

M10 records a chain of orchestration evidence, including:

- `orchestration_requested`
- `model_orchestration_requested`
- `model_tool_call_received`
- `model_no_tool_call`
- `model_orchestration_error`
- `model_claimed_result_ignored`
- `orchestration_proposal_created`
- `orchestration_no_proposal`
- `orchestration_proposal_denied`
- `orchestration_proposal_blocked`

The evidence chain keeps the model output separated from the runtime output. The model's claim is never the final answer.

## 8. Integration with M8 and M9

M10 must be swappable into the existing orchestration boundary without changing Core.

- M8 can still use the mock orchestrator.
- M9 can keep using the mock orchestrator.
- M10 can be selected by configuration for an installation that wants a real Qwen-backed orchestrator.

Telegram remains a channel adapter. Core remains unaware of Telegram and Qwen.

## 9. What M10 does not implement

M10 does not implement:

- Core changes;
- Telegram changes;
- Qwen in Core;
- a new source of authority;
- real effects;
- writes;
- Gmail;
- Drive;
- Odoo;
- a definitive database;
- ORM;
- queues;
- a web framework;
- Docker;
- OAuth real;
- persistence as authority;
- Python workers;
- anti-fragmentation from RFC-0010.

## 10. Tests

The milestone should be covered by:

- unit tests for the Qwen orchestrator module;
- compliance tests for proposal parsing, evidence, and fail-closed behavior;
- optional live integration tests that stay opt-in and outside the default `npm test` path when no model endpoint is configured.

## 11. Debt for M11

Future work can tighten prompt policy, expand capability schemas, and harden the live integration harness without changing the principle that the model only proposes and the runtime decides.

