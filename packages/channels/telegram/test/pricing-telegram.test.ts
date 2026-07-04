import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTelegramOutboundText } from '../src/index';
import type { OrchestrationOutcome } from '../../../contracts/src/index';

function buildPricingOutcome(): OrchestrationOutcome {
  return {
    request_id: 'request-pricing-1',
    organization_id: 'org-pacoprint',
    principal_id: 'principal-gema',
    correlation_id: 'corr-pricing-1',
    installation_id: 'install-pacoprint',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'pricing.quote_line',
    workflow_result: null,
    reason: 'pricing quote line complete',
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'pricing.quote_line',
      status: 'completed',
      message: 'PacoPrint quote line calculated',
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
      }
    },
    evidence_links: ['evidence-1'],
    created_at: '2026-06-29T00:00:00.000Z',
    updated_at: '2026-06-29T00:00:00.000Z'
  };
}

test('Telegram renders pricing results as human-readable text', () => {
  const text = buildTelegramOutboundText(buildPricingOutcome());

  assert.equal(text.includes('Línea de PacoPrint'), true);
  assert.equal(text.includes('Vinilo Monomérico Plus'), true);
  assert.equal(text.includes('1210,00 €'), true);
  assert.equal(text.includes('Fuente: Holded · documento F26/1931'), true);
  assert.equal(text.includes('{'), false);
  assert.equal(text.includes('runtime completed'), false);
});
