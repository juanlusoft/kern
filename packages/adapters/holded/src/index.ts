import {
  createDeterministicId,
  createSourceEvidence,
  normalizeResourceQuery,
  validateResourceResult,
  type ExternalReadAdapter,
  type ExternalReadAdapterAuthorization,
  type ExternalReadAdapterDecision,
  type ExternalReadAdapterDeniedResult,
  type ExternalReadAdapterBlockedResult,
  type ExternalResourceNotFound,
  type ExternalSystemError,
  type ExternalSystemUnavailable,
  type ResourceFoundResult,
  type ResourceQuery,
  type ResourceResult,
  type SourceEvidence
} from '../../../contracts/src/index';

export const HOLDed_READ_MODULE_KEY = 'holded-read' as const;
export const HOLDed_SOURCE_SYSTEM = 'holded' as const;

export interface HoldedInstallationManifest {
  installation_id: string;
  active_modules: string[];
}

export interface HoldedFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): string;
  json(): unknown;
  headers?: { get(name: string): string | null } | undefined;
}

export type HoldedFetch = (url: string, init?: RequestInit) => HoldedFetchResponse;

export interface HoldedReadAdapterOptions {
  apiKey?: string | null;
  baseUrl?: string;
  fetch: HoldedFetch;
  now?: () => Date;
  adapter_id?: string;
  module_key?: string;
  installation: HoldedInstallationManifest;
  module_registered?: boolean;
}

export interface HoldedModuleDefinition {
  module_key: string;
  display_name: string;
  createAdapter(options: HoldedReadAdapterOptions): ExternalReadAdapter;
}

export interface HoldedModuleRegistry {
  register(definition: HoldedModuleDefinition): HoldedModuleDefinition;
  get(module_key: string): HoldedModuleDefinition | undefined;
  has(module_key: string): boolean;
  list(): HoldedModuleDefinition[];
}

export class InMemoryHoldedModuleRegistry implements HoldedModuleRegistry {
  private readonly modules = new Map<string, HoldedModuleDefinition>();

  register(definition: HoldedModuleDefinition): HoldedModuleDefinition {
    this.modules.set(definition.module_key, { ...definition });
    return this.get(definition.module_key) as HoldedModuleDefinition;
  }

  get(module_key: string): HoldedModuleDefinition | undefined {
    const definition = this.modules.get(module_key);
    return definition ? { ...definition } : undefined;
  }

  has(module_key: string): boolean {
    return this.modules.has(module_key);
  }

  list(): HoldedModuleDefinition[] {
    return [...this.modules.values()].map((definition) => ({ ...definition }));
  }
}

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

function normalizeApiKey(apiKey: string | null | undefined): string | null {
  return normalizeOptionalString(apiKey);
}

function trimBaseUrl(baseUrl: string | null | undefined): string {
  const candidate = normalizeOptionalString(baseUrl);
  return candidate ? candidate.replace(/\/+$/, '') : 'https://api.holded.com';
}

function isActiveForInstallation(installation: HoldedInstallationManifest, module_key: string): boolean {
  return installation.active_modules.includes(module_key);
}

function buildAuthorization(input: {
  adapter_id: string;
  query: ResourceQuery;
  authorized: boolean;
  reason: string;
}): ExternalReadAdapterAuthorization {
  return {
    adapter_id: input.adapter_id,
    source_system: HOLDed_SOURCE_SYSTEM,
    organization_id: input.query.organization_id,
    correlation_id: input.query.correlation_id ?? '',
    actor: input.query.actor,
    authorized: input.authorized,
    reason: input.reason
  };
}

function buildDecision(input: {
  query: ResourceQuery;
  adapter_id: string;
  status: ResourceResult['status'];
  reason: string;
  authorization: ExternalReadAdapterAuthorization;
}): ExternalReadAdapterDecision {
  return {
    query_id: input.query.query_id,
    adapter_id: input.adapter_id,
    source_system: HOLDed_SOURCE_SYSTEM,
    status: input.status,
    reason: input.reason,
    authorization: input.authorization
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateQuery(input: ResourceQuery): string | null {
  if (normalizeOptionalString(input.query_id) === null) return 'resource query invalid';
  if (normalizeOptionalString(input.organization_id) === null) return 'resource query invalid';
  if (normalizeOptionalString(input.correlation_id) === null) return 'resource query invalid';
  if (input.actor === null || normalizeOptionalString(input.actor.principal_id) === null) return 'resource query invalid';
  if (normalizeOptionalString(input.resource_type) !== 'estimate') return 'resource query invalid';
  const resource_id = normalizeOptionalString(input.resource_id);
  const customer_id = input.filters && typeof input.filters.customer_id === 'string' ? normalizeOptionalString(input.filters.customer_id) : null;
  const contact_id = input.filters && typeof input.filters.contact_id === 'string' ? normalizeOptionalString(input.filters.contact_id) : null;
  const contact =
    input.filters && typeof input.filters.contact === 'string' ? normalizeOptionalString(input.filters.contact) : null;
  const contact_name =
    input.filters && typeof input.filters.contact_name === 'string'
      ? normalizeOptionalString(input.filters.contact_name)
      : input.filters && typeof input.filters.contactName === 'string'
        ? normalizeOptionalString(input.filters.contactName)
        : null;
  const customer_name =
    input.filters && typeof input.filters.customer_name === 'string'
      ? normalizeOptionalString(input.filters.customer_name)
      : input.filters && typeof input.filters.customerName === 'string'
        ? normalizeOptionalString(input.filters.customerName)
        : null;
  if (!resource_id && !customer_id && !contact_id && !contact && !contact_name && !customer_name) return 'resource query invalid';
  return null;
}

function lookupMode(query: ResourceQuery): 'by_id' | 'by_customer' {
  return collectQueryLookupTerms(query).length > 0 ? 'by_customer' : 'by_id';
}

function buildEndpoint(baseUrl: string, query: ResourceQuery): string {
  return `${baseUrl}/api/invoicing/v1/documents/estimate`;
}

function collectFieldPaths(record: Record<string, unknown>): string[] {
  const keys = Object.keys(record);
  return keys.length > 0 ? keys : ['resource'];
}

const naturalComparator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function extractRecordId(record: Record<string, unknown>): string | null {
  const candidate = record.estimate_id ?? record.id ?? record.resource_id;
  return normalizeOptionalString(candidate);
}

function extractRecordDocumentNumber(record: Record<string, unknown>): string | null {
  const candidate =
    record.docNumber ??
    record.documentNo ??
    record.document_number ??
    record.documentNumber ??
    record.estimateNumber ??
    record.invoiceNum ??
    record.number ??
    record.num;
  return normalizeOptionalString(candidate);
}

function collectQueryLookupTerms(query: ResourceQuery): string[] {
  const filters = query.filters && isRecord(query.filters) ? query.filters : null;
  const candidateValues = [
    filters?.customer_id,
    filters?.customer_name,
    filters?.customerName,
    filters?.contact_name,
    filters?.contactName,
    filters?.contact,
    filters?.contact_id
  ];
  const terms = candidateValues
    .map((candidate) => normalizeSearchText(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
  return [...new Set(terms)];
}

function collectRecordLookupCandidates(record: Record<string, unknown>): string[] {
  const candidateValues = [
    record.customer_id,
    record.contact_id,
    record.contact_name,
    record.customer_name,
    record.contactName,
    record.customerName,
    record.contact,
    record.customer,
    isRecord(record.contact) ? record.contact.name : null,
    isRecord(record.contact) ? record.contact.contact_name : null,
    isRecord(record.contact) ? record.contact.contactName : null,
    isRecord(record.customer) ? record.customer.name : null,
    isRecord(record.customer) ? record.customer.customer_name : null,
    isRecord(record.customer) ? record.customer.customerName : null
  ];
  return candidateValues
    .map((candidate) => normalizeSearchText(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function normalizePayload(payload: unknown): { records: Record<string, unknown>[]; empty: boolean } {
  if (payload === null || payload === undefined) {
    return { records: [], empty: true };
  }
  if (Array.isArray(payload)) {
    const records = payload.filter(isRecord);
    return {
      records,
      empty: payload.length === 0
    };
  }
  if (!isRecord(payload)) {
    return { records: [], empty: false };
  }
  if (Array.isArray(payload.items)) {
    const records = payload.items.filter(isRecord);
    return { records, empty: payload.items.length === 0 };
  }
  if (Array.isArray(payload.estimates)) {
    const records = payload.estimates.filter(isRecord);
    return { records, empty: payload.estimates.length === 0 };
  }
  if (isRecord(payload.data)) {
    return { records: [payload.data], empty: Object.keys(payload.data).length === 0 };
  }
  if (isRecord(payload.estimate)) {
    return { records: [payload.estimate], empty: Object.keys(payload.estimate).length === 0 };
  }
  if (typeof payload.estimate_id === 'string' || typeof payload.id === 'string') {
    return { records: [payload], empty: Object.keys(payload).length === 0 };
  }
  return { records: [], empty: false };
}

function normalizeDateCandidate(record: Record<string, unknown>): number | null {
  const candidates = [record.date, record.created_at, record.updated_at, record.issued_at, record.observed_at];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function compareOptionalStringsDesc(left: string | null, right: string | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return naturalComparator.compare(right, left);
}

function compareOptionalNumbersDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (left === right) {
    return 0;
  }
  return right - left;
}

function recordMatchesQuery(record: Record<string, unknown>, query: ResourceQuery): boolean {
  const lookupTerms = collectQueryLookupTerms(query);
  if (lookupTerms.length > 0) {
    const candidateTerms = collectRecordLookupCandidates(record);
    return candidateTerms.some((candidate) => lookupTerms.some((lookup) => candidate.includes(lookup)));
  }

  const resource_id = normalizeOptionalString(query.resource_id);
  if (!resource_id) {
    return false;
  }
  const candidate = extractRecordId(record);
  return candidate !== null && normalizeSearchText(candidate) === normalizeSearchText(resource_id);
}

function selectMatchingRecord(records: Record<string, unknown>[], query: ResourceQuery): Record<string, unknown> | null {
  const matches = records.filter((record) => recordMatchesQuery(record, query));
  if (matches.length === 0) {
    return null;
  }
  const ranked = matches
    .map((record) => ({
      record,
      timestamp: normalizeDateCandidate(record),
      documentNumber: extractRecordDocumentNumber(record),
      recordId: extractRecordId(record)
    }))
    .sort((left, right) => {
      const dateComparison = compareOptionalNumbersDesc(left.timestamp, right.timestamp);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      const documentComparison = compareOptionalStringsDesc(left.documentNumber, right.documentNumber);
      if (documentComparison !== 0) {
        return documentComparison;
      }
      const idComparison = compareOptionalStringsDesc(left.recordId, right.recordId);
      if (idComparison !== 0) {
        return idComparison;
      }
      return 0;
    });
  return ranked[0]?.record ?? null;
}

function createSourceEvidenceForRecord(input: {
  query: ResourceQuery;
  record: Record<string, unknown>;
  record_id: string;
  observed_at: string;
}): [SourceEvidence, ...SourceEvidence[]] {
  const fieldPaths = collectFieldPaths(input.record);
  const evidence = fieldPaths.map((fieldPath, index) =>
      createSourceEvidence({
        source_id: createDeterministicId('holded-source', {
          module_key: HOLDed_READ_MODULE_KEY,
          installation_id: input.query.organization_id ?? 'unknown',
          resource_id: input.record_id,
          field_path: fieldPath,
          correlation_id: input.query.correlation_id ?? '',
          index
        }),
      source_type: 'estimate',
      source_system: HOLDed_SOURCE_SYSTEM,
      resource_id: input.record_id,
      record_id: input.record_id,
      field_path: fieldPath,
      observed_at: input.observed_at,
      correlation_id: input.query.correlation_id ?? ''
    })
  );
  return evidence as [SourceEvidence, ...SourceEvidence[]];
}

function createBaseResult(input: {
  query: ResourceQuery;
  adapter_id: string;
  status: ResourceResult['status'];
  reason: string;
  authorization: ExternalReadAdapterAuthorization;
  resource_id: string | null;
  produced_by_adapter?: boolean;
}): {
  query_id: string;
  organization_id: string;
  correlation_id: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
  evidence_links: string[];
  produced_by_adapter: boolean;
  decision: ExternalReadAdapterDecision;
} {
  return {
    query_id: input.query.query_id,
    organization_id: input.query.organization_id ?? 'unknown',
    correlation_id: input.query.correlation_id ?? 'unknown',
    resource_type: input.query.resource_type,
    resource_id: input.resource_id,
    created_at: new Date().toISOString(),
    evidence_links: [],
    produced_by_adapter: input.produced_by_adapter ?? true,
    decision: buildDecision({
      query: input.query,
      adapter_id: input.adapter_id,
      status: input.status,
      reason: input.reason,
      authorization: input.authorization
    })
  };
}

function createTerminalResult(
  input: {
    query: ResourceQuery;
    adapter_id: string;
    status: Exclude<ResourceResult['status'], 'found'>;
    reason: string;
    authorization: ExternalReadAdapterAuthorization;
    resource_id: string | null;
    produced_by_adapter?: boolean;
  }
): ExternalResourceNotFound | ExternalSystemUnavailable | ExternalSystemError | ExternalReadAdapterDeniedResult | ExternalReadAdapterBlockedResult {
  return {
    ...createBaseResult(input),
    status: input.status,
    data: null,
    source_evidence: null,
    error: input.reason
  } as ExternalResourceNotFound | ExternalSystemUnavailable | ExternalSystemError | ExternalReadAdapterDeniedResult | ExternalReadAdapterBlockedResult;
}

function cloneResourceResult(result: ResourceResult): ResourceResult {
  return {
    ...result,
    evidence_links: [...result.evidence_links],
    decision: {
      ...result.decision,
      authorization: {
        ...result.decision.authorization,
        actor: result.decision.authorization.actor ? { ...result.decision.authorization.actor } : null
      }
    },
    source_evidence:
      result.status === 'found' && result.source_evidence
        ? result.source_evidence.map((item) => ({ ...item }))
        : null,
    data: result.status === 'found' ? structuredClone(result.data) : null
  } as ResourceResult;
}

function isInactiveReason(reason: string): boolean {
  return reason.includes('inactive') || reason.includes('not installed') || reason.includes('API key missing');
}

function isBlockedReason(reason: string): boolean {
  return reason.includes('invalid') || reason.includes('unsupported');
}

function parseJsonSafely(rawText: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (rawText.trim().length === 0) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(rawText) as unknown };
  } catch {
    return { ok: false, reason: 'Holded response payload invalid' };
  }
}

function buildFoundResult(input: {
  query: ResourceQuery;
  adapter_id: string;
  authorization: ExternalReadAdapterAuthorization;
  resource_id: string | null;
  record: Record<string, unknown>;
  record_id: string;
  observed_at: string;
}): ResourceResult {
  const data = {
    ...structuredClone(input.record),
    resource_type: 'estimate',
    source_system: HOLDed_SOURCE_SYSTEM,
    module_key: HOLDed_READ_MODULE_KEY,
    installation_id: input.query.organization_id,
    lookup_mode: lookupMode(input.query)
  };
  const result = validateResourceResult({
    ...createBaseResult({
      query: input.query,
      adapter_id: input.adapter_id,
      status: 'found',
      reason: 'Holded estimate found',
      authorization: input.authorization,
      resource_id: input.resource_id,
      produced_by_adapter: true
    }),
    status: 'found',
    data,
    source_evidence: createSourceEvidenceForRecord({
      query: input.query,
      record: input.record,
      record_id: input.record_id,
      observed_at: input.observed_at
    }),
    error: null
  } as ResourceFoundResult);
  if (result.status !== 'found') {
    return createTerminalResult({
      query: input.query,
      adapter_id: input.adapter_id,
      status: 'error',
      reason: 'Holded source evidence unavailable',
      authorization: input.authorization,
      resource_id: input.resource_id,
      produced_by_adapter: true
    });
  }
  return result;
}

export class HoldedReadAdapter implements ExternalReadAdapter {
  readonly adapter_id: string;
  readonly source_system: string = HOLDed_SOURCE_SYSTEM;
  readonly module_key: string;
  readonly installation_id: string;
  private readonly activeModules: string[];
  private readonly fetch: HoldedFetch;
  private readonly now: () => Date;
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly moduleRegistered: boolean;

  constructor(options: HoldedReadAdapterOptions) {
    this.adapter_id = options.adapter_id ?? options.module_key ?? HOLDed_READ_MODULE_KEY;
    this.module_key = options.module_key ?? HOLDed_READ_MODULE_KEY;
    this.installation_id = options.installation.installation_id;
    this.activeModules = [...options.installation.active_modules];
    this.fetch = options.fetch;
    this.now = options.now ?? (() => new Date());
    this.apiKey = normalizeApiKey(options.apiKey ?? process.env.KERN_HOLDED_API_KEY ?? null);
    this.baseUrl = trimBaseUrl(options.baseUrl ?? process.env.KERN_HOLDED_BASE_URL ?? 'https://api.holded.com');
    this.moduleRegistered = options.module_registered ?? true;
  }

  authorize(query: ResourceQuery): ExternalReadAdapterAuthorization {
    if (!this.moduleRegistered) {
      return buildAuthorization({
        adapter_id: this.adapter_id,
        query,
        authorized: false,
        reason: 'holded module not installed'
      });
    }
    if (!isActiveForInstallation({ installation_id: this.installation_id, active_modules: this.activeModules }, this.module_key)) {
      return buildAuthorization({
        adapter_id: this.adapter_id,
        query,
        authorized: false,
        reason: 'holded module inactive for installation'
      });
    }
    if (!this.apiKey) {
      return buildAuthorization({
        adapter_id: this.adapter_id,
        query,
        authorized: false,
        reason: 'Holded API key missing'
      });
    }
    const validationReason = validateQuery(query);
    if (validationReason) {
      return buildAuthorization({
        adapter_id: this.adapter_id,
        query,
        authorized: false,
        reason: validationReason
      });
    }
    return buildAuthorization({
      adapter_id: this.adapter_id,
      query,
      authorized: true,
      reason: 'resource query authorized'
    });
  }

  read(query: ResourceQuery): ResourceResult {
    const normalized = normalizeResourceQuery(query);
    const authorization = this.authorize(normalized);
    const resource_id = normalizeOptionalString(normalized.resource_id) ?? normalizeOptionalString(normalized.filters?.customer_id) ?? null;

    if (!authorization.authorized) {
      const reason = authorization.reason;
      const status = isInactiveReason(reason) ? 'denied' : isBlockedReason(reason) ? 'blocked' : 'denied';
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status,
          reason,
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }

    const endpoint = buildEndpoint(this.baseUrl, normalized);
    let response: HoldedFetchResponse;
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json'
      };
      if (this.apiKey) {
        headers.key = this.apiKey;
      }
      response = this.fetch(endpoint, {
        method: 'GET',
        headers
      });
    } catch {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'unavailable',
          reason: 'Holded transport unavailable',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }

    const responseText = readResponseText(response);
    if (response.status === 401 || response.status === 403) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'denied',
          reason: 'Holded authorization denied',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }
    if (response.status === 404) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'error',
          reason: 'Holded endpoint not available',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }
    if (!response.ok) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: response.status >= 500 ? 'error' : 'error',
          reason: responseText || 'Holded response error',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }

    const parsed = parseJsonSafely(responseText);
    if (!parsed.ok) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'error',
          reason: parsed.reason,
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }

    const payload = normalizePayload(parsed.value);
    if (payload.empty) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'not_found',
          reason: 'Holded estimate list empty',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }
  const record = selectMatchingRecord(payload.records, normalized);
  if (!record) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'not_found',
          reason: 'Holded estimate not found',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }
    const record_id = extractRecordId(record);
    if (!record_id) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'error',
          reason: 'Holded estimate missing id',
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }

    const found = buildFoundResult({
      query: normalized,
      adapter_id: this.adapter_id,
      authorization,
      resource_id,
      record,
      record_id,
      observed_at: this.now().toISOString()
    });
    return cloneResourceResult(found);
  }
}

function readResponseText(response: HoldedFetchResponse): string {
  try {
    return response.text();
  } catch {
    return '';
  }
}

export function createHoldedReadAdapter(options: HoldedReadAdapterOptions): HoldedReadAdapter {
  return new HoldedReadAdapter(options);
}

export function createHoldedReadModuleDefinition(): HoldedModuleDefinition {
  return {
    module_key: HOLDed_READ_MODULE_KEY,
    display_name: 'Holded estimate read adapter',
    createAdapter(options: HoldedReadAdapterOptions): ExternalReadAdapter {
      return new HoldedReadAdapter(options);
    }
  };
}

export function createHoldedModuleRegistry(definitions: HoldedModuleDefinition[] = []): HoldedModuleRegistry {
  const registry = new InMemoryHoldedModuleRegistry();
  for (const definition of definitions) {
    registry.register(definition);
  }
  return registry;
}

export function registerHoldedReadModule(registry: HoldedModuleRegistry): HoldedModuleDefinition {
  return registry.register(createHoldedReadModuleDefinition());
}

export function resolveHoldedReadAdapterForInstallation(input: {
  registry: HoldedModuleRegistry;
  manifest: HoldedInstallationManifest;
  options: Omit<HoldedReadAdapterOptions, 'installation'>;
  module_key?: string;
}): ExternalReadAdapter {
  const moduleKey = input.module_key ?? HOLDed_READ_MODULE_KEY;
  const definition = input.registry.get(moduleKey);
  const module_registered = Boolean(definition);
  const adapterOptions: HoldedReadAdapterOptions = {
    ...input.options,
    installation: input.manifest,
    module_key: moduleKey,
    module_registered
  };
  return definition ? definition.createAdapter(adapterOptions) : new HoldedReadAdapter(adapterOptions);
}
