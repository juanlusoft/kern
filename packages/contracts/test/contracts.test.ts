import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceRecord,
  fingerprintCapabilityInput,
  fingerprintCapabilityInvocation,
  fingerprintCoreRequest,
  normalizeCorrelationId,
  normalizeResourceQuery,
  normalizeRequestedScope,
  stableStringify,
  toBindingPayloadReference,
  toPolicyInputAttributes,
  validateResourceResult,
  type CapabilityInvocationRequest,
  type CoreRequest
} from '../src/index';

const payload = {
  resource: 'customers/42',
  operation: 'read',
  requested_scope: 'read:knowledge',
  classification: 'internal',
  destination: 'core',
  amount: 1,
  flags: {
    force_policy_deny: false,
    force_policy_defer: false
  }
} as const;

test('normalizeCorrelationId prefers correlation_id when present', () => {
  assert.equal(normalizeCorrelationId({ request_id: 'req-1', correlation_id: 'corr-1' }), 'corr-1');
});

test('normalizeCorrelationId falls back to request_id', () => {
  assert.equal(normalizeCorrelationId({ request_id: 'req-2', correlation_id: null }), 'req-2');
});

test('normalizeRequestedScope converts scalar and array scopes into an explicit list', () => {
  assert.deepEqual(normalizeRequestedScope('read:knowledge'), ['read:knowledge']);
  assert.deepEqual(normalizeRequestedScope(['read:knowledge', 'audit:read']), ['read:knowledge', 'audit:read']);
});

test('typed payload helpers preserve M1 shape', () => {
  const policyInput = toPolicyInputAttributes(payload);
  const bindingReference = toBindingPayloadReference(payload);

  assert.deepEqual(policyInput.requested_scope, ['read:knowledge']);
  assert.deepEqual(bindingReference.requested_scope, ['read:knowledge']);
  assert.equal(policyInput.resource, 'customers/42');
  assert.equal(policyInput.operation, 'read');
});

test('fingerprintCoreRequest is deterministic for equivalent typed payloads', () => {
  const requestA: CoreRequest = {
    request_id: 'req-3',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'demo',
    payload,
    requires_binding: true,
    correlation_id: 'corr-3'
  };
  const requestB: CoreRequest = {
    ...requestA,
    payload: {
      ...payload,
      flags: { ...payload.flags }
    }
  };
  assert.equal(
    fingerprintCoreRequest({ request: requestA, organization_id: 'org-acme', principal_id: 'human-001' }),
    fingerprintCoreRequest({ request: requestB, organization_id: 'org-acme', principal_id: 'human-001' })
  );
});

test('stableStringify sorts object keys', () => {
  assert.equal(stableStringify({ z: 1, a: 2 }), '{"a":2,"z":1}');
});

test('createEvidenceRecord accepts explicit sequence and defaults safely', () => {
  const record = createEvidenceRecord({
    organization_id: 'org-acme',
    correlation_id: 'corr-sequence',
    record_type: 'intent',
    subject: 'governed.read',
    data: { request_id: 'req-sequence' },
    sequence: 7
  });

  assert.equal(record.sequence, 7);
  assert.equal(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-sequence',
      record_type: 'intent',
      subject: 'governed.read',
      data: { request_id: 'req-sequence' }
    }).sequence,
    0
  );
});

test('capability fingerprint helpers remain deterministic', () => {
  const capabilityInput = {
    purpose: 'governed capability',
    payload: { nested: { b: 2, a: 1 } },
    requested_scope: ['scope:b', 'scope:a']
  };

  const capabilityInvocation: CapabilityInvocationRequest = {
    capability_id: 'cap-1',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    correlation_id: 'corr-cap',
    input: capabilityInput,
    binding_id: 'binding-1',
    policy_decision_id: 'decision-1',
    approval_requirement: {
      required: true,
      reason: 'binding required',
      binding_required: true
    },
    evidence_reference: 'evidence-1',
    requested_at: '2026-06-29T00:00:00.000Z'
  };

  assert.equal(fingerprintCapabilityInput(capabilityInput), fingerprintCapabilityInput({
    ...capabilityInput,
    payload: { nested: { a: 1, b: 2 } },
    requested_scope: ['scope:a', 'scope:b']
  }));
  assert.equal(
    fingerprintCapabilityInvocation(capabilityInvocation),
    fingerprintCapabilityInvocation({
      ...capabilityInvocation,
      input: {
        ...capabilityInvocation.input,
        payload: { nested: { a: 1, b: 2 } },
        requested_scope: ['scope:a', 'scope:b']
      }
    })
  );
});

test('normalizeResourceQuery preserves query shape while ignoring claimed results', () => {
  const query = normalizeResourceQuery({
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-resource',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    resource_type: 'estimate',
    resource_id: 'estimate-123',
    filters: { status: 'open' },
    requested_fields: ['estimate_id', 'customer_name'],
    claimed_result: { injected: true },
    model_claimed_result: { injected: true },
    caller_result: { injected: true },
    assistant_result: { injected: true }
  });

  assert.equal(query.query_id, 'query-1');
  assert.equal(query.organization_id, 'org-acme');
  assert.equal(query.actor?.principal_id, 'human-001');
  assert.equal(query.claimed_result && typeof query.claimed_result === 'object', true);
  assert.equal(query.model_claimed_result && typeof query.model_claimed_result === 'object', true);
  assert.equal(query.caller_result && typeof query.caller_result === 'object', true);
  assert.equal(query.assistant_result && typeof query.assistant_result === 'object', true);
});

test('validateResourceResult rejects found results without source evidence', () => {
  const result = validateResourceResult({
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-resource',
    resource_type: 'estimate',
    resource_id: 'estimate-123',
    created_at: '2026-06-29T00:00:00.000Z',
    evidence_links: [],
    produced_by_adapter: true,
    status: 'found',
    data: { estimate_id: 'estimate-123' },
    source_evidence: [] as unknown as [never, ...never[]],
    error: null,
    decision: {
      query_id: 'query-1',
      adapter_id: 'mock.external.read',
      source_system: 'mock.external.system',
      status: 'found',
      reason: 'resource found',
      authorization: {
        adapter_id: 'mock.external.read',
        source_system: 'mock.external.system',
        organization_id: 'org-acme',
        correlation_id: 'corr-resource',
        actor: {
          principal_id: 'human-001',
          principal_type: 'human',
          delegated_identity: null
        },
        authorized: true,
        reason: 'resource found'
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.equal(result.data, null);
});

test('validateResourceResult preserves valid found results and clones source evidence', () => {
  const found = validateResourceResult({
    query_id: 'query-2',
    organization_id: 'org-acme',
    correlation_id: 'corr-resource-2',
    resource_type: 'estimate',
    resource_id: 'estimate-456',
    created_at: '2026-06-29T00:00:00.000Z',
    evidence_links: ['source-1'],
    produced_by_adapter: true,
    status: 'found',
    data: {
      estimate_id: 'estimate-456',
      source: 'mock_runtime'
    },
    source_evidence: [
      {
        source_id: 'source-1',
        source_type: 'record',
        source_system: 'mock.external.system',
        resource_id: 'estimate-456',
        record_id: 'estimate-456#1',
        field_path: 'estimate_id',
        observed_at: '2026-06-29T00:00:00.000Z',
        correlation_id: 'corr-resource-2'
      }
    ],
    error: null,
    decision: {
      query_id: 'query-2',
      adapter_id: 'mock.external.read',
      source_system: 'mock.external.system',
      status: 'found',
      reason: 'resource found',
      authorization: {
        adapter_id: 'mock.external.read',
        source_system: 'mock.external.system',
        organization_id: 'org-acme',
        correlation_id: 'corr-resource-2',
        actor: {
          principal_id: 'human-001',
          principal_type: 'human',
          delegated_identity: null
        },
        authorized: true,
        reason: 'resource found'
      }
    }
  });

  assert.equal(found.status, 'found');
  assert.equal(found.produced_by_adapter, true);
  assert.equal(found.source_evidence?.[0].source_id, 'source-1');
  assert.notEqual(found.source_evidence?.[0], undefined);
});
