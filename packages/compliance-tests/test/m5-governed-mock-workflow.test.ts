import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';

function buildRuntime(): InMemoryGovernedWorkflowRuntime {
  return new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });
}

test('M5 read flow returns only runtime data and keeps the workflow trace intact', () => {
  const runtime = buildRuntime();
  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'm5-read-compliance',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m5-read-compliance',
    estimate_id: 'estimate-123',
    claimed_result: { fake: true },
    claimed_output: { fake: true }
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.capability_result?.executed_by_runtime, true);
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
  assert.equal(result.response.data?.fake, undefined);
  assert.equal(records.some((record) => record.record_type === 'intent'), true);
  assert.equal(records.some((record) => record.record_type === 'policy_decision'), true);
  assert.equal(records.some((record) => record.record_type === 'turn_created'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_completed'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
});

test('M5 effect flow blocks when approval is denied and never invokes the send capability', () => {
  const runtime = buildRuntime();
  const result = runtime.executeWorkflow({
    kind: 'mock.email.send',
    workflow_id: 'm5-email-compliance',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m5-email-compliance',
    to: 'customer@example.com',
    subject: 'Quarterly update',
    body: 'Please review the quarterly update.',
    approval_decision: 'denied'
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'blocked');
  assert.equal(result.response.response_source, 'workflow_blocked');
  assert.equal(result.capability_result, null);
  assert.equal(records.some((record) => record.record_type === 'preview_created'), true);
  assert.equal(records.some((record) => record.record_type === 'approval_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'effect_blocked'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_denied' && record.subject === 'mock.email.send'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_started' && record.subject === 'mock.email.send'), false);
});
