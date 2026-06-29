import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintCoreRequest, normalizeCorrelationId, stableStringify } from '../src/index';

test('normalizeCorrelationId prefers correlation_id when present', () => {
  assert.equal(
    normalizeCorrelationId({ request_id: 'req-1', correlation_id: 'corr-1' }),
    'corr-1'
  );
});

test('normalizeCorrelationId falls back to request_id', () => {
  assert.equal(normalizeCorrelationId({ request_id: 'req-2', correlation_id: null }), 'req-2');
});

test('fingerprintCoreRequest is deterministic for equivalent payloads', () => {
  const requestA = {
    request_id: 'req-3',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.action',
    purpose: 'demo',
    payload: { b: 2, a: 1 },
    requires_binding: true,
    correlation_id: 'corr-3'
  };
  const requestB = {
    ...requestA,
    payload: { a: 1, b: 2 }
  };
  assert.equal(
    fingerprintCoreRequest({ request: requestA, organization_id: 'org-acme', principal_id: 'human-001' }),
    fingerprintCoreRequest({ request: requestB, organization_id: 'org-acme', principal_id: 'human-001' })
  );
});

test('stableStringify sorts object keys', () => {
  assert.equal(stableStringify({ z: 1, a: 2 }), '{"a":2,"z":1}');
});
