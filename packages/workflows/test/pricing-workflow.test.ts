import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPricingQuoteLineCapability,
  InMemoryGovernedWorkflowRuntime
} from '../src/index';
import {
  createSourceEvidence,
  type IdentityContext,
  type OrganizationContext,
  type PacoPrintCatalogAdapterPort,
  type PacoPrintCatalogSearchInput,
  type PacoPrintQuoteLineInput,
  type ResourceResult
} from '../../contracts/src/index';

function buildPricingOrganizationContext(): OrganizationContext {
  return {
    organization_id: 'org-pacoprint',
    organization_state: 'active',
    source: 'test-fixture',
    resolved_at: new Date('2026-06-29T00:00:00.000Z').toISOString(),
    isolation_boundary: 'boundary:org-pacoprint',
    revocation_version: 1,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

function buildPricingIdentityContext(): IdentityContext {
  return {
    principal_id: 'principal-gema',
    principal_type: 'human',
    delegated_identity: null,
    scopes: ['read:knowledge'],
    auth_method: 'mfa',
    resolved_at: new Date('2026-06-29T00:00:00.000Z').toISOString(),
    revocation_version: 1,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

function buildPricingAdapter(recordedQuoteCalls: Array<Record<string, unknown>>): PacoPrintCatalogAdapterPort {
  const now = '2026-06-29T00:00:00.000Z';
  const sourceEvidence = createSourceEvidence({
    source_id: 'source-1',
    source_type: 'pricing.catalog',
    source_system: 'PacoPrint',
    resource_id: 'art-1',
    record_id: 'record-1',
    field_path: 'json_calcular_precio',
    observed_at: now,
    correlation_id: 'corr-pricing-1'
  });
  const candidate = {
    id: 'art-1',
    nombre: 'Vinilo Monomérico Plus',
    tipo_calculo: 'm2',
    json_calcular_precio: {
      atributos: {
        color: {
          tipo: 'select',
          obligatorio: true,
          valor_defecto: 'blanco',
          valores_validos: ['blanco', 'negro']
        }
      }
    },
    atributos: [
      {
        id: 'color',
        nombre: 'Color',
        valores_posibles: [
          { id: 'white', nombre: 'Blanco' },
          { id: 'black', nombre: 'Negro' }
        ]
      }
    ]
  };
  const searchResult = {
    query_id: 'query-search-1',
    organization_id: 'org-pacoprint',
    correlation_id: 'corr-pricing-1',
    resource_type: 'pricing.catalog',
    resource_id: 'art-1',
    created_at: now,
    evidence_links: ['evidence-search-1'],
    produced_by_adapter: true,
    status: 'found',
    data: {
      candidates: [candidate]
    },
    source_evidence: [sourceEvidence],
    error: null,
    decision: {
      query_id: 'query-search-1',
      adapter_id: 'pacoprint-catalog',
      source_system: 'PacoPrint',
      status: 'found',
      reason: 'found',
      authorization: {
        adapter_id: 'pacoprint-catalog',
        source_system: 'PacoPrint',
        organization_id: 'org-pacoprint',
        correlation_id: 'corr-pricing-1',
        actor: null,
        authorized: true,
        reason: 'allowed'
      }
    }
  } as unknown as ResourceResult;
  const quoteResult = {
    query_id: 'query-quote-1',
    organization_id: 'org-pacoprint',
    correlation_id: 'corr-pricing-1',
    resource_type: 'pricing.quote_line',
    resource_id: 'art-1',
    created_at: now,
    evidence_links: ['evidence-quote-1'],
    produced_by_adapter: true,
    status: 'found',
    data: {
      kind: 'pricing.quote_line',
      article: 'Vinilo Monomérico Plus',
      article_name: 'Vinilo Monomérico Plus',
      articulo_id: 'art-1',
      unidades: 2,
      alto: 100,
      ancho: 200,
      options: { color: 'white' },
      attributes: { color: 'white' },
      defaults_applied: ['Color'],
      options_summary: ['Color Blanco'],
      neto_unitario: 500,
      neto_base: 1000,
      neto_total: 1000,
      iva_percentage: 21,
      iva_amount: 210,
      total: 1210,
      stock: true,
      source_system: 'Holded',
      source_record_id: 'F26/1931'
    },
    source_evidence: [sourceEvidence],
    error: null,
    decision: {
      query_id: 'query-quote-1',
      adapter_id: 'pacoprint-catalog',
      source_system: 'PacoPrint',
      status: 'found',
      reason: 'found',
      authorization: {
        adapter_id: 'pacoprint-catalog',
        source_system: 'PacoPrint',
        organization_id: 'org-pacoprint',
        correlation_id: 'corr-pricing-1',
        actor: null,
        authorized: true,
        reason: 'allowed'
      }
    }
  } as unknown as ResourceResult;

  return {
    adapter_id: 'pacoprint-catalog',
    source_system: 'PacoPrint',
    catalogSearch(input: PacoPrintCatalogSearchInput) {
      recordedQuoteCalls.push({ type: 'search', input });
      return searchResult;
    },
    quoteLine(input: PacoPrintQuoteLineInput) {
      recordedQuoteCalls.push({ type: 'quote', input });
      return quoteResult;
    }
  };
}

test('pricing quote line workflow resolves PacoPrint defaults and returns a governed runtime result', () => {
  const calls: Array<Record<string, unknown>> = [];
  const adapter = buildPricingAdapter(calls);
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    pacoPrintCatalogAdapter: adapter,
    resolveOrganizationContext: () => buildPricingOrganizationContext(),
    resolveIdentityContext: () => buildPricingIdentityContext()
  });
  runtime.registerCapability(createPricingQuoteLineCapability(adapter, {}, 'org-pacoprint'));

  const result = runtime.executeWorkflow({
    kind: 'pricing.quote_line',
    workflow_id: 'pricing-workflow-1',
    organization_hint: 'org-pacoprint',
    principal_hint: 'principal-gema',
    correlation_id: 'corr-pricing-1',
    article: 'Vinilo Monomérico Plus',
    unidades: 2,
    alto: 100,
    ancho: 200,
    options: {}
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.response.workflow_kind, 'pricing.quote_line');
  assert.equal(result.response.data?.kind, 'pricing.quote_line');
  assert.equal(result.response.data?.article_name, 'Vinilo Monomérico Plus');
  assert.equal(result.response.data?.total, 1210);
  const responseData = result.response.data as Record<string, unknown> | null;
  assert.equal((responseData?.defaults_applied as string[] | undefined)?.includes('Color'), true);
  assert.equal((responseData?.options_summary as string[] | undefined)?.includes('Color Blanco'), true);
  assert.equal(calls.length >= 2, true);
  assert.equal(calls[0].type, 'search');
  assert.equal(calls[1].type, 'quote');
  assert.equal((calls[1].input as { atributos?: Record<string, unknown> }).atributos?.color, 'white');
});

test('pricing quote line workflow asks for clarification when the article is missing', () => {
  const calls: Array<Record<string, unknown>> = [];
  const adapter = buildPricingAdapter(calls);
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    pacoPrintCatalogAdapter: adapter
  });
  runtime.registerCapability(createPricingQuoteLineCapability(adapter, {}, 'org-pacoprint'));

  const result = runtime.executeWorkflow({
    kind: 'pricing.quote_line',
    workflow_id: 'pricing-workflow-2',
    organization_hint: 'org-pacoprint',
    principal_hint: 'principal-gema',
    correlation_id: 'corr-pricing-2',
    article: '   ',
    unidades: 2,
    alto: 100,
    ancho: 200,
    options: {}
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.response.response_source, 'workflow_blocked');
  assert.equal(result.response.data?.kind, 'request_clarification');
  assert.equal(result.response.data?.missing, 'pricing');
  assert.equal(result.capability_result, null);
  assert.equal(calls.length, 0);
});
