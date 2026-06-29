import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryExternalReadAdapter, createMockExternalReadAdapter } from '../src/index';

function buildQuery(overrides: Record<string, unknown> = {}) {
  return {
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-1',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human' as const,
      delegated_identity: null
    },
    resource_type: 'estimate',
    resource_id: 'estimate-123',
    filters: null,
    requested_fields: ['estimate_id', 'customer_name'],
    ...overrides
  };
}

test('in-memory external read adapter returns found data with source evidence', () => {
  const adapter = createMockExternalReadAdapter();
  const result = adapter.read(buildQuery());

  assert.equal(result.status, 'found');
  assert.equal(result.produced_by_adapter, true);
  assert.equal(result.data?.estimate_id, 'estimate-123');
  assert.ok(result.source_evidence);
  assert.ok(result.source_evidence.length > 0);
  assert.equal(result.source_evidence[0].resource_id, 'estimate-123');
});

test('in-memory external read adapter can simulate not found, unavailable, error, denied and blocked', () => {
  const adapter = new InMemoryExternalReadAdapter();
  const scenarios = [
    ['estimate-missing', 'not_found'],
    ['estimate-offline', 'unavailable'],
    ['estimate-error', 'error'],
    ['estimate-denied', 'denied'],
    ['estimate-blocked', 'blocked']
  ] as const;

  for (const [resource_id, expected] of scenarios) {
    const result = adapter.read(buildQuery({ resource_id }));
    assert.equal(result.status, expected);
    assert.equal(result.data, null);
    assert.equal(result.source_evidence, null);
  }
});

test('in-memory external read adapter can simulate found without source evidence', () => {
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

  const result = adapter.read(buildQuery({ resource_id: 'estimate-missing-source-evidence' }));

  assert.equal(result.status, 'found');
  assert.equal(result.source_evidence.length, 0);
});

test('in-memory external read adapter blocks invalid queries before returning data', () => {
  const adapter = new InMemoryExternalReadAdapter();
  const result = adapter.read(
    buildQuery({
      organization_id: null,
      actor: null
    })
  );

  assert.equal(result.status, 'blocked');
  assert.equal(result.data, null);
  assert.equal(result.source_evidence, null);
});
