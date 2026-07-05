import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACOPRINT_CATALOG_SEARCH_CAPABILITY,
  PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
  createPacoPrintCatalogAdapter,
  type PacoPrintFetchResponse
} from '../src/index';

function createFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = (url: string | URL | Request, init?: RequestInit): PacoPrintFetchResponse => {
    const callIndex = calls.length;
    calls.push({ url: String(url), init });
    const response = responses[callIndex] ?? responses[responses.length - 1];
    const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'ERROR',
      text: () => body,
      json: () => (typeof response.body === 'string' ? JSON.parse(response.body) : response.body),
      headers: {
        get(name: string) {
          return init?.headers && typeof init.headers === 'object'
            ? (init.headers as Record<string, string | undefined>)[name] ?? null
            : null;
        }
      }
    };
  };
  return { fetch, calls };
}

function buildCatalogStructure() {
  return {
    articulos: [
      {
        id: 101,
        nombre: 'Vinilo Monomérico Plus',
        caracteristicas: {
          tipo_calculo: 'm2' as const,
          cantidad_minima: 1,
          medidas: {
            alto_minimo: 100,
            ancho_minimo: 50
          }
        },
        json_calcular_precio: {
          alto: { obligatorio: true, restricciones: { minimo: 100, maximo: null, decimal: false } },
          ancho: { obligatorio: true, restricciones: { minimo: 50, maximo: null, decimal: false } },
          atributos: [
            {
              atributo_id: 7,
              nombre: 'Acabado',
              tipo: 'select' as const,
              obligatorio: true,
              valores_validos: ['mate', 'brillo']
            },
            {
              atributo_id: 12,
              nombre: 'Grosor',
              tipo: 'number' as const,
              obligatorio: false,
              restricciones: { minimo: 80, maximo: 200, decimal: true }
            }
          ]
        }
      },
      {
        id: 'A-202',
        nombre: 'Cartel rígido',
        caracteristicas: {
          tipo_calculo: 'Unidades' as const,
          cantidad_minima: 1,
          medidas: {
            alto_minimo: 1,
            ancho_minimo: 1
          }
        },
        json_calcular_precio: {
          atributos: []
        }
      }
    ]
  };
}

function buildAdapter(fetch = createFetchSequence([{ status: 200, body: buildCatalogStructure() }]).fetch) {
  return createPacoPrintCatalogAdapter({
    apiToken: 'pacoprint-secret-token',
    fetch,
    now: () => new Date('2026-07-04T08:00:00.000Z'),
    baseUrl: 'https://pacoprint.example.test',
    organization_id: 'org-pacoprint'
  });
}

test('PacoPrint catalog search returns candidates and sends Bearer auth', () => {
  const { fetch, calls } = createFetchSequence([{ status: 200, body: buildCatalogStructure() }]);
  const adapter = buildAdapter(fetch);

  const result = adapter.catalogSearch({
    text: 'vinilo',
    correlation_id: 'corr-search'
  });
  const serialized = JSON.stringify(result);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /pacoprint\.example\.test\/catalogo\/estructura/);
  assert.equal((calls[0].init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer pacoprint-secret-token');
  const searchData = result.status === 'found' ? (result.data as { candidates: Array<{ id: string | number; nombre: string; tipo_calculo: string }> }) : null;
  assert.equal(result.status, 'found');
  assert.equal(result.resource_type, PACOPRINT_CATALOG_SEARCH_CAPABILITY);
  assert.equal(searchData?.candidates.length, 1);
  assert.equal(searchData?.candidates[0]?.id, 101);
  assert.equal(searchData?.candidates[0]?.nombre, 'Vinilo Monomérico Plus');
  assert.equal(searchData?.candidates[0]?.tipo_calculo, 'm2');
  assert.ok(result.source_evidence);
  assert.equal(result.source_evidence.length > 0, true);
  assert.equal(result.source_evidence[0].source_system, 'pacoprint.catalog');
  assert.equal(serialized.includes('pacoprint-secret-token'), false);
});

test('PacoPrint quote_line sends atributos as an object and returns SourceEvidence', () => {
  const { fetch, calls } = createFetchSequence([
    { status: 200, body: buildCatalogStructure() },
    {
      status: 200,
      body: {
        neto_unitario: 12.5,
        neto_base: 250,
        neto_total: 250,
        iva: 52.5,
        total: 302.5,
        stock: 7
      }
    }
  ]);
  const adapter = buildAdapter(fetch);

  const result = adapter.quoteLine({
    articulo_id: 101,
    unidades: 20,
    alto: 120,
    ancho: 60,
    atributos: {
      '7': 'mate',
      '12': 120.5
    },
    correlation_id: 'corr-quote'
  });
  const postedBody = JSON.parse(String(calls[1].init?.body ?? '{}')) as Record<string, unknown>;
  const serialized = JSON.stringify(result);

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /pacoprint\.example\.test\/catalogo\/estructura/);
  assert.match(calls[1].url, /pacoprint\.example\.test\/catalogo\/calcular-precio/);
  assert.equal((calls[1].init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer pacoprint-secret-token');
  assert.equal((calls[1].init?.headers as Record<string, string> | undefined)?.['Content-Type'], 'application/json');
  assert.equal(Array.isArray(postedBody.atributos), false);
  assert.deepEqual(postedBody.atributos, {
    '7': 'mate',
    '12': 120.5
  });
  assert.equal(result.status, 'found');
  assert.equal(result.resource_type, PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY);
  assert.equal(result.data?.neto_unitario, 12.5);
  assert.equal(result.data?.neto_base, 250);
  assert.equal(result.data?.neto_total, 250);
  assert.equal(result.data?.iva, 52.5);
  assert.equal(result.data?.total, 302.5);
  assert.equal(result.data?.stock, 7);
  assert.ok(result.source_evidence);
  assert.equal(result.source_evidence.length >= 2, true);
  assert.equal(result.source_evidence[0].source_system, 'pacoprint.catalog');
  assert.equal(serialized.includes('pacoprint-secret-token'), false);
});

test('PacoPrint quote_line blocks when a required attribute is missing', () => {
  const { fetch, calls } = createFetchSequence([{ status: 200, body: buildCatalogStructure() }]);
  const adapter = buildAdapter(fetch);

  const result = adapter.quoteLine({
    articulo_id: 101,
    unidades: 20,
    alto: 120,
    ancho: 60,
    atributos: {
      '12': 120.5
    },
    correlation_id: 'corr-missing-attribute'
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.data, null);
  assert.equal(result.error?.includes('missing required attribute'), true);
});

test('PacoPrint quote_line blocks when a measure is below minimum', () => {
  const { fetch, calls } = createFetchSequence([{ status: 200, body: buildCatalogStructure() }]);
  const adapter = buildAdapter(fetch);

  const result = adapter.quoteLine({
    articulo_id: 101,
    unidades: 20,
    alto: 90,
    ancho: 60,
    atributos: {
      '7': 'mate'
    },
    correlation_id: 'corr-measure-min'
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.error?.includes('below minimum'), true);
});

test('PacoPrint quote_line blocks when a select attribute falls outside valid values', () => {
  const { fetch, calls } = createFetchSequence([{ status: 200, body: buildCatalogStructure() }]);
  const adapter = buildAdapter(fetch);

  const result = adapter.quoteLine({
    articulo_id: 101,
    unidades: 20,
    alto: 120,
    ancho: 60,
    atributos: {
      '7': 'satinado'
    },
    correlation_id: 'corr-select-invalid'
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.error?.includes('outside valid values'), true);
});

test('PacoPrint quote_line returns not_found for an unknown article without posting', () => {
  const { fetch, calls } = createFetchSequence([{ status: 200, body: buildCatalogStructure() }]);
  const adapter = buildAdapter(fetch);

  const result = adapter.quoteLine({
    articulo_id: 999,
    unidades: 20,
    alto: 120,
    ancho: 60,
    atributos: {
      '7': 'mate'
    },
    correlation_id: 'corr-unknown-article'
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'not_found');
  assert.equal(result.error?.includes('article not found'), true);
});
