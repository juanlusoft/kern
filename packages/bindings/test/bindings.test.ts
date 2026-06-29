import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryDecisionBindingStore } from '../src/index';
import { createPolicyDecision, type CoreRequest } from '../../contracts/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'req-binding',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'binding test',
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
    correlation_id: 'corr-binding',
    ...overrides
  };
}

const organizationContext = resolveOrganizationContext({
  organization_hint: 'acme',
  principal_hint: 'human-001',
  payload: createRequest().payload
});
const identityContext = resolveIdentityContext(
  {
    principal_hint: 'human-001',
    payload: createRequest().payload
  },
  organizationContext
);

test('binding store creates and validates a governed binding', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-allow'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const validation = store.validateBinding({
    binding,
    request: createRequest(),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, true);
});

test('binding store rejects a binding from another organization', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-org'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const otherOrganization = resolveOrganizationContext({
    organization_hint: 'foreign',
    principal_hint: 'human-foreign',
    payload: createRequest().payload
  });
  const validation = store.validateBinding({
    binding,
    request: createRequest(),
    organizationContext: otherOrganization,
    identityContext
  });

  assert.equal(validation.valid, false);
});

test('binding store rejects expired bindings', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-expired'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1',
    now: () => new Date('2026-06-28T00:00:00.000Z')
  });
  const validation = store.validateBinding({
    binding: { ...binding, expires_at: '2020-01-01T00:00:00.000Z' },
    request: createRequest(),
    organizationContext,
    identityContext,
    now: () => new Date('2026-06-28T00:00:01.000Z')
  });

  assert.equal(validation.valid, false);
});

test('binding store rejects replay after consume', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-replay'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  store.consumeBinding(binding.binding_id);
  const validation = store.validateBinding({
    binding,
    request: createRequest(),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
});

test('binding store rejects payload and fingerprint mismatch', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-fingerprint'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const validation = store.validateBinding({
    binding,
    request: createRequest({
      payload: {
        ...createRequest().payload,
        amount: 2
      }
    }),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
});
