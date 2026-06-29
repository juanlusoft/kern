import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreM1Environment, executeGovernedRequest } from '../src/index';
import type { CoreRequest } from '../../contracts/src/index';

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'req-core',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'core test',
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
    correlation_id: 'corr-core',
    ...overrides
  };
}

test('core orchestrator allows a valid governed request and creates a binding', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(createRequest(), environment);

  assert.equal(result.status, 'allowed');
  assert.equal(result.organization_context.organization_id, 'org-acme');
  assert.equal(result.correlation_id, 'corr-core');
  assert.equal(result.binding?.organization_id, 'org-acme');
  assert.equal(result.binding?.binding_state, 'created');
  assert.equal(result.evidence_records.some((record) => record.record_type === 'organization_resolved'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'identity_resolved'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'intent'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'policy_decision'), true);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'binding_created'), true);
});

test('core orchestrator fails closed when organization is missing', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    createRequest({
      organization_hint: null,
      principal_hint: 'human-001'
    }),
    environment
  );

  assert.equal(result.status, 'failed_closed');
});

test('core orchestrator fails closed when principal is not a member of the organization', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    createRequest({
      principal_hint: 'human-foreign'
    }),
    environment
  );

  assert.equal(result.status, 'failed_closed');
});

test('core orchestrator fails closed when principal lacks permission for the organization', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    createRequest({
      principal_hint: 'human-limited'
    }),
    environment
  );

  assert.equal(result.status, 'failed_closed');
});

test('core orchestrator denies explicit deny actions', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    createRequest({
      payload: {
        ...createRequest().payload,
        flags: {
          ...createRequest().payload.flags,
          force_policy_deny: true
        }
      }
    }),
    environment
  );

  assert.equal(result.status, 'denied');
  assert.equal(result.binding, null);
  assert.equal(result.evidence_records.some((record) => record.record_type === 'execution_blocked'), true);
});
