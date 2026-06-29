import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreM1Environment, executeGovernedRequest } from '../src/index';
import { createPolicyDecision } from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import { evaluatePolicy } from '../../policy/src/index';

test('M1 positive governed request returns allowed', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest({
    request_id: 'm1-positive',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'positive path',
    payload: {},
    requires_binding: true,
    correlation_id: 'corr-m1-positive'
  }, environment);

  assert.equal(result.status, 'allowed');
  assert.equal(result.organization_context.organization_id, 'org-acme');
  assert.equal(result.identity_context.principal_id, 'human-001');
  assert.equal(result.binding?.binding_state, 'active');
  assert.equal(result.evidence_records.some((record) => record.record_type === 'intent'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'policy_decision'), true);
});

test('M1 fails closed when organization is absent', () => {
  const result = executeGovernedRequest({
    request_id: 'm1-org-missing',
    organization_hint: null,
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'missing organization',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-org-missing'
  });
  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when organization is ambiguous', () => {
  const result = executeGovernedRequest({
    request_id: 'm1-org-ambiguous',
    organization_hint: 'shared',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'ambiguous org',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-org-ambiguous'
  });
  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when organization is inactive', () => {
  const result = executeGovernedRequest({
    request_id: 'm1-org-inactive',
    organization_hint: 'archived',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'inactive org',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-org-inactive'
  });
  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when identity is absent or revoked', () => {
  const missingIdentity = executeGovernedRequest({
    request_id: 'm1-identity-missing',
    organization_hint: 'acme',
    principal_hint: null,
    action: 'governed.read',
    purpose: 'missing identity',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-identity-missing'
  });
  const revokedIdentity = executeGovernedRequest({
    request_id: 'm1-identity-revoked',
    organization_hint: 'acme',
    principal_hint: 'revoked-human',
    action: 'governed.read',
    purpose: 'revoked identity',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-identity-revoked'
  });

  assert.equal(missingIdentity.status, 'failed_closed');
  assert.equal(revokedIdentity.status, 'failed_closed');
});

test('M1 denies when scope is missing', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest({
    request_id: 'm1-scope-missing',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'missing scope',
    payload: { required_scope: 'missing:scope' },
    requires_binding: false,
    correlation_id: 'corr-m1-scope-missing'
  }, environment);

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when an agent attempts to choose an organization arbitrarily', () => {
  const result = executeGovernedRequest({
    request_id: 'm1-agent-org-choice',
    organization_hint: 'agent-selected-org',
    principal_hint: 'agent-001',
    action: 'governed.read',
    purpose: 'arbitrary org choice',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-agent-org-choice'
  });

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when an agent attempts to impersonate a human', () => {
  const result = executeGovernedRequest({
    request_id: 'm1-agent-impersonation',
    organization_hint: 'acme',
    principal_hint: 'agent-001',
    action: 'governed.read',
    purpose: 'impersonation',
    payload: { claimed_principal_type: 'human' },
    requires_binding: false,
    correlation_id: 'corr-m1-agent-impersonation'
  });

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when delegated identity exceeds principal authority', () => {
  const result = executeGovernedRequest({
    request_id: 'm1-delegated-overreach',
    organization_hint: 'acme',
    principal_hint: 'service-overreach',
    action: 'governed.read',
    purpose: 'delegated overreach',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-delegated-overreach'
  });

  assert.equal(result.status, 'failed_closed');
});

test('M1 fails closed when a policy critical attribute is missing', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest({
    request_id: '',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'critical attribute missing',
    payload: {},
    requires_binding: false,
    correlation_id: 'corr-m1-critical-attribute'
  }, environment);

  assert.equal(result.status, 'failed_closed');
});

test('M1 denies explicit deny policy decisions and does not create bindings', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest({
    request_id: 'm1-deny',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'deny.governed',
    purpose: 'deny',
    payload: {},
    requires_binding: true,
    correlation_id: 'corr-m1-deny'
  }, environment);

  assert.equal(result.status, 'denied');
  assert.equal(result.binding, null);
});

test('M1 blocks incomplete obligations', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest({
    request_id: 'm1-obligation-incomplete',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'obligations',
    payload: { obligation_rule: 'required', obligations_completed: false },
    requires_binding: false,
    correlation_id: 'corr-m1-obligation-incomplete'
  }, environment);

  assert.equal(result.status, 'failed_closed');
});

test('M1 binding store rejects invalid bindings from other organizations and replay', () => {
  const store = new InMemoryDecisionBindingStore();
  const org = resolveOrganizationContext({ organization_hint: 'acme' });
  const identity = resolveIdentityContext({ principal_hint: 'human-001', payload: {} }, org);
  const policyDecision = createPolicyDecision({
    outcome: 'allow',
    decision_reason: 'allow',
    seed: 'm1-binding'
  });
  const request = {
    request_id: 'm1-binding',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'binding validation',
    payload: {},
    requires_binding: true,
    correlation_id: 'corr-m1-binding'
  };

  const binding = store.createBinding({
    request,
    organizationContext: org,
    identityContext: identity,
    policyDecision,
    evidence_reference: 'evidence-1'
  });

  const wrongOrg = resolveOrganizationContext({ organization_hint: 'archived' });
  assert.equal(
    store.validateBinding({ binding, request, organizationContext: wrongOrg, identityContext: identity }).valid,
    false
  );

  store.consumeBinding(binding.binding_id);
  assert.equal(store.validateBinding({ binding, request, organizationContext: org, identityContext: identity }).valid, false);
});
