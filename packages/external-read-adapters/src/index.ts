import {
  createSourceEvidence,
  normalizeResourceQuery,
  type ExternalReadAdapter,
  type ExternalReadAdapterAuthorization,
  type ExternalReadAdapterDecision,
  type ResourceQuery,
  type ResourceResult,
  type ResourceFoundResult,
  type ExternalResourceNotFound,
  type ExternalSystemUnavailable,
  type ExternalSystemError,
  type ExternalReadAdapterDeniedResult,
  type ExternalReadAdapterBlockedResult
} from '../../contracts/src/index';

type MockReadScenario =
  | 'found'
  | 'not_found'
  | 'unavailable'
  | 'error'
  | 'denied'
  | 'blocked'
  | 'found_without_source_evidence';

interface SeededResource {
  organization_id: string;
  resource_type: string;
  resource_id: string;
  data: Record<string, unknown>;
  source_evidence?: ReturnType<typeof createSourceEvidence>[];
  scenario?: MockReadScenario;
  reason?: string;
}

export interface InMemoryExternalReadAdapterOptions {
  adapter_id?: string;
  source_system?: string;
  now?: () => Date;
}

function cloneSourceEvidence(sourceEvidence: ReturnType<typeof createSourceEvidence>): ReturnType<typeof createSourceEvidence> {
  return { ...sourceEvidence };
}

function cloneResourceResult(result: ResourceResult): ResourceResult {
  return {
    ...result,
    evidence_links: [...result.evidence_links],
    decision: {
      ...result.decision,
      authorization: {
        ...result.decision.authorization,
        actor: result.decision.authorization.actor
          ? {
              ...result.decision.authorization.actor
            }
          : null
      }
    },
    source_evidence:
      result.status === 'found' && result.source_evidence
        ? result.source_evidence.map((sourceEvidence) => cloneSourceEvidence(sourceEvidence))
        : null,
    data: result.status === 'found' ? structuredClone(result.data) : null
  } as ResourceResult;
}

function createDecisionBase(input: {
  query_id: string;
  adapter_id: string;
  source_system: string;
  status: ResourceResult['status'];
  reason: string;
  authorization: ExternalReadAdapterAuthorization;
}): ExternalReadAdapterDecision {
  return {
    query_id: input.query_id,
    adapter_id: input.adapter_id,
    source_system: input.source_system,
    status: input.status,
    reason: input.reason,
    authorization: input.authorization
  };
}

function createFoundResult(input: {
  query: ResourceQuery;
  adapter_id: string;
  source_system: string;
  data: Record<string, unknown>;
  source_evidence: ReturnType<typeof createSourceEvidence>[];
  reason?: string;
}): ResourceFoundResult {
  const authorization: ExternalReadAdapterAuthorization = {
    adapter_id: input.adapter_id,
    source_system: input.source_system,
    organization_id: input.query.organization_id,
    correlation_id: input.query.correlation_id ?? '',
    actor: input.query.actor,
    authorized: true,
    reason: input.reason ?? 'resource found'
  };
  return {
    query_id: input.query.query_id,
    organization_id: input.query.organization_id ?? 'unknown',
    correlation_id: input.query.correlation_id ?? 'unknown',
    resource_type: input.query.resource_type,
    resource_id: input.query.resource_id ?? null,
    created_at: new Date().toISOString(),
    evidence_links: input.source_evidence.map((sourceEvidence) => sourceEvidence.source_id),
    produced_by_adapter: true,
    status: 'found',
    data: structuredClone(input.data),
    source_evidence: input.source_evidence.map((sourceEvidence) => cloneSourceEvidence(sourceEvidence)) as [
      ReturnType<typeof createSourceEvidence>,
      ...ReturnType<typeof createSourceEvidence>[]
    ],
    error: null,
    decision: createDecisionBase({
      query_id: input.query.query_id,
      adapter_id: input.adapter_id,
      source_system: input.source_system,
      status: 'found',
      reason: input.reason ?? 'resource found',
      authorization
    })
  };
}

function createTerminalResult(
  input: {
    query: ResourceQuery;
    adapter_id: string;
    source_system: string;
    status: Exclude<ResourceResult['status'], 'found'>;
    reason: string;
    produced_by_adapter?: boolean;
  }
): ExternalResourceNotFound | ExternalSystemUnavailable | ExternalSystemError | ExternalReadAdapterDeniedResult | ExternalReadAdapterBlockedResult {
  const authorization: ExternalReadAdapterAuthorization = {
    adapter_id: input.adapter_id,
    source_system: input.source_system,
    organization_id: input.query.organization_id,
    correlation_id: input.query.correlation_id ?? '',
    actor: input.query.actor,
    authorized: input.status !== 'denied' && input.status !== 'blocked' ? true : false,
    reason: input.reason
  };
  return {
    query_id: input.query.query_id,
    organization_id: input.query.organization_id ?? 'unknown',
    correlation_id: input.query.correlation_id ?? 'unknown',
    resource_type: input.query.resource_type,
    resource_id: input.query.resource_id ?? null,
    created_at: new Date().toISOString(),
    evidence_links: [],
    produced_by_adapter: input.produced_by_adapter ?? true,
    status: input.status,
    data: null,
    source_evidence: null,
    error: input.reason,
    decision: createDecisionBase({
      query_id: input.query.query_id,
      adapter_id: input.adapter_id,
      source_system: input.source_system,
      status: input.status,
      reason: input.reason,
      authorization
    })
  };
}

export class InMemoryExternalReadAdapter implements ExternalReadAdapter {
  readonly adapter_id: string;
  readonly source_system: string;
  private readonly now: () => Date;
  private readonly records = new Map<string, SeededResource>();

  constructor(options: InMemoryExternalReadAdapterOptions = {}) {
    this.adapter_id = options.adapter_id ?? 'mock.external.read';
    this.source_system = options.source_system ?? 'mock.external.system';
    this.now = options.now ?? (() => new Date());
  }

  seedResource(input: SeededResource): void {
    this.records.set(this.key(input.organization_id, input.resource_type, input.resource_id), {
      ...input,
      source_evidence: input.source_evidence ? input.source_evidence.map((sourceEvidence) => cloneSourceEvidence(sourceEvidence)) : undefined
    });
  }

  clear(): void {
    this.records.clear();
  }

  authorize(query: ResourceQuery): ExternalReadAdapterAuthorization {
    const normalized = normalizeResourceQuery(query);
    const invalid =
      normalized.query_id.trim().length === 0 ||
      normalized.organization_id === null ||
      normalized.organization_id.trim().length === 0 ||
      normalized.correlation_id === null ||
      normalized.correlation_id.trim().length === 0 ||
      normalized.actor === null ||
      normalized.actor.principal_id.trim().length === 0 ||
      normalized.resource_type.trim().length === 0 ||
      (normalized.resource_id === null || normalized.resource_id.trim().length === 0) && !this.hasFilterResourceId(normalized);

    return {
      adapter_id: this.adapter_id,
      source_system: this.source_system,
      organization_id: normalized.organization_id,
      correlation_id: normalized.correlation_id ?? '',
      actor: normalized.actor,
      authorized: !invalid,
      reason: invalid ? 'resource query invalid' : 'resource query authorized'
    };
  }

  read(query: ResourceQuery): ResourceResult {
    const normalized = normalizeResourceQuery(query);
    const authorization = this.authorize(normalized);
    if (!authorization.authorized) {
      return this.finishTerminalResult(
        createTerminalResult({
          query: normalized,
          adapter_id: this.adapter_id,
          source_system: this.source_system,
          status: 'blocked',
          reason: authorization.reason,
          produced_by_adapter: true
        })
      );
    }

    const resourceId = this.resolveResourceId(normalized);
    const key = this.key(normalized.organization_id ?? 'unknown', normalized.resource_type, resourceId);
    const seeded = this.records.get(key);

    const scenario = seeded?.scenario ?? this.scenarioForResourceId(resourceId);
    switch (scenario) {
      case 'denied':
      case 'blocked':
      case 'unavailable':
      case 'error':
      case 'not_found':
        return this.finishTerminalResult(
          createTerminalResult({
            query: normalized,
            adapter_id: this.adapter_id,
            source_system: this.source_system,
            status: scenario,
            reason: seeded?.reason ?? this.defaultReasonForScenario(scenario),
            produced_by_adapter: true
          })
        );
      case 'found_without_source_evidence':
        return this.finishTerminalResult(
          createFoundResult({
            query: normalized,
            adapter_id: this.adapter_id,
            source_system: this.source_system,
            data: seeded?.data ?? this.defaultFoundData(normalized),
            source_evidence: [],
            reason: seeded?.reason ?? 'resource found without source evidence'
          })
        );
      case 'found':
      default: {
        const data = seeded?.data ?? this.defaultFoundData(normalized);
        const sourceEvidence = seeded?.source_evidence ?? this.buildSourceEvidence(normalized, data);
        return this.finishTerminalResult(
          createFoundResult({
            query: normalized,
            adapter_id: this.adapter_id,
            source_system: this.source_system,
            data,
            source_evidence: sourceEvidence,
            reason: seeded?.reason ?? 'resource found'
          })
        );
      }
    }
  }

  private finishTerminalResult(result: ResourceResult): ResourceResult {
    return cloneResourceResult(result);
  }

  private key(organization_id: string, resource_type: string, resource_id: string): string {
    return [organization_id, resource_type, resource_id].join('::');
  }

  private resolveResourceId(query: ResourceQuery): string {
    const resourceId = query.resource_id?.trim();
    if (resourceId && resourceId.length > 0) {
      return resourceId;
    }
    const filterResourceId = query.filters && typeof query.filters.resource_id === 'string' ? query.filters.resource_id.trim() : '';
    return filterResourceId.length > 0 ? filterResourceId : 'unknown';
  }

  private hasFilterResourceId(query: ResourceQuery): boolean {
    return Boolean(query.filters && typeof query.filters.resource_id === 'string' && query.filters.resource_id.trim().length > 0);
  }

  private scenarioForResourceId(resource_id: string): MockReadScenario {
    switch (resource_id) {
      case 'estimate-missing':
        return 'not_found';
      case 'estimate-offline':
        return 'unavailable';
      case 'estimate-error':
        return 'error';
      case 'estimate-denied':
        return 'denied';
      case 'estimate-blocked':
        return 'blocked';
      case 'estimate-missing-source-evidence':
        return 'found_without_source_evidence';
      default:
        return 'found';
    }
  }

  private defaultReasonForScenario(status: Exclude<ResourceResult['status'], 'found'>): string {
    switch (status) {
      case 'not_found':
        return 'resource not found';
      case 'unavailable':
        return 'external system unavailable';
      case 'error':
        return 'external system error';
      case 'denied':
        return 'access denied';
      case 'blocked':
        return 'query blocked';
    }
  }

  private defaultFoundData(query: ResourceQuery): Record<string, unknown> {
    const resource_id = query.resource_id?.trim() || this.resolveResourceId(query);
    if (resource_id === 'estimate-123' && query.resource_type === 'estimate') {
      return {
        estimate_id: 'estimate-123',
        customer_name: 'Acme Customer',
        description: 'Quarterly estimate mock',
        base_amount: 1000,
        tax_amount: 210,
        total_amount: 1210,
        currency: 'EUR',
        source: 'mock_runtime'
      };
    }

    return {
      resource_type: query.resource_type,
      resource_id,
      source: 'mock_runtime'
    };
  }

  private buildSourceEvidence(query: ResourceQuery, data: Record<string, unknown>): [ReturnType<typeof createSourceEvidence>, ...ReturnType<typeof createSourceEvidence>[]] {
    const observed_at = this.now().toISOString();
    const resource_id = query.resource_id?.trim() || this.resolveResourceId(query);
    const fieldPaths = Object.keys(data).length > 0 ? Object.keys(data) : ['resource'];
    const evidence = fieldPaths.map((fieldPath, index) =>
      createSourceEvidence({
        source_id: `source-${index + 1}-${resource_id}`,
        source_type: 'record',
        source_system: this.source_system,
        resource_id,
        record_id: `${resource_id}#${index + 1}`,
        field_path: fieldPath,
        observed_at,
        correlation_id: query.correlation_id ?? ''
      })
    );
    return evidence as [ReturnType<typeof createSourceEvidence>, ...ReturnType<typeof createSourceEvidence>[]];
  }
}

export function createMockExternalReadAdapter(options: InMemoryExternalReadAdapterOptions = {}): InMemoryExternalReadAdapter {
  const adapter = new InMemoryExternalReadAdapter(options);
  adapter.seedResource({
    organization_id: 'org-acme',
    resource_type: 'estimate',
    resource_id: 'estimate-123',
    data: {
      estimate_id: 'estimate-123',
      customer_name: 'Acme Customer',
      description: 'Quarterly estimate mock',
      base_amount: 1000,
      tax_amount: 210,
      total_amount: 1210,
      currency: 'EUR',
      source: 'mock_runtime'
    }
  });
  return adapter;
}
