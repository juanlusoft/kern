import test from 'node:test';
import assert from 'node:assert/strict';

import { createPricingQuoteLineCapability, InMemoryGovernedWorkflowRuntime } from '../src/index';
import {
  createSourceEvidence,
  type IdentityContext,
  type OrganizationContext,
  type PacoPrintCatalogAdapterPort,
  type PacoPrintCatalogSearchInput,
  type PacoPrintQuoteLineInput,
  type ResourceResult
} from '../../contracts/src/index';

function orgCtx(): OrganizationContext {
  return {
    organization_id: 'org-pacoprint',
    organization_state: 'active',
    source: 'test',
    resolved_at: new Date('2026-07-05T00:00:00.000Z').toISOString(),
    isolation_boundary: 'boundary:org-pacoprint',
    revocation_version: 1,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

function idCtx(): IdentityContext {
  return {
    principal_id: 'principal-gema',
    principal_type: 'human',
    delegated_identity: null,
    scopes: ['read:knowledge'],
    auth_method: 'mfa',
    resolved_at: new Date('2026-07-05T00:00:00.000Z').toISOString(),
    revocation_version: 1,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

const now = '2026-07-05T00:00:00.000Z';
const evidence = createSourceEvidence({
  source_id: 'source-1',
  source_type: 'pricing.catalog',
  source_system: 'PacoPrint',
  resource_id: 'art',
  record_id: 'rec',
  field_path: 'json_calcular_precio',
  observed_at: now,
  correlation_id: 'corr'
});

const LONA = {
  id: 'lona-1',
  nombre: 'Lona Frontlit',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [{ atributo_id: 'corte', nombre: 'Corte', tipo: 'select', obligatorio: true, valores_validos: ['recto', 'curvo'] }]
  },
  atributos: [
    {
      id: 'corte',
      nombre: 'Corte',
      valores_posibles: [
        { id: 'recto', nombre: 'Recto' },
        { id: 'curvo', nombre: 'Curvo' }
      ]
    }
  ]
};
const VINILO = { id: 'vinilo-1', nombre: 'Vinilo Mate', tipo_calculo: 'm2', json_calcular_precio: { atributos: [] }, atributos: [] };

function found(data: Record<string, unknown>, resource_id: string): ResourceResult {
  return {
    query_id: 'q',
    organization_id: 'org-pacoprint',
    correlation_id: 'corr',
    resource_type: 'pricing',
    resource_id,
    created_at: now,
    evidence_links: ['e'],
    produced_by_adapter: true,
    status: 'found',
    data,
    source_evidence: [evidence],
    error: null,
    decision: {
      query_id: 'q',
      adapter_id: 'pacoprint-catalog',
      source_system: 'PacoPrint',
      status: 'found',
      reason: 'found',
      authorization: {
        adapter_id: 'pacoprint-catalog',
        source_system: 'PacoPrint',
        organization_id: 'org-pacoprint',
        correlation_id: 'corr',
        actor: null,
        authorized: true,
        reason: 'allowed'
      }
    }
  } as unknown as ResourceResult;
}

function buildDraftAdapter(calls: Array<Record<string, unknown>>): PacoPrintCatalogAdapterPort {
  return {
    adapter_id: 'pacoprint-catalog',
    source_system: 'PacoPrint',
    catalogSearch(input: PacoPrintCatalogSearchInput) {
      calls.push({ type: 'search', text: input.text });
      const text = String(input.text).toLowerCase();
      const candidate = text.includes('vinilo') ? VINILO : LONA;
      return found({ candidates: [candidate] }, String(candidate.id));
    },
    quoteLine(input: PacoPrintQuoteLineInput) {
      calls.push({ type: 'quote', articulo_id: input.articulo_id, atributos: input.atributos });
      const price =
        String(input.articulo_id) === 'vinilo-1'
          ? { neto_total: 50, iva: { porcentaje: 21, importe: 10.5 }, total: 60.5 }
          : { neto_total: 100, iva: { porcentaje: 21, importe: 21 }, total: 121 };
      return found({ ...price, articulo_id: input.articulo_id }, String(input.articulo_id));
    }
  };
}

function buildRuntime(adapter: PacoPrintCatalogAdapterPort) {
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date(now),
    pacoPrintCatalogAdapter: adapter,
    resolveOrganizationContext: () => orgCtx(),
    resolveIdentityContext: () => idCtx()
  });
  runtime.registerCapability(createPricingQuoteLineCapability(adapter, {}, 'org-pacoprint'));
  return runtime;
}

test('pricing draft: multi-line complete returns a draft with per-line prices and a total', () => {
  const calls: Array<Record<string, unknown>> = [];
  const runtime = buildRuntime(buildDraftAdapter(calls));

  const result = runtime.executeWorkflow({
    kind: 'pricing.quote_draft',
    workflow_id: 'draft-1',
    organization_hint: 'org-pacoprint',
    principal_hint: 'principal-gema',
    correlation_id: 'corr',
    customer: 'ACME SL',
    lines: [
      { text: 'lona frontlit 100x100 corte recto', article: 'lona frontlit', alto: 100, ancho: 100, options: {} },
      { text: 'vinilo mate 50x50', article: 'vinilo mate', alto: 50, ancho: 50, options: {} }
    ]
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.response.workflow_kind, 'pricing.quote_draft');
  const data = result.response.data as Record<string, unknown>;
  assert.equal(data.kind, 'pricing.quote_draft');
  assert.equal(data.customer, 'ACME SL');
  assert.equal((data.lines as unknown[]).length, 2);
  assert.equal(data.total, 181.5);
  assert.equal(data.neto_total, 150);
  assert.equal(data.iva_amount, 31.5);
});

test('pricing draft: any incomplete line blocks and names the missing datum per line', () => {
  const calls: Array<Record<string, unknown>> = [];
  const runtime = buildRuntime(buildDraftAdapter(calls));

  const result = runtime.executeWorkflow({
    kind: 'pricing.quote_draft',
    workflow_id: 'draft-2',
    organization_hint: 'org-pacoprint',
    principal_hint: 'principal-gema',
    correlation_id: 'corr',
    lines: [
      { text: 'lona frontlit 100x100', article: 'lona frontlit', alto: 100, ancho: 100, options: {} },
      { text: 'vinilo mate 50x50', article: 'vinilo mate', alto: 50, ancho: 50, options: {} }
    ]
  });

  assert.equal(result.status, 'blocked');
  const data = result.response.data as Record<string, unknown>;
  assert.equal(data.kind, 'request_clarification');
  assert.equal(data.missing, 'pricing');
  assert.match(String(data.reason), /Corte/i);
});

test('pricing draft: empty lines is blocked honestly', () => {
  const calls: Array<Record<string, unknown>> = [];
  const runtime = buildRuntime(buildDraftAdapter(calls));
  const result = runtime.executeWorkflow({
    kind: 'pricing.quote_draft',
    workflow_id: 'draft-3',
    organization_hint: 'org-pacoprint',
    principal_hint: 'principal-gema',
    correlation_id: 'corr',
    lines: []
  });
  assert.equal(result.status, 'blocked');
  assert.equal((result.response.data as Record<string, unknown>).missing, 'pricing');
});
