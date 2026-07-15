import {
  createDeterministicId,
  createSourceEvidence,
  validateResourceResult,
  type ExternalReadAdapterAuthorization,
  type ExternalReadAdapterBlockedResult,
  type ExternalReadAdapterDeniedResult,
  type ExternalReadAdapterDecision,
  type ExternalSystemError,
  type ExternalSystemUnavailable,
  type ResourceFoundResult,
  type ResourceReadStatus,
  type ResourceResult,
  type SourceEvidence
} from '../../../contracts/src/index';

export const PACOPRINT_ADAPTER_ID = 'pacoprint-catalog' as const;
export const PACOPRINT_SOURCE_SYSTEM = 'pacoprint.catalog' as const;
export const PACOPRINT_DEFAULT_BASE_URL = 'https://pacoprint.com/api/v1' as const;
export const PACOPRINT_CATALOG_SEARCH_CAPABILITY = 'catalog.search' as const;
export const PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY = 'pricing.quote_line' as const;

export interface PacoPrintFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): string;
  json(): unknown;
  headers?: { get(name: string): string | null } | undefined;
}

export type PacoPrintFetch = (url: string, init?: RequestInit) => PacoPrintFetchResponse;

export interface PacoPrintCatalogRestrictions {
  minimo?: number | null;
  maximo?: number | null;
  decimal?: boolean | null;
}

export interface PacoPrintCatalogArticleAttributeRule {
  atributo_id?: string | number;
  nombre?: string;
  tipo?: 'select' | 'number' | 'numero' | 'text' | 'checkbox' | string;
  tipo_dato?: string;
  obligatorio?: boolean;
  valores_validos?: Array<string | number>;
  valor_defecto?: string | number | boolean | null;
  restricciones?: PacoPrintCatalogRestrictions | null;
}

export interface PacoPrintCatalogArticleMeasurementRule {
  obligatorio?: boolean;
  restricciones?: PacoPrintCatalogRestrictions | null;
}

export interface PacoPrintCatalogPriceSchema {
  alto?: PacoPrintCatalogArticleMeasurementRule | null;
  ancho?: PacoPrintCatalogArticleMeasurementRule | null;
  atributos?: PacoPrintCatalogArticleAttributeRule[] | null;
}

export interface PacoPrintCatalogArticleAttributeValue {
  id: string | number;
  nombre: string;
  [key: string]: unknown;
}

export interface PacoPrintCatalogArticleAttribute {
  id: string | number;
  nombre: string;
  valores_posibles?: PacoPrintCatalogArticleAttributeValue[] | null;
  [key: string]: unknown;
}

export interface PacoPrintCatalogArticleCharacteristics {
  tipo_calculo: 'm2' | 'Unidades';
  cantidad_minima?: number | null;
  medidas?: {
    alto_minimo?: number | null;
    ancho_minimo?: number | null;
  } | null;
  [key: string]: unknown;
}

export interface PacoPrintCatalogArticle {
  id: string | number;
  nombre: string;
  caracteristicas: PacoPrintCatalogArticleCharacteristics;
  json_calcular_precio: PacoPrintCatalogPriceSchema;
  atributos?: PacoPrintCatalogArticleAttribute[] | null;
}

export interface PacoPrintCatalogCandidate {
  id: string | number;
  nombre: string;
  tipo_calculo: 'm2' | 'Unidades';
  json_calcular_precio: PacoPrintCatalogPriceSchema;
  atributos?: PacoPrintCatalogArticleAttribute[] | null;
}

export interface PacoPrintCatalogSearchInput {
  text: string;
  organization_id?: string | null;
  correlation_id?: string | null;
}

export interface PacoPrintQuoteLineInput {
  articulo_id: string | number;
  unidades: number;
  alto: number;
  ancho: number;
  atributos: unknown;
  organization_id?: string | null;
  correlation_id?: string | null;
}

export interface PacoPrintCatalogAdapterOptions {
  apiToken?: string | null;
  baseUrl?: string;
  fetch: PacoPrintFetch;
  now?: () => Date;
  adapter_id?: string;
  organization_id?: string;
}

export interface PacoPrintCatalogAdapterPort {
  adapter_id: string;
  source_system: string;
  catalogSearch(input: PacoPrintCatalogSearchInput): ResourceResult;
  quoteLine(input: PacoPrintQuoteLineInput): ResourceResult;
}

type PacoPrintTerminalResult = ResourceResult;

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSearchText(value: unknown): string | null {
  const candidate = normalizeOptionalString(value);
  if (!candidate) {
    return null;
  }
  return candidate
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFiniteNumber(value: unknown): { value: number; decimals: number } | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = String(value);
    return {
      value,
      decimals: text.includes('.') ? text.split('.')[1]?.replace(/0+$/, '').length ?? 0 : 0
    };
  }
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (!candidate || !/^-?\d+(?:\.\d+)?$/.test(candidate)) {
      return null;
    }
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return {
      value: parsed,
      decimals: candidate.includes('.') ? candidate.split('.')[1]?.replace(/0+$/, '').length ?? 0 : 0
    };
  }
  return null;
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string {
  const candidate = normalizeOptionalString(baseUrl);
  return candidate ? candidate.replace(/\/+$/, '') : PACOPRINT_DEFAULT_BASE_URL;
}

function buildHeaders(apiToken: string | null, includeJsonContentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }
  return headers;
}

function readResponseText(response: PacoPrintFetchResponse): string {
  try {
    return response.text();
  } catch {
    return '';
  }
}

function parseJsonSafely(input: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (input.trim().length === 0) {
    return { ok: false, reason: 'PacoPrint response body empty' };
  }
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return { ok: false, reason: 'PacoPrint response is not valid JSON' };
  }
}

function isPacoPrintCatalogArticle(value: unknown): value is PacoPrintCatalogArticle {
  if (!isRecord(value)) {
    return false;
  }
  if (!isRecord(value.caracteristicas)) {
    return false;
  }
  return (
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    typeof value.nombre === 'string' &&
    (value.caracteristicas.tipo_calculo === 'm2' || value.caracteristicas.tipo_calculo === 'Unidades') &&
    isRecord(value.json_calcular_precio)
  );
}

function extractArticles(payload: unknown): PacoPrintCatalogArticle[] {
  if (Array.isArray(payload)) {
    return payload.filter(isPacoPrintCatalogArticle);
  }
  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.articulos, payload.catalogo, payload.items, payload.data, payload.articles];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isPacoPrintCatalogArticle);
    }
  }

  if (isPacoPrintCatalogArticle(payload)) {
    return [payload];
  }

  return [];
}

function cloneCandidate(candidate: PacoPrintCatalogCandidate): PacoPrintCatalogCandidate {
  return {
    id: candidate.id,
    nombre: candidate.nombre,
    tipo_calculo: candidate.tipo_calculo,
    json_calcular_precio: structuredClone(candidate.json_calcular_precio),
    atributos: structuredClone(candidate.atributos ?? null)
  };
}

function createAuthorization(input: {
  adapter_id: string;
  organization_id: string;
  correlation_id: string;
  reason: string;
  authorized: boolean;
}): ExternalReadAdapterAuthorization {
  return {
    adapter_id: input.adapter_id,
    source_system: PACOPRINT_SOURCE_SYSTEM,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    actor: null,
    authorized: input.authorized,
    reason: input.reason
  };
}

function createDecision(input: {
  query_id: string;
  adapter_id: string;
  status: ResourceReadStatus;
  reason: string;
  authorization: ExternalReadAdapterAuthorization;
}): ExternalReadAdapterDecision {
  return {
    query_id: input.query_id,
    adapter_id: input.adapter_id,
    source_system: PACOPRINT_SOURCE_SYSTEM,
    status: input.status,
    reason: input.reason,
    authorization: input.authorization
  };
}

function createTerminalResult(input: {
  query_id: string;
  adapter_id: string;
  organization_id: string;
  correlation_id: string;
  resource_type: string;
  resource_id: string | null;
  status: Exclude<ResourceResult['status'], 'found'>;
  reason: string;
  created_at: string;
  produced_by_adapter?: boolean;
}): PacoPrintTerminalResult {
  const authorization = createAuthorization({
    adapter_id: input.adapter_id,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    reason: input.reason,
    authorized: input.status !== 'denied' && input.status !== 'blocked'
  });

  return {
    query_id: input.query_id,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    resource_type: input.resource_type,
    resource_id: input.resource_id,
    created_at: input.created_at,
    evidence_links: [],
    produced_by_adapter: input.produced_by_adapter ?? true,
    status: input.status,
    data: null,
    source_evidence: null,
    error: input.reason,
    decision: createDecision({
      query_id: input.query_id,
      adapter_id: input.adapter_id,
      status: input.status,
      reason: input.reason,
      authorization
    })
  };
}

function createFoundResult(input: {
  query_id: string;
  adapter_id: string;
  organization_id: string;
  correlation_id: string;
  resource_type: string;
  resource_id: string | null;
  data: Record<string, unknown>;
  source_evidence: [SourceEvidence, ...SourceEvidence[]];
  created_at: string;
  reason?: string;
}): ResourceFoundResult {
  const authorization = createAuthorization({
    adapter_id: input.adapter_id,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    reason: input.reason ?? 'resource found',
    authorized: true
  });

  return {
    query_id: input.query_id,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    resource_type: input.resource_type,
    resource_id: input.resource_id,
    created_at: input.created_at,
    evidence_links: input.source_evidence.map((sourceEvidence) => sourceEvidence.source_id),
    produced_by_adapter: true,
    status: 'found',
    data: structuredClone(input.data),
    source_evidence: input.source_evidence.map((sourceEvidence) => ({ ...sourceEvidence })) as [
      SourceEvidence,
      ...SourceEvidence[]
    ],
    error: null,
    decision: createDecision({
      query_id: input.query_id,
      adapter_id: input.adapter_id,
      status: 'found',
      reason: input.reason ?? 'resource found',
      authorization
    })
  };
}

function normalizeStructure(payload: unknown): PacoPrintCatalogArticle[] {
  return extractArticles(payload);
}

function matchesSearch(article: PacoPrintCatalogArticle, normalizedText: string): boolean {
  if (!normalizedText) {
    return false;
  }
  const name = normalizeSearchText(article.nombre);
  const id = normalizeSearchText(article.id);
  if ((name && (name.includes(normalizedText) || normalizedText.includes(name))) || id?.includes(normalizedText)) {
    return true;
  }
  const nameTokens = (name ?? '')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+\s*g$|^\d+g$|^\d+$/.test(token));
  return nameTokens.length > 0 && nameTokens.every((token) => normalizedText.includes(token));
}

function formatArticleRecord(article: PacoPrintCatalogArticle): PacoPrintCatalogCandidate {
  return {
    id: article.id,
    nombre: article.nombre,
    tipo_calculo: article.caracteristicas.tipo_calculo,
    json_calcular_precio: structuredClone(article.json_calcular_precio),
    atributos: structuredClone(article.atributos ?? null)
  };
}

function validateAttributeValue(rule: PacoPrintCatalogArticleAttributeRule, value: unknown): string | null {
  const present = value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0);
  if (!present) {
    return rule.obligatorio ? 'missing required attribute' : null;
  }

  if (rule.tipo === 'select') {
    if (!Array.isArray(rule.valores_validos) || rule.valores_validos.length === 0) {
      return 'attribute select missing valid values';
    }
    const allowed = rule.valores_validos.some((candidate) => String(candidate) === String(value));
    return allowed ? null : 'attribute select outside valid values';
  }

  if (rule.tipo === 'number' || rule.tipo === 'numero') {
    const numeric = normalizeFiniteNumber(value);
    if (!numeric) {
      return 'attribute numeric invalid';
    }
    const restricciones = rule.restricciones ?? null;
    if (restricciones) {
      if (typeof restricciones.minimo === 'number' && numeric.value < restricciones.minimo) {
        return 'attribute numeric below minimum';
      }
      if (typeof restricciones.maximo === 'number' && numeric.value > restricciones.maximo) {
        return 'attribute numeric above maximum';
      }
      if (restricciones.decimal === false && numeric.decimals > 0) {
        return 'attribute numeric must be integer';
      }
    }
    return null;
  }

  return null;
}

function validateAttributesAgainstSchema(
  attributes: Record<string, unknown>,
  schema: PacoPrintCatalogPriceSchema | null | undefined
): string | null {
  const rules = Array.isArray(schema?.atributos) ? schema.atributos : null;
  if (!rules) {
    return null;
  }

  const allowedKeys = new Set<string>();
  for (const rule of rules) {
    if (rule.atributo_id !== undefined && rule.atributo_id !== null) {
      allowedKeys.add(String(rule.atributo_id));
    }
  }

  for (const key of Object.keys(attributes)) {
    if (!allowedKeys.has(key)) {
      return `attribute ${key} not allowed`;
    }
  }

  for (const rule of rules) {
    if (rule.atributo_id === undefined || rule.atributo_id === null) {
      continue;
    }
    const key = String(rule.atributo_id);
    const validationReason = validateAttributeValue(rule, attributes[key]);
    if (validationReason) {
      return `${key}: ${validationReason}`;
    }
  }

  return null;
}

function normalizeAttributes(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input) || Array.isArray(input)) {
    return null;
  }
  return structuredClone(input);
}

function buildSearchEvidence(
  input: {
    article: PacoPrintCatalogArticle;
    correlation_id: string;
    text: string;
    index: number;
  },
  observedAt: string
): SourceEvidence {
  return createSourceEvidence({
    source_id: createDeterministicId('pacoprint-search', {
      article_id: input.article.id,
      correlation_id: input.correlation_id,
      text: input.text,
      index: input.index
    }),
    source_type: 'catalog.search',
    source_system: PACOPRINT_SOURCE_SYSTEM,
    resource_id: String(input.article.id),
    record_id: String(input.article.id),
    field_path: `candidates[${input.index}]`,
    observed_at: observedAt,
    correlation_id: input.correlation_id
  });
}

function buildQuoteEvidence(input: {
  article: PacoPrintCatalogArticle;
  correlation_id: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}): [SourceEvidence, ...SourceEvidence[]] {
  const observedAt = new Date().toISOString();
  return [
    createSourceEvidence({
      source_id: createDeterministicId('pacoprint-quote-request', {
        article_id: input.article.id,
        correlation_id: input.correlation_id,
        request: input.request
      }),
      source_type: 'pricing.quote_line',
      source_system: PACOPRINT_SOURCE_SYSTEM,
      resource_id: String(input.article.id),
      record_id: String(input.article.id),
      field_path: 'request',
      observed_at: observedAt,
      correlation_id: input.correlation_id
    }),
    createSourceEvidence({
      source_id: createDeterministicId('pacoprint-quote-response', {
        article_id: input.article.id,
        correlation_id: input.correlation_id,
        response: input.response
      }),
      source_type: 'pricing.quote_line',
      source_system: PACOPRINT_SOURCE_SYSTEM,
      resource_id: String(input.article.id),
      record_id: String(input.article.id),
      field_path: 'response',
      observed_at: observedAt,
      correlation_id: input.correlation_id
    })
  ];
}

function extractCalculationResponse(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const candidates = [payload, payload.data, payload.result, payload.calculation, payload.calculated_price];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    const hasFields =
      ['neto_unitario', 'neto_base', 'neto_total', 'iva', 'total', 'stock'].some((key) => key in candidate) ||
      'neto_unitario' in candidate;
    if (hasFields) {
      return candidate;
    }
  }
  return null;
}

export class PacoPrintCatalogAdapter implements PacoPrintCatalogAdapterPort {
  adapter_id: string;
  source_system: string;
  private readonly apiToken: string | null;
  private readonly baseUrl: string;
  private readonly fetch: PacoPrintFetch;
  private readonly now: () => Date;
  private readonly organization_id: string;

  constructor(options: PacoPrintCatalogAdapterOptions) {
    this.adapter_id = options.adapter_id ?? PACOPRINT_ADAPTER_ID;
    this.source_system = PACOPRINT_SOURCE_SYSTEM;
    this.apiToken = normalizeOptionalString(options.apiToken);
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetch = options.fetch;
    this.now = options.now ?? (() => new Date());
    this.organization_id = normalizeOptionalString(options.organization_id) ?? 'pacoprint';
  }

  private resolveCorrelationId(input: { correlation_id?: string | null; seed: unknown }): string {
    return normalizeOptionalString(input.correlation_id) ?? createDeterministicId('pacoprint-correlation', input.seed);
  }

  private resolveOrganizationId(input?: string | null): string {
    return normalizeOptionalString(input) ?? this.organization_id;
  }

  private fetchStructure(organization_id: string, correlation_id: string):
    | { ok: true; articles: PacoPrintCatalogArticle[] }
    | { ok: false; result: PacoPrintTerminalResult } {
    if (!this.apiToken) {
      return {
        ok: false,
        result: createTerminalResult({
          query_id: createDeterministicId('pacoprint-structure', { organization_id, correlation_id, kind: 'missing-token' }),
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
          resource_id: null,
          status: 'denied',
          reason: 'PacoPrint API token missing',
          created_at: this.now().toISOString(),
          produced_by_adapter: true
        })
      };
    }

    const url = `${this.baseUrl}/catalogo/estructura`;
    let response: PacoPrintFetchResponse;
    try {
      response = this.fetch(url, {
        method: 'GET',
        headers: buildHeaders(this.apiToken)
      });
    } catch {
      return {
        ok: false,
        result: createTerminalResult({
          query_id: createDeterministicId('pacoprint-structure', { organization_id, correlation_id, kind: 'transport' }),
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
          resource_id: null,
          status: 'unavailable',
          reason: 'PacoPrint transport unavailable',
          created_at: this.now().toISOString(),
          produced_by_adapter: true
        })
      };
    }

    const text = readResponseText(response);
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        result: createTerminalResult({
          query_id: createDeterministicId('pacoprint-structure', { organization_id, correlation_id, kind: 'denied' }),
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
          resource_id: null,
          status: 'denied',
          reason: 'PacoPrint authorization denied',
          created_at: this.now().toISOString(),
          produced_by_adapter: true
        })
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        result: createTerminalResult({
          query_id: createDeterministicId('pacoprint-structure', { organization_id, correlation_id, kind: 'error' }),
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
          resource_id: null,
          status: 'error',
          reason: text || 'PacoPrint structure error',
          created_at: this.now().toISOString(),
          produced_by_adapter: true
        })
      };
    }

    const parsed = parseJsonSafely(text);
    if (!parsed.ok) {
      return {
        ok: false,
        result: createTerminalResult({
          query_id: createDeterministicId('pacoprint-structure', { organization_id, correlation_id, kind: 'parse' }),
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
          resource_id: null,
          status: 'error',
          reason: parsed.reason,
          created_at: this.now().toISOString(),
          produced_by_adapter: true
        })
      };
    }

    return {
      ok: true,
      articles: normalizeStructure(parsed.value)
    };
  }

  catalogSearch(input: PacoPrintCatalogSearchInput): ResourceResult {
    const organization_id = this.resolveOrganizationId(input.organization_id);
    const correlation_id = this.resolveCorrelationId({
      correlation_id: input.correlation_id,
      seed: { operation: 'catalog.search', text: input.text, organization_id }
    });
    const query_id = createDeterministicId('pacoprint-query', {
      operation: 'catalog.search',
      text: input.text,
      organization_id,
      correlation_id
    });
    const created_at = this.now().toISOString();

    const normalizedText = normalizeSearchText(input.text);
    if (!normalizedText) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
        resource_id: null,
        status: 'blocked',
        reason: 'PacoPrint catalog search text missing',
        created_at,
        produced_by_adapter: true
      });
    }

    const structure = this.fetchStructure(organization_id, correlation_id);
    if (!structure.ok) {
      return structure.result;
    }

    const candidates = structure.articles.filter((article) => matchesSearch(article, normalizedText));
    if (candidates.length === 0) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
        resource_id: normalizedText,
        status: 'not_found',
        reason: 'PacoPrint catalog search returned no candidates',
        created_at,
        produced_by_adapter: true
      });
    }

    const responseData = {
      candidates: candidates.map((candidate) => cloneCandidate(formatArticleRecord(candidate)))
    };
    const evidence = candidates.map((article, index) =>
      buildSearchEvidence(
        {
          article,
          correlation_id,
          text: normalizedText,
          index
        },
        created_at
      )
    ) as [SourceEvidence, ...SourceEvidence[]];

    return validateResourceResult(
      createFoundResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_CATALOG_SEARCH_CAPABILITY,
        resource_id: normalizedText,
        data: responseData,
        source_evidence: evidence,
        created_at,
        reason: 'PacoPrint catalog search candidates found'
      })
    );
  }

  quoteLine(input: PacoPrintQuoteLineInput): ResourceResult {
    const organization_id = this.resolveOrganizationId(input.organization_id);
    const correlation_id = this.resolveCorrelationId({
      correlation_id: input.correlation_id,
      seed: {
        operation: 'pricing.quote_line',
        articulo_id: input.articulo_id,
        unidades: input.unidades,
        alto: input.alto,
        ancho: input.ancho,
        organization_id
      }
    });
    const query_id = createDeterministicId('pacoprint-query', {
      operation: 'pricing.quote_line',
      articulo_id: input.articulo_id,
      organization_id,
      correlation_id
    });
    const created_at = this.now().toISOString();

    const normalizedAttributes = normalizeAttributes(input.atributos);
    if (!normalizedAttributes) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'blocked',
        reason: 'PacoPrint quote_line attributes must be an object',
        created_at,
        produced_by_adapter: true
      });
    }

    const structure = this.fetchStructure(organization_id, correlation_id);
    if (!structure.ok) {
      return structure.result;
    }

    const article = structure.articles.find((candidate) => String(candidate.id) === String(input.articulo_id));
    if (!article) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'not_found',
        reason: 'PacoPrint article not found',
        created_at,
        produced_by_adapter: true
      });
    }

    const measures = [
      ['alto', input.alto, article.json_calcular_precio.alto],
      ['ancho', input.ancho, article.json_calcular_precio.ancho]
    ] as const;
    for (const [label, value, rule] of measures) {
      const numeric = normalizeFiniteNumber(value);
      if (!numeric) {
        return createTerminalResult({
          query_id,
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
          resource_id: String(input.articulo_id),
          status: 'blocked',
          reason: `PacoPrint ${label} invalid`,
          created_at,
          produced_by_adapter: true
        });
      }
      if (rule?.restricciones && typeof rule.restricciones.minimo === 'number' && numeric.value < rule.restricciones.minimo) {
        return createTerminalResult({
          query_id,
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
          resource_id: String(input.articulo_id),
          status: 'blocked',
          reason: `PacoPrint ${label} below minimum`,
          created_at,
          produced_by_adapter: true
        });
      }
      if (rule?.restricciones && typeof rule.restricciones.maximo === 'number' && numeric.value > rule.restricciones.maximo) {
        return createTerminalResult({
          query_id,
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
          resource_id: String(input.articulo_id),
          status: 'blocked',
          reason: `PacoPrint ${label} above maximum`,
          created_at,
          produced_by_adapter: true
        });
      }
      if (rule?.restricciones && rule.restricciones.decimal === false && numeric.decimals > 0) {
        return createTerminalResult({
          query_id,
          adapter_id: this.adapter_id,
          organization_id,
          correlation_id,
          resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
          resource_id: String(input.articulo_id),
          status: 'blocked',
          reason: `PacoPrint ${label} decimal precision invalid`,
          created_at,
          produced_by_adapter: true
        });
      }
    }

    const attributeValidationReason = validateAttributesAgainstSchema(normalizedAttributes, article.json_calcular_precio);
    if (attributeValidationReason) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'blocked',
        reason: `PacoPrint quote_line invalid: ${attributeValidationReason}`,
        created_at,
        produced_by_adapter: true
      });
    }

    if (!this.apiToken) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'denied',
        reason: 'PacoPrint API token missing',
        created_at,
        produced_by_adapter: true
      });
    }

    const requestBody = {
      articulo_id: article.id,
      unidades: input.unidades,
      alto: input.alto,
      ancho: input.ancho,
      atributos: normalizedAttributes
    };

    let response: PacoPrintFetchResponse;
    try {
      response = this.fetch(`${this.baseUrl}/catalogo/calcular-precio`, {
        method: 'POST',
        headers: buildHeaders(this.apiToken, true),
        body: JSON.stringify(requestBody)
      });
    } catch {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'unavailable',
        reason: 'PacoPrint transport unavailable',
        created_at,
        produced_by_adapter: true
      });
    }

    const responseText = readResponseText(response);
    if (response.status === 401 || response.status === 403) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'denied',
        reason: 'PacoPrint authorization denied',
        created_at,
        produced_by_adapter: true
      });
    }
    if (!response.ok) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'error',
        reason: responseText || 'PacoPrint calculation error',
        created_at,
        produced_by_adapter: true
      });
    }

    const parsed = parseJsonSafely(responseText);
    if (!parsed.ok) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'error',
        reason: parsed.reason,
        created_at,
        produced_by_adapter: true
      });
    }

    const calculation = extractCalculationResponse(parsed.value);
    if (!calculation) {
      return createTerminalResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        status: 'error',
        reason: 'PacoPrint calculation response missing totals',
        created_at,
        produced_by_adapter: true
      });
    }

    const responseData = {
      articulo_id: article.id,
      unidades: input.unidades,
      alto: input.alto,
      ancho: input.ancho,
      atributos: structuredClone(normalizedAttributes),
      neto_unitario: calculation.neto_unitario ?? null,
      neto_base: calculation.neto_base ?? null,
      neto_total: calculation.neto_total ?? null,
      iva: calculation.iva ?? null,
      total: calculation.total ?? null,
      stock: calculation.stock ?? null
    };

    const evidence = buildQuoteEvidence({
      article,
      correlation_id,
      request: requestBody,
      response: responseData
    });

    return validateResourceResult(
      createFoundResult({
        query_id,
        adapter_id: this.adapter_id,
        organization_id,
        correlation_id,
        resource_type: PACOPRINT_PRICING_QUOTE_LINE_CAPABILITY,
        resource_id: String(input.articulo_id),
        data: responseData,
        source_evidence: evidence,
        created_at,
        reason: 'PacoPrint quote line calculated'
      })
    );
  }
}

export function createPacoPrintCatalogAdapter(options: PacoPrintCatalogAdapterOptions): PacoPrintCatalogAdapterPort {
  return new PacoPrintCatalogAdapter(options);
}
