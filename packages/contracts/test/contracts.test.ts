import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceRecord,
  fingerprintCoreRequest,
  normalizeCorrelationId,
  normalizeRequestedScope,
  stableStringify,
  toBindingPayloadReference,
  toPolicyInputAttributes,
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
