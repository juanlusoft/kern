import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { createCoreM1Environment, executeGovernedRequest } from '../../core/src/index';
import { createPolicyDecision, type CoreRequest } from '../../contracts/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';

function createPayload(
  overrides: Partial<CoreRequest['payload']> = {},
  flags: Partial<CoreRequest['payload']['flags']> = {}
): CoreRequest['payload'] {
  return {
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
      agent_selected_organization: false,
      ...flags
    },
    ...overrides
  };
}

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'm2-request',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'M2 governed request',
    payload: createPayload(),
    requires_binding: true,
    correlation_id: 'corr-m2',
    ...overrides
  };
}

test('M2 core execution records organization, identity, intent, policy decision and binding created evidence', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(createRequest(), environment);

  assert.equal(result.status, 'allowed');
  assert.deepEqual(
    result.evidence_records.map((record) => record.record_type),
    ['organization_resolved', 'intent', 'identity_resolved', 'policy_decision', 'binding_created']
  );
  assert.equal(result.binding?.binding_state, 'created');
});

test('M2 policy deny records intent, policy decision and execution blocked without binding', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    createRequest({
      payload: createPayload({}, { force_policy_deny: true })
    }),
    environment
  );

  assert.equal(result.status, 'denied');
  assert.equal(result.binding, null);
  assert.deepEqual(
    result.evidence_records.map((record) => record.record_type),
    ['organization_resolved', 'intent', 'identity_resolved', 'policy_decision', 'execution_blocked']
  );
});

test('M2 failed closed preserves evidence when the request reaches policy evaluation', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    createRequest({
      request_id: '',
      payload: createPayload({}, { missing_critical_attribute: true })
    }),
    environment
  );

  assert.equal(result.status, 'failed_closed');
  assert.equal(result.binding, null);
  assert.deepEqual(
    result.evidence_records.map((record) => record.record_type),
    ['organization_resolved', 'intent', 'identity_resolved', 'policy_decision', 'failed_closed']
  );
});

test('M2 binding validation returns structured rejection and validation evidence data', () => {
  const store = new InMemoryDecisionBindingStore();
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'acme',
    principal_hint: 'human-001',
    payload: createPayload()
  });
  const identityContext = resolveIdentityContext(
    {
      principal_hint: 'human-001',
      payload: createPayload()
    },
    organizationContext
  );
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'm2-validation'
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
      payload: createPayload({ amount: 2 })
    }),
    organizationContext,
    identityContext
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.record_type, 'binding_rejected');
  assert.equal(validation.reason, 'fingerprint_mismatch');
  assert.equal(validation.evidence_reference, 'evidence-1');
});

test('M2 evidence ledger and validation keep correlation data available for later evidence writes', () => {
  const ledger = new InMemoryEvidenceLedger();
  const orgRecord = ledger.append(
    {
      evidence_id: 'placeholder',
      organization_id: 'org-acme',
      correlation_id: 'corr-m2',
      record_type: 'organization_resolved',
      subject: 'org-acme',
      created_at: '2026-06-28T00:00:00.000Z',
      sequence: 0,
      data: { source: 'fixture' }
    }
  );
  const policyRecord = ledger.append(
    {
      evidence_id: 'placeholder',
      organization_id: 'org-acme',
      correlation_id: 'corr-m2',
      record_type: 'policy_decision',
      subject: 'allow',
      created_at: '2026-06-28T00:00:01.000Z',
      sequence: 0,
      data: { decision_id: 'decision-1' }
    }
  );

  assert.equal(orgRecord.sequence, 1);
  assert.equal(policyRecord.sequence, 2);
  assert.deepEqual(
    ledger.listByCorrelation('corr-m2').map((record) => record.record_type),
    ['organization_resolved', 'policy_decision']
  );
});
