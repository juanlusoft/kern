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

test('binding store creates created bindings and validates them to validated', () => {
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

  assert.equal(binding.binding_state, 'created');
  assert.equal(validation.valid, true);
  assert.equal(validation.invalid, false);
  assert.equal(validation.reason, undefined);
  assert.equal(validation.binding?.binding_state, 'validated');
  assert.equal(validation.record_type, 'binding_validated');
  assert.equal(validation.evidence_reference, 'evidence-1');
});

test('binding store rejects a missing binding', () => {
  const store = new InMemoryDecisionBindingStore();
  const validation = store.validateBinding({
    binding: null,
    request: createRequest(),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.invalid, true);
  assert.equal(validation.reason, 'missing_binding');
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
  assert.equal(validation.reason, 'wrong_organization');
  assert.equal(validation.binding?.binding_state, 'rejected');
});

test('binding store rejects a binding from another principal', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-principal'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const otherIdentity = resolveIdentityContext(
    {
      principal_hint: 'agent-001',
      payload: createRequest().payload
    },
    organizationContext
  );
  const validation = store.validateBinding({
    binding,
    request: createRequest(),
    organizationContext,
    identityContext: otherIdentity
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'wrong_principal');
});

test('binding store rejects a binding with another correlation', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-correlation'
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
      correlation_id: 'corr-other'
    }),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'wrong_correlation');
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
  assert.equal(validation.reason, 'fingerprint_mismatch');
  assert.equal(validation.binding?.binding_state, 'rejected');
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
    now: () => new Date('2026-05-01T00:00:00.000Z')
  });
  const validation = store.validateBinding({
    binding: { ...binding, expires_at: '2020-01-01T00:00:00.000Z' },
    request: createRequest(),
    organizationContext,
    identityContext,
    now: () => new Date('2026-06-28T00:00:01.000Z')
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'expired');
  assert.equal(validation.binding?.binding_state, 'expired');
});

test('binding store ignores a forged expires_at on input and uses the stored expiration', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-stored-expiration'
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

  assert.equal(validation.valid, true);
  assert.equal(validation.reason, undefined);
  assert.equal(validation.binding?.binding_state, 'validated');
});

test('binding store rejects revoked bindings', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-revoked'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  store.revokeBinding(binding.binding_id);
  const validation = store.validateBinding({
    binding,
    request: createRequest(),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'revoked');
});

test('binding store rejects consumed bindings', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-consumed'
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
  assert.equal(validation.reason, 'consumed');
});

test('binding store rejects bindings without evidence references', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-no-evidence'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const validation = store.validateBinding({
    binding: { ...binding, evidence_reference: '' },
    request: createRequest(),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'missing_evidence_reference');
  assert.equal(validation.record_type, 'binding_rejected');
});

test('binding store rejects bindings that are not stored yet', () => {
  const store = new InMemoryDecisionBindingStore();
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'binding-unknown'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const validation = store.validateBinding({
    binding: { ...binding, binding_id: 'binding-missing-from-store' },
    request: createRequest(),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.invalid, true);
  assert.equal(validation.reason, 'missing_binding');
  assert.equal(validation.binding?.binding_state, 'rejected');
  assert.equal(validation.record_type, 'binding_rejected');
});
