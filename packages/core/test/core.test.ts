import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreM1Environment, executeGovernedRequest } from '../src/index';

test('core orchestrator allows a valid governed request and creates a binding', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    {
      request_id: 'req-core-allow',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'governed.read',
      purpose: 'core allow',
      payload: {},
      requires_binding: true,
      correlation_id: 'corr-core-allow'
    },
    environment
  );

  assert.equal(result.status, 'allowed');
  assert.equal(result.organization_context.organization_id, 'org-acme');
  assert.equal(result.correlation_id, 'corr-core-allow');
  assert.equal(result.binding?.organization_id, 'org-acme');
  assert.match(result.evidence_records.map((record) => record.record_type).join(','), /intent/);
  assert.match(result.evidence_records.map((record) => record.record_type).join(','), /policy_decision/);
});

test('core orchestrator fails closed when organization is missing', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    {
      request_id: 'req-core-org-missing',
      organization_hint: null,
      principal_hint: 'human-001',
      action: 'governed.read',
      purpose: 'core fail closed',
      payload: {},
      requires_binding: false,
      correlation_id: 'corr-core-org-missing'
    },
    environment
  );

  assert.equal(result.status, 'failed_closed');
});

test('core orchestrator denies explicit deny actions', () => {
  const environment = createCoreM1Environment();
  const result = executeGovernedRequest(
    {
      request_id: 'req-core-deny',
      organization_hint: 'acme',
      principal_hint: 'human-001',
      action: 'deny.governed',
      purpose: 'core deny',
      payload: {},
      requires_binding: false,
      correlation_id: 'corr-core-deny'
    },
    environment
  );

  assert.equal(result.status, 'denied');
});
