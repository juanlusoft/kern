import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreM1Environment, executeGovernedRequest } from '../src/index';
import { createPolicyDecision, type CoreRequest } from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
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
    request_id: 'm1-request',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'M1 governed request',
    payload: createPayload(),
    requires_binding: true,
    correlation_id: 'corr-m1',
    ...overrides
  };
}

test('M1 positive governed request returns allowed', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(createRequest(), environment);

  assert.equal(result.status, 'allowed');
  assert.equal(result.organization_context.organization_id, 'org-acme');
  assert.equal(result.identity_context.principal_id, 'human-001');
  assert.equal(result.binding?.binding_state, 'created');
  assert.equal(result.evidence_records.some((record) => record.record_type === 'organization_resolved'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'identity_resolved'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'intent'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'policy_decision'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'binding_created'), true);
});

test('M1 fails closed when organization is absent', () => {
  const result = executeGovernedRequest(
    createRequest({
      organization_hint: null
    }),
    createCoreM1Environment()
  );
  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when organization is ambiguous', () => {
  const result = executeGovernedRequest(
    createRequest({
      organization_hint: 'shared'
    }),
    createCoreM1Environment()
  );
  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when organization is inactive', () => {
  const result = executeGovernedRequest(
    createRequest({
      organization_hint: 'archived'
    }),
    createCoreM1Environment()
  );
  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when identity is absent or revoked', () => {
  const missingIdentity = executeGovernedRequest(
    createRequest({
      principal_hint: null
    }),
    createCoreM1Environment()
  );
  const revokedIdentity = executeGovernedRequest(
    createRequest({
      principal_hint: 'revoked-human'
    }),
    createCoreM1Environment()
  );

  assert.equal(missingIdentity.status, 'failed_closed');
  assert.equal(revokedIdentity.status, 'failed_closed');
});

test('M1 denies when requested scope is missing', () => {
  const result = executeGovernedRequest(
    createRequest({
      payload: createPayload({ requested_scope: 'missing:scope' })
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when an agent attempts to choose an organization arbitrarily', () => {
  const result = executeGovernedRequest(
    createRequest({
      principal_hint: 'agent-001',
      organization_hint: 'foreign',
      payload: createPayload({}, { agent_selected_organization: true })
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when an agent attempts to impersonate a human', () => {
  const result = executeGovernedRequest(
    createRequest({
      principal_hint: 'agent-001',
      payload: createPayload({}, { attempt_human_impersonation: true })
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when delegated identity exceeds principal authority', () => {
  const result = executeGovernedRequest(
    createRequest({
      principal_hint: 'service-overreach',
      payload: createPayload({}, { delegated_identity_exceeds_principal: true })
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when a policy critical attribute is missing', () => {
  const result = executeGovernedRequest(
    createRequest({
      request_id: ''
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'failed_closed');
});

test('M1 denies explicit deny policy decisions and does not create bindings', () => {
  const result = executeGovernedRequest(
    createRequest({
      payload: createPayload({}, { force_policy_deny: true })
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'denied');
  assert.equal(result.binding, null);
});

test('M1 blocks incomplete obligations', () => {
  const result = executeGovernedRequest(
    createRequest({
      payload: createPayload({}, { obligation_incomplete: true })
    }),
    createCoreM1Environment()
  );

  assert.equal(result.status, 'failed_closed');
});

test('M1 binding store rejects invalid bindings from other organizations and replay', () => {
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
    seed: 'm1-binding'
  });
  const request = createRequest();
  const binding = store.createBinding({
    request,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });

  const wrongOrg = resolveOrganizationContext({
    organization_hint: 'foreign',
    principal_hint: 'human-foreign',
    payload: createPayload()
  });

  assert.equal(
    store.validateBinding({ binding, request, organizationContext: wrongOrg, identityContext }).valid,
    false
  );

  store.consumeBinding(binding.binding_id);
  assert.equal(store.validateBinding({ binding, request, organizationContext, identityContext }).valid, false);
});

test('M1 binding store rejects payload and fingerprint mismatches', () => {
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
    seed: 'm1-binding-fingerprint'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1'
  });
  const mismatchedRequest = createRequest({
    payload: createPayload({ amount: 2 })
  });

  assert.equal(
    store.validateBinding({ binding, request: mismatchedRequest, organizationContext, identityContext }).valid,
    false
  );
});

test('M1 binding store rejects expired bindings', () => {
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
    seed: 'm1-binding-expired'
  });
  const binding = store.createBinding({
    request: createRequest(),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1',
    now: () => new Date('2026-06-28T00:00:00.000Z')
  });

  assert.equal(
    store.validateBinding({
      binding: { ...binding, expires_at: '2020-01-01T00:00:00.000Z' },
      request: createRequest(),
      organizationContext,
      identityContext,
      now: () => new Date('2026-06-28T00:00:01.000Z')
    }).valid,
    false
  );
});
