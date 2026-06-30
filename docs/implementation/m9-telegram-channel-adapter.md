# M9 - Telegram Channel Adapter / Mock-to-real bridge

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-30
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3, M4, M5, M6, M7, M8, ADR-0002, ADR-0003

## 1. What M9 introduces

M9 adds the first channel adapter as a separate module: Telegram.

It does not change Core, does not replace the existing PacoPrint bot, and does not introduce a new source of authority. A second bot can run in parallel when an installation needs it, but it only consumes the governed runtime path that already exists.

The adapter takes Telegram input, maps chat and user identity through configuration, and forwards the resulting governed request into the M8 orchestration boundary. Output back to Telegram is derived only from the runtime response.

## 2. Architectural boundaries

- Core does not know Telegram.
- Telegram is a channel adapter, not a capability and not Core.
- The adapter is module-owned and installation-aware.
- Inbound Telegram updates are untrusted input.
- Outbound Telegram text is runtime-derived only.
- Claimed caller, assistant, or model results are ignored.
- No Qwen, no LLM, no embeddings, and no RAG.

## 3. Telegram transport and polling

The adapter uses an injected transport for `getUpdates` and `sendMessage`-style operations.

That keeps the tests offline and deterministic. The production-facing shape may later be backed by a real HTTP client, but the module itself does not require network access to validate behavior.

Long polling is the recommended initial mode for Spark because it keeps the first live integration simple and keeps the adapter boundary visible.

The transport is not hardwired into the adapter:

- tests can provide an in-memory transport;
- live integrations can be opted into later;
- the adapter never owns a network secret itself.

The token comes from deployment configuration or secret injection, such as `KERN_TELEGRAM_BOT_TOKEN`, not from a checked-in `.env` file and not from hardcoded source.

## 4. Identity and organization mapping

Telegram user and chat identifiers are mapped to governed identity and organization context through configuration.

Rules:

- the mapping must be explicit;
- the mapping must be active;
- the mapping must belong to the same installation;
- unknown or ambiguous mappings fail closed;
- the adapter does not let Telegram choose the organization.

That means a Telegram user is not automatically trusted. The adapter only resolves a principal and organization when the configuration says so.

## 5. Runtime path

The adapter does not make decisions by itself.

It builds a governed request and hands it to the M8 orchestration boundary. That boundary, in turn, uses the mock orchestrator and the governed workflow runtime that already exist.

The adapter keeps the message content intentionally small:

- Telegram chat and user ids;
- the inbound message text;
- the mapped organization and principal;
- a correlation id derived from the message and installation;
- safe metadata only.

No business result is accepted from the caller or from any claimed model output.

The final user-facing reply is built only from the runtime response:

- `completed` remains runtime-driven;
- `not_found` stays `not_found`;
- `unavailable` stays `unavailable`;
- `error` stays `error`;
- `denied` stays `denied`;
- `blocked` stays `blocked`;
- `no_proposal` is handled honestly, without invention.

## 6. Evidence chain

M9 records a simple channel evidence chain:

- `channel_message_received`
- `channel_identity_resolved` or `channel_identity_denied`
- `channel_orchestration_requested`
- `channel_response_prepared`
- `channel_message_sent` or `channel_message_send_error`

That chain preserves the path from Telegram input to governed runtime response. The evidence is durable and the token is never echoed back into evidence or errors.

## 7. What M9 does not implement

M9 does not implement:

- Telegram as a Core concern;
- a model runtime;
- Qwen;
- OpenAI / Anthropic / Gemini SDKs;
- embeddings;
- RAG;
- Holded, Gmail, Drive, Odoo or Telegram integrations outside the adapter seam;
- OAuth;
- a definitive database;
- ORM;
- queue infrastructure;
- a web framework;
- Docker;
- Python workers;
- real persistence as authority;
- any effectful write path;
- any anti-fragmentation changes to RFC-0010.

## 8. How to run

```bash
npm install
npm run typecheck
npm test
git diff --check
```

The adapter tests remain offline and deterministic. Live integration can be added later as an opt-in harness, but M9 itself keeps the default path isolated.

## 9. Debt for M10

Future work can harden the live Telegram harness, add richer command routing, and tighten operator documentation without changing the rule that Telegram is only a channel adapter and never a source of authority.
