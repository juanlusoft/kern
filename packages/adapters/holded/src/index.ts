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
  type ResourceListAggregate,
  type ResourceListRecord,
  type ResourceListResultData,
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
  page_size?: number;
  max_pages?: number;
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

function normalizeQueryParamValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const candidate = value.trim();
    return candidate.length > 0 ? candidate : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return null;
}

function normalizeDocumentType(value: unknown): 'estimate' | 'invoice' | null {
  const candidate = normalizeOptionalString(value);
  return candidate === 'estimate' || candidate === 'invoice' ? candidate : null;
}

function normalizePaymentStatus(value: unknown): 'pending' | 'paid' | 'overdue' | null {
  const candidate = normalizeOptionalString(value);
  return candidate === 'pending' || candidate === 'paid' || candidate === 'overdue' ? candidate : null;
}

function normalizeYear(value: unknown): string | null {
  const candidate = normalizeOptionalString(value);
  return candidate && /^\d{4}$/.test(candidate) ? candidate : null;
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

function normalizeTimestampMilliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validateQuery(input: ResourceQuery): string | null {
  if (normalizeOptionalString(input.query_id) === null) return 'resource query invalid';
  if (normalizeOptionalString(input.organization_id) === null) return 'resource query invalid';
  if (normalizeOptionalString(input.correlation_id) === null) return 'resource query invalid';
  if (input.actor === null || normalizeOptionalString(input.actor.principal_id) === null) return 'resource query invalid';
  if (normalizeDocumentType(input.resource_type) === null) return 'resource query invalid';
  if (input.year !== undefined && input.year !== null && normalizeYear(input.year) === null) return 'resource query invalid';
  const payment_status = input.payment_status === null || input.payment_status === undefined ? null : normalizePaymentStatus(input.payment_status);
  if (input.payment_status !== null && input.payment_status !== undefined && payment_status === null) return 'resource query invalid';
  if (payment_status && normalizeDocumentType(input.resource_type) !== 'invoice') return 'payment_status only applies to invoice';
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
  if (!resource_id && !customer_id && !contact_id && !contact && !contact_name && !customer_name && !payment_status && normalizeYear(input.year) === null) return 'resource query invalid';
  return null;
}

function lookupMode(query: ResourceQuery): 'by_id' | 'by_customer' | 'by_status' | 'by_year' {
  if (normalizeYear(query.year)) {
    return 'by_year';
  }
  if (normalizePaymentStatus(query.payment_status)) {
    return collectQueryLookupTerms(query).length > 0 ? 'by_customer' : 'by_status';
  }
  return collectQueryLookupTerms(query).length > 0 ? 'by_customer' : 'by_id';
}

function buildEndpoint(baseUrl: string, query: ResourceQuery): string {
  return `${baseUrl}/api/invoicing/v1/documents/${normalizeDocumentType(query.resource_type) ?? 'estimate'}`;
}

const HOLDed_PAGE_SIZE_DEFAULT = 500;
const HOLDed_MAX_PAGES_DEFAULT = 50;

function normalizePageLimit(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return fallback;
}

function collectHoldedPreservedQueryParams(query: ResourceQuery): Array<[string, string]> {
  const filters = query.filters && isRecord(query.filters) ? query.filters : null;
  if (!filters) {
    return [];
  }
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'year') {
      continue;
    }
    const candidate = normalizeQueryParamValue(value);
    if (candidate !== null) {
      entries.push([key, candidate]);
    }
  }
  return entries;
}

function buildYearRangeQueryParams(year: string | null | undefined): Array<[string, string]> {
  const normalized = normalizeYear(year);
  if (!normalized) {
    return [];
  }
  const yearNumber = Number(normalized);
  const starttmp = new Date(Date.UTC(yearNumber, 0, 1, 0, 0, 0, 0)).toISOString();
  const endtmp = new Date(Date.UTC(yearNumber, 11, 31, 23, 59, 59, 999)).toISOString();
  return [
    ['starttmp', starttmp],
    ['endtmp', endtmp]
  ];
}

function buildEndpointWithPage(baseUrl: string, query: ResourceQuery, page: number | null): string {
  const endpoint = new URL(`${trimBaseUrl(baseUrl)}/api/invoicing/v1/documents/${normalizeDocumentType(query.resource_type) ?? 'estimate'}`);
  for (const [key, value] of collectHoldedPreservedQueryParams(query)) {
    endpoint.searchParams.set(key, value);
  }
  for (const [key, value] of buildYearRangeQueryParams(query.year)) {
    endpoint.searchParams.set(key, value);
  }
  if (page !== null) {
    endpoint.searchParams.set('page', String(page));
  }
  return endpoint.toString();
}

function collectFieldPaths(record: Record<string, unknown>): string[] {
  const keys = Object.keys(record);
  return keys.length > 0 ? keys : ['resource'];
}

const naturalComparator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function extractRecordId(record: Record<string, unknown>): string | null {
  const candidate =
    record.estimate_id ??
    record.invoice_id ??
    record.invoiceId ??
    record.document_id ??
    record.documentId ??
    record.id ??
    record.resource_id;
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
  if (Array.isArray(payload.invoices)) {
    const records = payload.invoices.filter(isRecord);
    return { records, empty: payload.invoices.length === 0 };
  }
  if (isRecord(payload.data)) {
    return { records: [payload.data], empty: Object.keys(payload.data).length === 0 };
  }
  if (isRecord(payload.estimate)) {
    return { records: [payload.estimate], empty: Object.keys(payload.estimate).length === 0 };
  }
  if (isRecord(payload.invoice)) {
    return { records: [payload.invoice], empty: Object.keys(payload.invoice).length === 0 };
  }
  if (typeof payload.estimate_id === 'string' || typeof payload.id === 'string') {
    return { records: [payload], empty: Object.keys(payload).length === 0 };
  }
  return { records: [], empty: false };
}

function normalizeDateCandidate(record: Record<string, unknown>): number | null {
  const candidates = [record.date, record.created_at, record.updated_at, record.issued_at, record.observed_at];
  for (const candidate of candidates) {
    const normalized = normalizeTimestampMilliseconds(candidate);
    if (normalized !== null) {
      return normalized;
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

function normalizeRecordStatus(record: Record<string, unknown>): number | null {
  const candidate = record.status;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'string') {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePaymentsPending(record: Record<string, unknown>): number | null {
  const candidate = record.paymentsPending;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'string') {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDueDate(record: Record<string, unknown>): number | null {
  return normalizeTimestampMilliseconds(record.dueDate);
}

function deriveInvoicePaymentStatus(record: Record<string, unknown>, now: () => Date): 'pending' | 'paid' | 'overdue' {
  const status = normalizeRecordStatus(record);
  const paymentsPending = normalizePaymentsPending(record);
  const dueDate = normalizeDueDate(record);
  const isPending = status === 0 || (paymentsPending !== null && paymentsPending > 0);
  const isPaid = status === 1 || (paymentsPending !== null && paymentsPending <= 0);
  const isOverdue = isPending && dueDate !== null && dueDate < now().getTime();

  if (isPaid) {
    return 'paid';
  }
  if (isOverdue) {
    return 'overdue';
  }
  return 'pending';
}

function recordMatchesInvoicePaymentStatus(
  record: Record<string, unknown>,
  payment_status: 'pending' | 'paid' | 'overdue',
  now: () => Date
): boolean {
  const status = normalizeRecordStatus(record);
  const paymentsPending = normalizePaymentsPending(record);
  const dueDate = normalizeDueDate(record);
  const isPending = status === 0 || (paymentsPending !== null && paymentsPending > 0);
  const isPaid = status === 1 || (paymentsPending !== null && paymentsPending <= 0);
  const isOverdue = isPending && dueDate !== null && dueDate < now().getTime();

  switch (payment_status) {
    case 'pending':
      return isPending;
    case 'paid':
      return isPaid;
    case 'overdue':
      return isOverdue;
  }
}

function recordMatchesQuery(record: Record<string, unknown>, query: ResourceQuery, now: () => Date): boolean {
  const year = normalizeYear(query.year);
  if (year) {
    const timestamp = normalizeDateCandidate(record);
    if (timestamp === null || new Date(timestamp).getUTCFullYear() !== Number(year)) {
      return false;
    }
  }
  const payment_status = normalizePaymentStatus(query.payment_status);
  if (payment_status && !recordMatchesInvoicePaymentStatus(record, payment_status, now)) {
    return false;
  }

  const lookupTerms = collectQueryLookupTerms(query);
  if (lookupTerms.length > 0) {
    const candidateTerms = collectRecordLookupCandidates(record);
    const matchesLookup = candidateTerms.some((candidate) => lookupTerms.some((lookup) => candidate.includes(lookup)));
    return matchesLookup;
  }

  const resource_id = normalizeOptionalString(query.resource_id);
  if (!resource_id) {
    return payment_status !== null || lookupTerms.length > 0;
  }
  const candidate = extractRecordId(record);
  return candidate !== null && normalizeSearchText(candidate) === normalizeSearchText(resource_id);
}

function selectMatchingRecords(
  records: Record<string, unknown>[],
  query: ResourceQuery,
  now: () => Date
): Record<string, unknown>[] {
  const matches = records.filter((record) => recordMatchesQuery(record, query, now));
  if (matches.length === 0) {
    return [];
  }
  return matches
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
    })
    .map((entry) => entry.record);
}

function selectMatchingRecord(records: Record<string, unknown>[], query: ResourceQuery, now: () => Date): Record<string, unknown> | null {
  const matches = selectMatchingRecords(records, query, now);
  if (matches.length === 0) {
    return null;
  }
  return matches[0] ?? null;
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
      source_type: normalizeDocumentType(input.query.resource_type) ?? 'estimate',
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

function buildListRecord(input: {
  query: ResourceQuery;
  record: Record<string, unknown>;
  record_id: string;
  observed_at: string;
  now: () => Date;
}): ResourceListRecord {
  const record_id = normalizeOptionalString(input.record_id) ?? 'unknown';
  const payment_status = normalizePaymentStatus(input.query.payment_status) ?? deriveInvoicePaymentStatus(input.record, input.now);
  const total =
    typeof input.record.total === 'number' && Number.isFinite(input.record.total)
      ? input.record.total
      : typeof input.record.total_amount === 'number' && Number.isFinite(input.record.total_amount)
        ? input.record.total_amount
        : null;
  return {
    ...structuredClone(input.record),
    record_id,
    resource_type: 'invoice',
    payment_status,
    status: normalizeRecordStatus(input.record),
    paymentsPending: normalizePaymentsPending(input.record),
    dueDate: normalizeDueDate(input.record),
    total,
    docNumber: extractRecordDocumentNumber(input.record),
    contactName:
      normalizeOptionalString(input.record.contactName) ??
      normalizeOptionalString(input.record.customer_name) ??
      normalizeOptionalString(input.record.customerName) ??
      normalizeOptionalString(input.record.contact_name) ??
      normalizeOptionalString(input.record.contact) ??
      null,
    source_evidence: createSourceEvidenceForRecord({
      query: input.query,
      record: input.record,
      record_id,
      observed_at: input.observed_at
    }),
    data: structuredClone(input.record)
  };
}

function buildListAggregate(records: ResourceListRecord[]): ResourceListAggregate {
  return {
    count: records.length,
    paymentsPendingTotal: records.reduce((sum, record) => sum + (record.paymentsPending ?? 0), 0)
  };
}

function buildListFoundResult(input: {
  query: ResourceQuery;
  adapter_id: string;
  authorization: ExternalReadAdapterAuthorization;
  resource_id: string | null;
  records: Record<string, unknown>[];
  observed_at: string;
  now: () => Date;
  truncated?: boolean;
}): ResourceResult {
  const payment_status = normalizePaymentStatus(input.query.payment_status);
  const lookup_mode = lookupMode(input.query);
  const listLabel = payment_status ?? (normalizeYear(input.query.year) ? input.query.year : 'list');
  const listRecords = input.records
    .map((record) => {
      const record_id = extractRecordId(record) ?? extractRecordDocumentNumber(record);
      return record_id
        ? buildListRecord({
            query: input.query,
            record,
            record_id,
            observed_at: input.observed_at,
            now: input.now
          })
        : null;
    })
    .filter((record): record is ResourceListRecord => Boolean(record));
  if (listRecords.length === 0) {
    return createTerminalResult({
      query: input.query,
      adapter_id: input.adapter_id,
      status: 'not_found',
      reason: `Holded invoice list empty for ${listLabel}`,
      authorization: input.authorization,
      resource_id: input.resource_id,
      produced_by_adapter: true
    });
  }
  const result = validateResourceResult({
    ...createBaseResult({
      query: input.query,
      adapter_id: input.adapter_id,
      status: 'found',
      reason: `Holded invoice list found for ${payment_status}`,
      authorization: input.authorization,
      resource_id: input.resource_id,
      produced_by_adapter: true
    }),
    status: 'found',
    data: {
      kind: 'list',
      result_mode: 'list',
      resource_type: 'invoice',
      payment_status,
      lookup_mode,
      ...(input.query.year ? { year: input.query.year } : {}),
      records: listRecords,
      aggregate: buildListAggregate(listRecords),
      ...(input.truncated ? { truncated: true } : {})
    } as unknown as Record<string, unknown>,
    source_evidence: listRecords.flatMap((record) => [...record.source_evidence]) as [SourceEvidence, ...SourceEvidence[]],
    error: null
  } as ResourceFoundResult);
  if (result.status !== 'found') {
    return createTerminalResult({
      query: input.query,
      adapter_id: input.adapter_id,
      status: 'error',
      reason: 'Holded invoice list source evidence unavailable',
      authorization: input.authorization,
      resource_id: input.resource_id,
      produced_by_adapter: true
    });
  }
  return result;
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
    resource_type: normalizeDocumentType(input.query.resource_type) ?? input.query.resource_type,
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
  return reason.includes('invalid') || reason.includes('unsupported') || reason.includes('payment_status only applies to invoice');
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

function dedupeRecordsById(records: Record<string, unknown>[]): Record<string, unknown>[] {
  const seenIds = new Set<string>();
  const deduped: Record<string, unknown>[] = [];
  for (const record of records) {
    const recordId = extractRecordId(record);
    if (recordId) {
      if (seenIds.has(recordId)) {
        continue;
      }
      seenIds.add(recordId);
    }
    deduped.push(record);
  }
  return deduped;
}

type HoldedPageFetchOutcome =
  | { ok: true; records: Record<string, unknown>[]; empty: boolean }
  | { ok: false; result: ResourceResult };

function fetchHoldedDocumentPage(input: {
  query: ResourceQuery;
  adapter_id: string;
  authorization: ExternalReadAdapterAuthorization;
  resource_id: string | null;
  endpoint: string;
  fetch: HoldedFetch;
  apiKey: string | null;
}): HoldedPageFetchOutcome {
  let response: HoldedFetchResponse;
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (input.apiKey) {
      headers.key = input.apiKey;
    }
    response = input.fetch(input.endpoint, {
      method: 'GET',
      headers
    });
  } catch {
    return {
      ok: false,
      result: cloneResourceResult(
        createTerminalResult({
          query: input.query,
          adapter_id: input.adapter_id,
          status: 'unavailable',
          reason: 'Holded transport unavailable',
          authorization: input.authorization,
          resource_id: input.resource_id,
          produced_by_adapter: true
        })
      )
    };
  }

  const responseText = readResponseText(response);
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      result: cloneResourceResult(
        createTerminalResult({
          query: input.query,
          adapter_id: input.adapter_id,
          status: 'denied',
          reason: 'Holded authorization denied',
          authorization: input.authorization,
          resource_id: input.resource_id,
          produced_by_adapter: true
        })
      )
    };
  }
  if (response.status === 404) {
    return {
      ok: false,
      result: cloneResourceResult(
        createTerminalResult({
          query: input.query,
          adapter_id: input.adapter_id,
          status: 'error',
          reason: 'Holded endpoint not available',
          authorization: input.authorization,
          resource_id: input.resource_id,
          produced_by_adapter: true
        })
      )
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      result: cloneResourceResult(
        createTerminalResult({
          query: input.query,
          adapter_id: input.adapter_id,
          status: response.status >= 500 ? 'error' : 'error',
          reason: responseText || 'Holded response error',
          authorization: input.authorization,
          resource_id: input.resource_id,
          produced_by_adapter: true
        })
      )
    };
  }

  const parsed = parseJsonSafely(responseText);
  if (!parsed.ok) {
    return {
      ok: false,
      result: cloneResourceResult(
        createTerminalResult({
          query: input.query,
          adapter_id: input.adapter_id,
          status: 'error',
          reason: parsed.reason,
          authorization: input.authorization,
          resource_id: input.resource_id,
          produced_by_adapter: true
        })
      )
    };
  }

  const payload = normalizePayload(parsed.value);
  if (payload.empty) {
    return { ok: true, records: [], empty: true };
  }
  return { ok: true, records: payload.records, empty: false };
}

function fetchHoldedDocumentPages(input: {
  query: ResourceQuery;
  adapter_id: string;
  authorization: ExternalReadAdapterAuthorization;
  resource_id: string | null;
  fetch: HoldedFetch;
  apiKey: string | null;
  baseUrl: string;
  page_size: number;
  max_pages: number;
}): { ok: true; records: Record<string, unknown>[]; truncated: boolean; empty: boolean } | { ok: false; result: ResourceResult } {
  const records: Record<string, unknown>[] = [];
  let truncated = false;
  for (let page = 1; page <= input.max_pages; page += 1) {
    const endpoint = buildEndpointWithPage(input.baseUrl, input.query, page);
    const outcome = fetchHoldedDocumentPage({
      query: input.query,
      adapter_id: input.adapter_id,
      authorization: input.authorization,
      resource_id: input.resource_id,
      endpoint,
      fetch: input.fetch,
      apiKey: input.apiKey
    });
    if (!outcome.ok) {
      return outcome;
    }
    if (outcome.records.length === 0) {
      return {
        ok: true,
        records: dedupeRecordsById(records),
        truncated,
        empty: page === 1
      };
    }
    records.push(...outcome.records);
    if (outcome.records.length < input.page_size) {
      return {
        ok: true,
        records: dedupeRecordsById(records),
        truncated,
        empty: false
      };
    }
    if (page === input.max_pages) {
      truncated = true;
      return {
        ok: true,
        records: dedupeRecordsById(records),
        truncated,
        empty: false
      };
    }
  }
  return {
    ok: true,
    records: dedupeRecordsById(records),
    truncated,
    empty: records.length === 0
  };
}

function buildFoundResult(input: {
  query: ResourceQuery;
  adapter_id: string;
  authorization: ExternalReadAdapterAuthorization;
  resource_id: string | null;
  record: Record<string, unknown>;
  record_id: string;
  observed_at: string;
  truncated?: boolean;
}): ResourceResult {
  const data = {
    ...structuredClone(input.record),
    dueDate: normalizeDueDate(input.record),
    resource_type: normalizeDocumentType(input.query.resource_type) ?? 'estimate',
    source_system: HOLDed_SOURCE_SYSTEM,
    module_key: HOLDed_READ_MODULE_KEY,
    installation_id: input.query.organization_id,
    lookup_mode: lookupMode(input.query),
    ...(input.truncated ? { truncated: true } : {})
  };
  const documentType = normalizeDocumentType(input.query.resource_type) ?? 'estimate';
  const result = validateResourceResult({
    ...createBaseResult({
      query: input.query,
      adapter_id: input.adapter_id,
      status: 'found',
      reason: `Holded ${documentType} found`,
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
  private readonly pageSize: number;
  private readonly maxPages: number;
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
    this.pageSize = normalizePageLimit(options.page_size, HOLDed_PAGE_SIZE_DEFAULT);
    this.maxPages = normalizePageLimit(options.max_pages, HOLDed_MAX_PAGES_DEFAULT);
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
    const payment_status = normalizePaymentStatus(normalized.payment_status);

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

    if (payment_status || normalizeYear(normalized.year)) {
      const documentType = normalizeDocumentType(normalized.resource_type) ?? 'estimate';
      const listLabel = payment_status ?? (normalizeYear(normalized.year) ? normalized.year : 'list');
      const paginated = fetchHoldedDocumentPages({
        query: normalized,
        adapter_id: this.adapter_id,
        authorization,
        resource_id,
        fetch: this.fetch,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        page_size: this.pageSize,
        max_pages: this.maxPages
      });
      if (!paginated.ok) {
        return paginated.result;
      }
      if (paginated.empty || paginated.records.length === 0) {
        return cloneResourceResult(
          createTerminalResult({
            query: normalized,
            adapter_id: this.adapter_id,
            status: 'not_found',
            reason: `Holded ${documentType} list empty`,
            authorization,
            resource_id,
            produced_by_adapter: true
          })
        );
      }
      const records = selectMatchingRecords(paginated.records, normalized, this.now);
      if (records.length === 0) {
        return cloneResourceResult(
          createTerminalResult({
            query: normalized,
            adapter_id: this.adapter_id,
            status: 'not_found',
            reason: `Holded ${documentType} list empty for ${listLabel}`,
            authorization,
            resource_id,
            produced_by_adapter: true
          })
        );
      }
      return cloneResourceResult(
        buildListFoundResult({
          query: normalized,
          adapter_id: this.adapter_id,
          authorization,
          resource_id,
          records,
          observed_at: this.now().toISOString(),
          now: this.now,
          truncated: paginated.truncated
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
      const documentType = normalizeDocumentType(normalized.resource_type) ?? 'estimate';
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'not_found',
          reason: `Holded ${documentType} list empty`,
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }
    const documentType = normalizeDocumentType(normalized.resource_type) ?? 'estimate';
    const record = selectMatchingRecord(payload.records, normalized, this.now);
    if (!record) {
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'not_found',
          reason: `Holded ${documentType} not found`,
          authorization,
          resource_id,
          produced_by_adapter: true
        })
      );
    }
    const record_id = extractRecordId(record);
    if (!record_id) {
      const documentType = normalizeDocumentType(normalized.resource_type) ?? 'estimate';
      return cloneResourceResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          status: 'error',
          reason: `Holded ${documentType} missing id`,
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
    display_name: 'Holded estimate and invoice read adapter',
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
