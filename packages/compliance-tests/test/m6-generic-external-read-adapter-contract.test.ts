import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import { createMockExternalReadAdapter, InMemoryExternalReadAdapter } from '../../external-read-adapters/src/index';

function buildRuntime(externalReadAdapter = createMockExternalReadAdapter()) {
  return new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter
  });
}

test('M6 generic external read adapter contract returns found results with source evidence', () => {
  const runtime = buildRuntime();

  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-found',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-found',
    estimate_id: 'estimate-123',
    claimed_result: { caller_claim: true },
    caller_result: { caller_claim: true },
    assistant_result: { assistant_claim: true },
    model_claimed_result: { model_claim: true }
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);
  const capabilityResult = result.capability_result?.output?.result as
    | { status: 'found'; produced_by_adapter: boolean; data: { estimate_id?: string; source?: string }; source_evidence: unknown[] }
    | undefined;

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
  assert.equal(result.response.data?.source, 'mock_runtime');
  assert.equal(result.capability_result?.status, 'executed');
  assert.equal(capabilityResult?.status, 'found');
  assert.equal(capabilityResult?.produced_by_adapter, true);
  assert.ok(capabilityResult?.source_evidence?.length);
  assert.equal(records.some((record) => record.record_type === 'external_read_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'external_read_found'), true);
  assert.equal(records.some((record) => record.record_type === 'source_evidence_recorded'), true);
  assert.equal(records.some((record) => record.record_type === 'external_read_result_bound'), true);
});

test('M6 generic external read adapter contract distinguishes not_found unavailable error and denied or blocked', () => {
  const runtime = buildRuntime(new InMemoryExternalReadAdapter());

  const notFound = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-not-found',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-not-found',
    estimate_id: 'estimate-missing'
  });
  const unavailable = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-unavailable',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-unavailable',
    estimate_id: 'estimate-offline'
  });
  const error = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-error',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-error',
    estimate_id: 'estimate-error'
  });
  const denied = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-denied',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-denied',
    estimate_id: 'estimate-denied'
  });
  const blocked = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-blocked',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-blocked',
    estimate_id: 'estimate-blocked'
  });

  assert.equal(notFound.status, 'not_found');
  assert.equal(notFound.response.data, null);
  assert.equal(
    runtime.getEvidenceLedger().listByCorrelation(notFound.correlation_id).some((record) => record.record_type === 'external_read_not_found'),
    true
  );
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.response.data, null);
  assert.equal(
    runtime.getEvidenceLedger().listByCorrelation(unavailable.correlation_id).some((record) => record.record_type === 'external_read_unavailable'),
    true
  );
  assert.equal(error.status, 'error');
  assert.equal(error.response.data, null);
  assert.equal(
    runtime.getEvidenceLedger().listByCorrelation(error.correlation_id).some((record) => record.record_type === 'external_read_error'),
    true
  );
  assert.equal(denied.status, 'denied');
  assert.equal(denied.response.data, null);
  assert.equal(
    runtime.getEvidenceLedger().listByCorrelation(denied.correlation_id).some((record) => record.record_type === 'external_read_denied'),
    true
  );
  assert.equal(blocked.status, 'denied');
  assert.equal(blocked.response.data, null);
  assert.equal(
    runtime.getEvidenceLedger().listByCorrelation(blocked.correlation_id).some((record) => record.record_type === 'external_read_denied'),
    true
  );
});

test('M6 generic external read adapter contract rejects found without source evidence', () => {
  const adapter = new InMemoryExternalReadAdapter();
  adapter.seedResource({
    organization_id: 'org-acme',
    resource_type: 'estimate',
    resource_id: 'estimate-missing-source-evidence',
    data: {
      estimate_id: 'estimate-missing-source-evidence',
      source: 'mock_runtime'
    },
    scenario: 'found_without_source_evidence'
  });
  const runtime = buildRuntime(adapter);

  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-invalid-found',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-invalid-found',
    estimate_id: 'estimate-missing-source-evidence'
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'error');
  assert.equal(result.response.data, null);
  assert.equal(result.capability_result?.status, 'error');
  assert.equal(result.capability_result?.error, 'found result requires source evidence and data');
  assert.equal(records.some((record) => record.record_type === 'external_read_error'), true);
});

test('M6 generic external read adapter contract ignores caller claimed results', () => {
  const runtime = buildRuntime();

  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m6-claim-ignored',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m6-claim-ignored',
    estimate_id: 'estimate-123',
    claimed_result: {
      estimate_id: 'invented',
      source: 'caller'
    },
    caller_result: {
      estimate_id: 'invented',
      source: 'caller'
    },
    assistant_result: {
      estimate_id: 'invented',
      source: 'caller'
    },
    model_claimed_result: {
      estimate_id: 'invented',
      source: 'caller'
    }
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
  assert.equal(result.response.data?.source, 'mock_runtime');
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
});
