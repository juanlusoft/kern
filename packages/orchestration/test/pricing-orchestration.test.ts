import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryOrchestrationBoundary, type OrchestrationBoundaryOptions } from '../src/index';
import {
  createPricingQuoteLineCapability,
  InMemoryGovernedWorkflowRuntime
} from '../../workflows/src/index';
import { createSourceEvidence, type IdentityContext, type OrganizationContext, type PacoPrintCatalogAdapterPort, type PacoPrintCatalogSearchInput, type PacoPrintQuoteLineInput, type ResourceResult } from '../../contracts/src/index';
import { createMockOrchestrator, type MockOrchestrationRoute } from '../../orchestrators/mock/src/index';

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

function buildPricingAdapter(): PacoPrintCatalogAdapterPort {
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
      atributos: [
        {
          atributo_id: 'color',
          nombre: 'Color',
          tipo: 'select',
          obligatorio: true,
          valor_defecto: 'blanco',
          valores_validos: ['white', 'black']
        }
      ]
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
    data: { candidates: [candidate] },
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
      return searchResult;
    },
    quoteLine(input: PacoPrintQuoteLineInput) {
      return quoteResult;
    }
  };
}

function buildBoundary(options: Partial<OrchestrationBoundaryOptions> = {}) {
  const adapter = buildPricingAdapter();
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    pacoPrintCatalogAdapter: adapter,
    resolveOrganizationContext: () => buildPricingOrganizationContext(),
    resolveIdentityContext: () => buildPricingIdentityContext()
  });
  runtime.registerCapability(createPricingQuoteLineCapability(adapter, {}, 'org-pacoprint'));
  const routes: MockOrchestrationRoute[] = [
    {
      keywords: ['precio'],
      capability_key: 'pricing.quote_line',
      reason: 'pricing route selected from message keywords',
      confidence: 1,
      buildParams() {
        return {
          article: 'Vinilo Monomérico Plus',
          unidades: 2,
          alto: 100,
          ancho: 200,
          options: {}
        };
      }
    }
  ];
  return new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator: createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z'), routes }),
    installationCapabilities: {
      'install-pacoprint': ['pricing.quote_line']
    },
    ...options
  });
}

test('pricing proposal travels through the orchestration boundary into the runtime and preserves the priced response', () => {
  const boundary = buildBoundary();
  const outcome = boundary.execute({
    request_id: 'pricing-request-1',
    user_message: 'Quiero precio de Vinilo Monomérico Plus blanco',
    organization_id: 'org-pacoprint',
    principal_id: 'principal-gema',
    actor: {
      principal_id: 'principal-gema',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-pricing-1',
    installation_id: 'install-pacoprint',
    context: {
      installation_id: 'install-pacoprint',
      active_capabilities: ['pricing.quote_line'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  assert.equal(outcome.workflow_result?.capability_result?.status, 'executed');
  assert.equal(outcome.workflow_result?.response.data?.kind, 'pricing.quote_line');
  assert.equal(outcome.workflow_result?.response.data?.article_name, 'Vinilo Monomérico Plus');
  assert.equal(outcome.workflow_result?.response.data?.total, 1210);
  const responseData = outcome.workflow_result?.response.data as Record<string, unknown> | null;
  assert.equal(responseData?.defaults_applied, null);
  assert.equal((responseData?.options_summary as string[] | undefined)?.includes('Color Blanco'), true);
  assert.equal(outcome.workflow_result?.capability_result?.output?.result.status, 'found');
});
