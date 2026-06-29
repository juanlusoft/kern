# M8 - Orchestration Boundary / Mock Orchestrator

- **Estado:** Draft implementation note
- **Fecha:** 2026-06-29
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M1, M1.1, M2, M3, M4, M5, M6, M7, ADR-0002, ADR-0003

## 1. What M8 introduces

M8 adds the seam where an orchestration proposal enters the governed workflow path.

The milestone models the phrase:

`el modelo propone, el runtime dispone`

There is still no real model, no Qwen, no Telegram, and no network. M8 uses a deterministic mock orchestrator and an orchestration boundary that treats its proposal as untrusted input.

## 2. Architectural boundaries

M8 keeps the same boundary discipline established in ADR-0002 and ADR-0003:

- Core does not know Qwen.
- Core does not know Telegram.
- Core does not receive model-produced results as authority.
- The orchestrator can only propose `capability_key + params`.
- Any claimed result is ignored.
- The final response is assembled only from the runtime result.

The mock orchestrator may use deterministic force-routing rules such as keywords, but that only models proposal generation. It is not a real model.

## 3. Orchestrator module and port

M8 introduces a dedicated orchestrator port and a mock implementation.

The port carries:

- `OrchestrationRequest`
- `OrchestrationProposal`
- `OrchestrationOutcome`
- `OrchestrationStatus`
- `OrchestrationContext`
- `OrchestrationValidationResult`

The request keeps the minimum context needed for a governed decision:

- `user_message`
- `organization_id`
- `principal_id` or `actor`
- `correlation_id`
- optional `installation_id`
- optional `context`

The proposal stays intentionally small:

- `capability_key`
- `params`

Safe metadata such as `proposal_id`, `confidence`, or `reason` can be present. Business data cannot.

## 4. Mock orchestrator behavior

The mock orchestrator is deterministic and offline.

It can route by keywords. Examples:

- `presupuesto` -> `mock.resource.read`
- `estimate` -> `mock.resource.read`
- `cliente` -> `mock.resource.read`

It may also be force-routed in tests. That is deliberate and models a proposal phase, not a real assistant.

The mock orchestrator never emits:

- business data
- prices
- amounts
- real ids
- real dates
- real states
- evidence
- `SourceEvidence`
- `CapabilityInvocationResult`
- `ResourceResult`

If any claimed fields appear, the boundary ignores them.

## 5. Boundary behavior

The orchestration boundary receives an `OrchestrationRequest`, calls the `OrchestratorPort`, validates the proposal, and either:

1. fails closed;
2. returns `no_proposal` honestly;
3. returns `denied` for unknown or inactive capability;
4. returns `blocked` for invalid or incomplete params;
5. executes the governed workflow when the proposal is valid.

The boundary does not invent output. It only forwards the runtime result when execution is allowed.

## 6. Evidence chain

M8 records the full chain of orchestration evidence.

Expected sequences:

### Happy path

- `orchestration_requested`
- `orchestration_proposal_created`
- `orchestration_proposal_validated`
- `workflow_invocation_requested`
- governed workflow runtime evidence
- `workflow_response_created`

### No proposal

- `orchestration_requested`
- `orchestration_no_proposal`
- `workflow_response_created`

### Denied

- `orchestration_requested`
- `orchestration_proposal_created`
- `orchestration_proposal_denied`
- `workflow_response_created`

### Claimed result ignored

- `orchestration_requested`
- `orchestration_proposal_created`
- `orchestration_claimed_result_ignored`
- `orchestration_proposal_validated`
- governed workflow runtime evidence
- `workflow_response_created`

## 7. Relation to M5, M6 and M7

M8 sits above the governed workflow stack:

- M5 gives the mock workflow skeleton.
- M6 gives the generic external read adapter contract.
- M7 gives the first real read adapter module.

M8 proves that a proposal can enter the workflow boundary and end in a response that comes only from the runtime path. It does not replace M5/M6/M7; it composes them.

## 8. Installation and capability activation

M8 is linked to ADR-0002 by validating whether a capability is active in the installation.

Rules:

- capability active in installation -> may execute if params and policy are valid;
- capability unknown -> `denied`;
- capability inactive in installation -> `denied`;
- invalid params -> `blocked` or `error`;
- no fallback to a default provider.

The installation can be modeled in memory. There is no plugin marketplace and no dynamic plugin runtime.

## 9. Fail-closed behavior

M8 fails closed when:

- organization is missing;
- principal is missing;
- user message is empty;
- orchestrator is unavailable;
- no proposal is produced;
- capability is unknown;
- capability is inactive in the installation;
- params are invalid or incomplete;
- a proposal tries to smuggle a claimed result;
- the runtime returns `not_found`;
- the runtime returns `unavailable`;
- the runtime returns `error`.

## 10. What M8 does not implement

M8 does not implement:

- Qwen real
- endpoint OpenAI-compatible
- Telegram
- bot real
- LLM real
- network
- definitive database
- writing
- effects
- Gmail
- anti-fragmentation from RFC-0010
- real persistence

It remains an offline mock boundary with in-memory routing and runtime composition.

## 11. How to run

```bash
npm install
npm run typecheck
npm test
git diff --check
```

## 12. Debt for M9 and M10

The next milestones can harden the orchestration seam, add richer proposal policies, and expand operational documentation without changing the principle that the proposal is untrusted and the runtime remains the only source of authoritative results.
