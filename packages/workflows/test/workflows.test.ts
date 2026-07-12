import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryGovernedWorkflowRuntime,
  createMockEmailPreviewCapability,
  createMockEmailSendCapability,
  createMockEstimateReadCapability
} from '../src/index';
import { createMockExternalReadAdapter } from '../../external-read-adapters/src/index';

function buildRuntime(): InMemoryGovernedWorkflowRuntime {
  return new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });
}

test('mock estimate read completes from runtime output and ignores caller claims', () => {
  const runtime = buildRuntime();
  runtime.registerCapability(createMockEstimateReadCapability());

  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-read-1',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-read-1',
    estimate_id: 'estimate-123',
    customer_id: 'customer-001',
    claimed_result: { injected: true },
    claimed_output: { injected: true },
    caller_result: { injected: true },
    assistant_result: { injected: true },
    model_claimed_result: { injected: true }
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.capability_result?.status, 'executed');
  assert.equal(result.capability_result?.executed_by_runtime, true);
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
  assert.equal(result.response.data?.source, 'mock_runtime');
  assert.equal(result.response.data?.customer_name, 'Acme Customer');
  assert.equal(result.response.data?.injected, undefined);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_completed'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
});

test('mock estimate read returns not_found without inventing estimate data', () => {
  const runtime = buildRuntime();

  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-read-2',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-read-2',
    estimate_id: 'estimate-missing'
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'not_found');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.capability_result?.status, 'not_found');
  assert.equal(result.response.data, null);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_not_found'), true);
});

test('mock estimate read denies unknown and foreign organizations without invoking a mock', () => {
  const runtime = buildRuntime();

  const unknownCapability = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-read-3',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-read-3',
    estimate_id: 'estimate-123',
    capability_id: 'mock.estimate.read.unknown'
  });
  const foreignOrganization = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-read-4',
    organization_hint: 'foreign',
    principal_hint: 'human-foreign',
    correlation_id: 'corr-read-4',
    estimate_id: 'estimate-123'
  });

  assert.equal(unknownCapability.status, 'denied');
  assert.equal(unknownCapability.capability_result?.status, 'denied');
  assert.equal(unknownCapability.capability_result?.executed_by_runtime, true);
  assert.equal(foreignOrganization.status, 'denied');
  assert.equal(foreignOrganization.capability_result?.status, 'denied');
  assert.equal(foreignOrganization.capability_result?.executed_by_runtime, true);
  assert.equal(
    runtime
      .getEvidenceLedger()
      .listByCorrelation(unknownCapability.correlation_id)
      .some((record) => record.record_type === 'capability_invocation_denied'),
    true
  );
});

test('mock estimate read can route through the generic external read adapter port', () => {
  const runtime = new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: createMockExternalReadAdapter({
      now: () => new Date('2026-06-29T00:00:00.000Z')
    })
  });

  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-read-adapter',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-read-adapter',
    estimate_id: 'estimate-123'
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
  assert.equal(records.some((record) => record.record_type === 'external_read_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'external_read_found'), true);
  assert.equal(records.some((record) => record.record_type === 'source_evidence_recorded'), true);
  assert.equal(records.some((record) => record.record_type === 'external_read_result_bound'), true);
});

test('mock email send completes with preview, binding and runtime result only', () => {
  const runtime = buildRuntime();
  runtime.registerCapability(createMockEmailPreviewCapability());
  runtime.registerCapability(createMockEmailSendCapability());

  const result = runtime.executeWorkflow({
    kind: 'mock.email.send',
    workflow_id: 'workflow-email-1',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-email-1',
    to: 'customer@example.com',
    subject: 'Quarterly update',
    body: 'Please review the quarterly update.',
    approval_decision: 'approved'
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.capability_result?.status, 'executed');
  assert.equal(result.capability_result?.executed_by_runtime, true);
  assert.equal(result.response.data?.sent, true);
  assert.equal(result.response.data?.source, 'mock_runtime');
  assert.equal(runtime.getBindingStore().list()[0]?.binding_state, 'consumed');
  assert.equal(runtime.getTurnRuntime().getTurn(result.turn_id!)?.state, 'completed');
  assert.equal(records.some((record) => record.record_type === 'preview_created'), true);
  assert.equal(records.some((record) => record.record_type === 'approval_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'binding_created'), true);
  assert.equal(records.some((record) => record.record_type === 'binding_validated'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_invocation_started' && record.subject === 'mock.email.send'), true);
  assert.equal(records.some((record) => record.record_type === 'capability_result_bound'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
});

test('mock email send blocks when approval is missing or denied', () => {
  const runtime = buildRuntime();

  const blockedByMissingApproval = runtime.executeWorkflow({
    kind: 'mock.email.send',
    workflow_id: 'workflow-email-2',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-email-2',
    to: 'customer@example.com',
    subject: 'Quarterly update',
    body: 'Please review the quarterly update.'
  });
  const blockedByDenial = runtime.executeWorkflow({
    kind: 'mock.email.send',
    workflow_id: 'workflow-email-3',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-email-3',
    to: 'customer@example.com',
    subject: 'Quarterly update',
    body: 'Please review the quarterly update.',
    approval_decision: 'denied'
  });

  assert.equal(blockedByMissingApproval.status, 'blocked');
  assert.equal(blockedByMissingApproval.response.response_source, 'workflow_blocked');
  assert.equal(blockedByMissingApproval.capability_result, null);
  assert.equal(blockedByDenial.status, 'blocked');
  assert.equal(blockedByDenial.response.response_source, 'workflow_blocked');
  assert.equal(blockedByDenial.capability_result, null);
  assert.equal(
    runtime
      .getEvidenceLedger()
      .listByCorrelation(blockedByMissingApproval.correlation_id)
      .some((record) => record.record_type === 'effect_blocked'),
    true
  );
  assert.equal(
    runtime
      .getEvidenceLedger()
      .listByCorrelation(blockedByMissingApproval.correlation_id)
      .some((record) => record.record_type === 'capability_invocation_denied' && record.subject === 'mock.email.send'),
    true
  );
  assert.equal(
    runtime
      .getEvidenceLedger()
      .listByCorrelation(blockedByMissingApproval.correlation_id)
      .some((record) => record.record_type === 'capability_invocation_started' && record.subject === 'mock.email.send'),
    false
  );
});

test('mock email send denies unknown capability or capability outside organization without inventing a send result', () => {
  const runtime = buildRuntime();

  const unknownCapability = runtime.executeWorkflow({
    kind: 'mock.email.send',
    workflow_id: 'workflow-email-4',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-email-4',
    to: 'customer@example.com',
    subject: 'Quarterly update',
    body: 'Please review the quarterly update.',
    approval_decision: 'approved',
    capability_id: 'mock.email.send.unknown'
  });
  const foreignOrganization = runtime.executeWorkflow({
    kind: 'mock.email.send',
    workflow_id: 'workflow-email-5',
    organization_hint: 'foreign',
    principal_hint: 'human-foreign',
    correlation_id: 'corr-email-5',
    to: 'customer@example.com',
    subject: 'Quarterly update',
    body: 'Please review the quarterly update.',
    approval_decision: 'approved'
  });

  assert.equal(unknownCapability.status, 'denied');
  assert.equal(unknownCapability.capability_result?.status, 'denied');
  assert.equal(foreignOrganization.status, 'denied');
  assert.equal(foreignOrganization.capability_result?.status, 'denied');
  assert.equal(unknownCapability.response.data, null);
  assert.equal(foreignOrganization.response.data, null);
});
