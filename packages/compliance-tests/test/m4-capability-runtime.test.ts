import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryCapabilityRuntime } from '../../capabilities/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { InMemoryTurnRuntime } from '../../turns/src/index';
import { createCoreM1Environment, executeGovernedRequest } from '../../core/src/index';
import type { CapabilityDefinition, CoreRequest } from '../../contracts/src/index';

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'm4-request',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'capability.run',
    purpose: 'M4 capability runtime integration',
    payload: {
      resource: 'documents/quarterly',
      operation: 'read',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1,
      flags: {
        force_policy_deny: false,
        force_policy_defer: false,
        missing_critical_attribute: false,
        obligation_incomplete: false,
        attempt_human_impersonation: false,
        delegated_identity_exceeds_principal: false,
        agent_selected_organization: false
      }
    },
    requires_binding: true,
    correlation_id: 'corr-m4',
    ...overrides
  };
}

function createCapabilityDefinition(): CapabilityDefinition {
  return {
    capability_id: 'cap-governed-read',
    organization_id: 'org-acme',
    title: 'Governed Read',
    description: 'Read a governed document through the capability runtime skeleton.',
    kind: 'effectful',
    version: '1.0.0',
    enabled: true,
    approval_requirement: {
      required: true,
      reason: 'binding required',
      binding_required: true
    },
    mock: {
      invoke(input) {
        return {
          status: 'executed',
          output: {
            capability_id: input.capability_id,
            status: 'executed',
            result: {
              resource: input.input.payload.resource,
              requested_scope: [...input.input.requested_scope],
              binding_id: input.binding_id ?? input.decision_binding_id ?? null
            },
            processed_at: '2026-06-29T00:00:00.000Z'
          },
          error: null
        };
      }
    }
  };
}

test('M4 core integration executes a capability through the in-memory runtime', () => {
  const ledger = new InMemoryEvidenceLedger();
  const bindingStore = new InMemoryDecisionBindingStore();
  const capabilityRuntime = new InMemoryCapabilityRuntime({
    evidenceLedger: ledger,
    bindingStore,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });
  const turnRuntime = new InMemoryTurnRuntime({
    evidenceLedger: ledger,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  capabilityRuntime.registerCapability(createCapabilityDefinition());

  const request = createRequest({
    capability_invocation: {
      capability_id: 'cap-governed-read',
      organization_id: 'org-acme',
      principal_id: 'human-001',
      correlation_id: 'corr-m4',
      input: {
        purpose: 'M4 capability runtime integration',
        requested_scope: ['read:knowledge'],
        payload: {
          resource: 'documents/quarterly',
          operation: 'read'
        }
      },
      approval_requirement: {
        required: true,
        reason: 'binding required',
        binding_required: true
      },
      evidence_reference: 'capability-evidence',
      requested_at: '2026-06-29T00:00:00.000Z'
    }
  });

  const environment = createCoreM1Environment({
    evidenceLedger: ledger,
    bindingStore,
    capabilityRuntime,
    turnRuntime,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const result = executeGovernedRequest(request, environment);
  const turn = result.turn_id ? turnRuntime.getTurn(result.turn_id) : undefined;

  assert.equal(result.status, 'allowed');
  assert.ok(result.turn_id);
  assert.ok(result.capability_invocation_id);
  assert.equal(result.capability_result?.status, 'executed');
  assert.equal(result.capability_result?.runtime_decision, 'executed');
  assert.equal(result.capability_result?.executed_by_runtime, true);
  assert.equal(result.capability_result?.binding_id, result.binding?.binding_id);
  assert.ok(result.capability_result?.evidence_links.length);
  assert.equal(result.capability_result?.decision_binding_id, result.binding?.binding_id);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'capability_invocation_completed'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'turn_created'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'binding_created'), true);
  assert.equal(turn?.pending_effects.some((effect) => effect.state === 'succeeded'), true);
  assert.equal(bindingStore.get(result.binding!.binding_id)?.binding_state, 'consumed');
});

test('M4 core integration keeps capability requests visible when runtime is absent', () => {
  const ledger = new InMemoryEvidenceLedger();
  const bindingStore = new InMemoryDecisionBindingStore();
  const turnRuntime = new InMemoryTurnRuntime({
    evidenceLedger: ledger,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const environment = createCoreM1Environment({
    evidenceLedger: ledger,
    bindingStore,
    turnRuntime,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const result = executeGovernedRequest(
    createRequest({
      capability_invocation: {
        capability_id: 'cap-governed-read',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        correlation_id: 'corr-m4-missing-runtime',
        input: {
          purpose: 'M4 capability runtime integration',
          requested_scope: ['read:knowledge'],
          payload: {
            resource: 'documents/quarterly',
            operation: 'read'
          }
        }
      }
    }),
    environment
  );
  const turn = result.turn_id ? turnRuntime.getTurn(result.turn_id) : undefined;

  assert.equal(result.status, 'allowed');
  assert.equal(result.capability_result?.status, 'unavailable');
  assert.equal(result.capability_result?.runtime_decision, 'unavailable');
  assert.equal(result.capability_result?.executed_by_runtime, false);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'capability_invocation_unavailable'), true);
  assert.equal(turn?.unknown_outcomes.some((item) => item.requires_reconciliation), true);
  assert.equal(
    turnRuntime.transitionTurn({
      turn_id: result.turn_id!,
      to_state: 'completed',
      reason: 'attempted completion after unavailable capability'
    }).valid,
    false
  );
});
