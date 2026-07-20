import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryGovernedWorkflowRuntime } from '../src/index';
import type {
  ExternalResourceNotFound,
  GovernedWorkflowKind,
  GovernedWorkflowRequest,
  PacoPrintCatalogAdapterPort
} from '../../contracts/src/index';

const NOW = '2026-06-29T00:00:00.000Z';

interface SpyCatalogAdapter {
  adapter: PacoPrintCatalogAdapterPort;
  calls: string[];
}

/**
 * Espía del adaptador PacoPrint: si el despacho ejecutara pricing por defecto,
 * este adaptador registraría la llamada.
 */
function buildSpyCatalogAdapter(): SpyCatalogAdapter {
  const calls: string[] = [];
  const notFound = (resource_type: string): ExternalResourceNotFound => ({
    query_id: 'spy-query',
    organization_id: 'org-pacoprint',
    correlation_id: 'spy-correlation',
    resource_type,
    resource_id: null,
    created_at: NOW,
    evidence_links: [],
    produced_by_adapter: true,
    decision: {
      query_id: 'spy-query',
      adapter_id: 'spy-pacoprint-catalog',
      source_system: 'PacoPrint',
      status: 'not_found',
      reason: 'spy adapter should not be reached',
      authorization: {
        adapter_id: 'spy-pacoprint-catalog',
        source_system: 'PacoPrint',
        organization_id: 'org-pacoprint',
        correlation_id: 'spy-correlation',
        actor: null,
        authorized: false,
        reason: 'spy adapter should not be reached'
      }
    },
    status: 'not_found',
    data: null,
    source_evidence: null,
    error: 'spy adapter should not be reached'
  });
  return {
    calls,
    adapter: {
      adapter_id: 'spy-pacoprint-catalog',
      source_system: 'PacoPrint',
      catalogSearch: () => {
        calls.push('catalogSearch');
        return notFound('pricing.catalog');
      },
      quoteLine: () => {
        calls.push('quoteLine');
        return notFound('pricing.quote_line');
      }
    }
  };
}

function buildRuntime(adapter: PacoPrintCatalogAdapterPort): InMemoryGovernedWorkflowRuntime {
  return new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-pacoprint',
    pacoPrintCatalogAdapter: adapter,
    now: () => new Date(NOW)
  });
}

test('unknown workflow kind fails closed and never falls back to PacoPrint pricing', () => {
  const spy = buildSpyCatalogAdapter();
  const runtime = buildRuntime(spy.adapter);

  const result = runtime.executeWorkflow({
    kind: 'proinsur.hr.read',
    workflow_id: 'workflow-unknown-1',
    organization_hint: 'org-proinsur',
    principal_hint: 'principal-proinsur',
    correlation_id: 'corr-unknown-1'
  } as unknown as GovernedWorkflowRequest);

  assert.equal(result.status, 'unavailable');
  assert.equal(result.workflow_kind, null);
  assert.equal(result.response.workflow_kind, null);
  assert.equal(result.response.response_source, 'workflow_blocked');
  assert.equal(result.response.status, 'unavailable');
  assert.equal(result.response.data, null);
  assert.equal(result.capability_result, null);
  assert.equal(result.organization_id, 'org-pacoprint');

  // Ninguna lógica de cliente se ha ejecutado.
  assert.deepEqual(spy.calls, []);
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);
  assert.equal(
    records.some((record) => typeof record.subject === 'string' && record.subject.includes('pricing')),
    false
  );
});

test('unknown workflow kind records diagnosable evidence without echoing the request payload', () => {
  const spy = buildSpyCatalogAdapter();
  const runtime = buildRuntime(spy.adapter);

  const result = runtime.executeWorkflow({
    kind: 'proinsur.hr.read',
    workflow_id: 'workflow-unknown-2',
    organization_hint: 'org-proinsur',
    principal_hint: 'principal-proinsur',
    correlation_id: 'corr-unknown-2',
    article: 'Nombre Apellido, DNI 00000000T'
  } as unknown as GovernedWorkflowRequest);

  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);
  const failedClosed = records.find((record) => record.record_type === 'failed_closed');

  assert.ok(failedClosed, 'expected a failed_closed evidence record');
  assert.equal(failedClosed?.subject, 'workflow_kind_unsupported');
  assert.equal(failedClosed?.data.requested_kind, 'proinsur.hr.read');
  assert.equal(failedClosed?.data.workflow_id, 'workflow-unknown-2');
  assert.equal(failedClosed?.data.correlation_id, result.correlation_id);
  assert.equal(failedClosed?.data.organization_hint, 'org-proinsur');
  assert.equal(failedClosed?.organization_id, 'org-pacoprint');
  assert.deepEqual(Object.keys(failedClosed?.data ?? {}).sort(), [
    'correlation_id',
    'organization_hint',
    'reason',
    'requested_kind',
    'workflow_id'
  ]);
  assert.equal(JSON.stringify(failedClosed?.data).includes('DNI'), false);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
  assert.equal(result.evidence_links.length > 0, true);
});

test('unknown workflow kind never trusts organization or requested timestamp from the payload', () => {
  const spy = buildSpyCatalogAdapter();
  const runtime = buildRuntime(spy.adapter);

  const result = runtime.executeWorkflow({
    kind: 'unknown.workflow',
    workflow_id: 'workflow-unknown-scope',
    organization_hint: 'org-foreign\nspoofed',
    requested_at: '1900-01-01T00:00:00.000Z',
    correlation_id: 'corr-unknown-scope'
  } as unknown as GovernedWorkflowRequest);

  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);
  assert.equal(result.organization_id, 'org-pacoprint');
  assert.equal(result.created_at, NOW);
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.organization_id, 'org-pacoprint');
    assert.equal(record.created_at, NOW);
  }
  assert.equal(records[0]?.data.organization_hint, 'org-foreign spoofed');
  assert.deepEqual(spy.calls, []);
});

test('unknown workflow kind reports a bounded kind and never crashes on hostile values', () => {
  const spy = buildSpyCatalogAdapter();
  const runtime = buildRuntime(spy.adapter);

  const hostile = runtime.executeWorkflow({
    kind: `pricing\n\u0000${'x'.repeat(200)}`,
    workflow_id: 'workflow-unknown-3',
    correlation_id: 'corr-unknown-3'
  } as unknown as GovernedWorkflowRequest);
  const missing = runtime.executeWorkflow({
    workflow_id: 'workflow-unknown-4',
    correlation_id: 'corr-unknown-4'
  } as unknown as GovernedWorkflowRequest);

  assert.equal(hostile.status, 'unavailable');
  assert.equal(missing.status, 'unavailable');
  assert.deepEqual(spy.calls, []);

  const hostileRecord = runtime
    .getEvidenceLedger()
    .listByCorrelation(hostile.correlation_id)
    .find((record) => record.record_type === 'failed_closed');
  const reportedKind = hostileRecord?.data.requested_kind;
  assert.equal(typeof reportedKind, 'string');
  assert.equal((reportedKind as string).length <= 65, true);
  assert.equal(/[\u0000-\u001f\u007f]/.test(reportedKind as string), false);

  const missingRecord = runtime
    .getEvidenceLedger()
    .listByCorrelation(missing.correlation_id)
    .find((record) => record.record_type === 'failed_closed');
  assert.equal(missingRecord?.data.requested_kind, null);
});

test('every declared workflow kind still reaches its own workflow', () => {
  const requests: { kind: GovernedWorkflowKind; request: GovernedWorkflowRequest }[] = [
    {
      kind: 'mock.estimate.read',
      request: {
        kind: 'mock.estimate.read',
        workflow_id: 'dispatch-estimate',
        organization_hint: 'org-pacoprint',
        principal_hint: 'human-001',
        correlation_id: 'corr-dispatch-estimate',
        estimate_id: 'estimate-123'
      }
    },
    {
      kind: 'mock.email.send',
      request: {
        kind: 'mock.email.send',
        workflow_id: 'dispatch-email',
        organization_hint: 'org-pacoprint',
        principal_hint: 'human-001',
        correlation_id: 'corr-dispatch-email',
        to: 'someone@example.com',
        subject: 'subject',
        body: 'body'
      }
    },
    {
      kind: 'numa.hr.read',
      request: {
        kind: 'numa.hr.read',
        workflow_id: 'dispatch-hr',
        organization_hint: 'org-numa',
        principal_hint: 'human-001',
        correlation_id: 'corr-dispatch-hr',
        capability_id: 'leave.balance',
        params: {}
      }
    },
    {
      kind: 'pricing.quote_line',
      request: {
        kind: 'pricing.quote_line',
        workflow_id: 'dispatch-quote-line',
        organization_hint: 'org-pacoprint',
        principal_hint: 'human-001',
        correlation_id: 'corr-dispatch-quote-line',
        article: 'Vinilo'
      }
    },
    {
      kind: 'pricing.quote_draft',
      request: {
        kind: 'pricing.quote_draft',
        workflow_id: 'dispatch-quote-draft',
        organization_hint: 'org-pacoprint',
        principal_hint: 'human-001',
        correlation_id: 'corr-dispatch-quote-draft',
        lines: [{ article: 'Vinilo' }]
      }
    }
  ];

  for (const { kind, request } of requests) {
    const spy = buildSpyCatalogAdapter();
    const result = buildRuntime(spy.adapter).executeWorkflow(request);
    assert.equal(result.workflow_kind, kind, `${kind} must be dispatched to its own workflow`);
    assert.equal(result.response.workflow_kind, kind, `${kind} must report its own workflow kind`);
    assert.notEqual(result.status, 'unavailable', `${kind} must not fall into the fail-closed branch`);
  }
});
