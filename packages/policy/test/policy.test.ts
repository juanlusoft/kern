import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy } from '../src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import type { CoreRequest } from '../../contracts/src/index';

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'req-policy',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'read governed data',
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
    correlation_id: 'corr-policy',
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

test('policy engine allows a valid governed request', () => {
  const decision = evaluatePolicy({
    request: createRequest(),
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'allow');
  assert.equal(decision.allow, true);
});

test('policy engine denies explicit deny requests', () => {
  const decision = evaluatePolicy({
    request: createRequest({
      payload: {
        ...createRequest().payload,
        flags: {
          ...createRequest().payload.flags,
          force_policy_deny: true
        }
      }
    }),
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'deny');
});

test('policy engine defers explicit defer requests', () => {
  const decision = evaluatePolicy({
    request: createRequest({
      payload: {
        ...createRequest().payload,
        flags: {
          ...createRequest().payload.flags,
          force_policy_defer: true
        }
      }
    }),
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'defer');
});

test('policy engine fails closed when a critical attribute is missing', () => {
  const decision = evaluatePolicy({
    request: createRequest({
      request_id: '',
      payload: {
        ...createRequest().payload,
        flags: {
          ...createRequest().payload.flags,
          missing_critical_attribute: true
        }
      }
    }),
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'failed_closed');
});

test('policy engine blocks incomplete obligations', () => {
  const decision = evaluatePolicy({
    request: createRequest({
      payload: {
        ...createRequest().payload,
        flags: {
          ...createRequest().payload.flags,
          obligation_incomplete: true
        }
      }
    }),
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'failed_closed');
});

test('policy engine fails closed when the requested scope is missing', () => {
  const decision = evaluatePolicy({
    request: createRequest({
      payload: {
        ...createRequest().payload,
        requested_scope: 'missing:scope'
      }
    }),
    organizationContext,
    identityContext
  });
  assert.equal(decision.outcome, 'failed_closed');
});
