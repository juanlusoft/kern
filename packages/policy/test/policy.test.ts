import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy } from '../src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';

const organizationContext = resolveOrganizationContext({ organization_hint: 'acme' });
const identityContext = resolveIdentityContext({ principal_hint: 'human-001', payload: {} }, organizationContext);

test('policy engine allows a valid governed request', () => {
  const decision = evaluatePolicy({
    request: {
      request_id: 'req-allow',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'governed.read',
      purpose: 'read governed data',
      payload: {},
      requires_binding: true,
      correlation_id: 'corr-allow'
    },
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'allow');
  assert.equal(decision.allow, true);
});

test('policy engine denies explicit deny requests', () => {
  const decision = evaluatePolicy({
    request: {
      request_id: 'req-deny',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'deny.governed',
      purpose: 'deny test',
      payload: {},
      requires_binding: false,
      correlation_id: 'corr-deny'
    },
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'deny');
});

test('policy engine defers explicit defer requests', () => {
  const decision = evaluatePolicy({
    request: {
      request_id: 'req-defer',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'defer.governed',
      purpose: 'defer test',
      payload: {},
      requires_binding: false,
      correlation_id: 'corr-defer'
    },
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'defer');
});

test('policy engine fails closed when a critical attribute is missing', () => {
  const decision = evaluatePolicy({
    request: {
      request_id: '',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'governed.read',
      purpose: 'read governed data',
      payload: {},
      requires_binding: false,
      correlation_id: 'corr-failed'
    },
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'failed_closed');
});

test('policy engine blocks incomplete obligations', () => {
  const decision = evaluatePolicy({
    request: {
      request_id: 'req-obligation',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'governed.read',
      purpose: 'read governed data',
      payload: { obligation_rule: 'required', obligations_completed: false },
      requires_binding: false,
      correlation_id: 'corr-obligation'
    },
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'failed_closed');
});
