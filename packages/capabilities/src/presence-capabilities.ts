import {
  type CapabilityDefinition,
  type CapabilityMockResult,
  type CapabilityOutput,
  type PresenceCurrentParams,
  type PresenceEmployeeFindParams,
  type PresencePunchesListParams,
  type PresenceReadPort,
  type PresenceScope,
  type PresenceScopeKind
} from '../../contracts/src/index';

function cloneResult<T>(value: T): T {
  return structuredClone(value);
}

function buildCapabilityOutput(capability_id: string, result: unknown): CapabilityOutput {
  return {
    capability_id,
    status: 'executed',
    result: cloneResult(result) as Record<string, unknown>,
    processed_at: new Date().toISOString()
  };
}

function buildMockResult(capability_id: string, result: unknown): CapabilityMockResult {
  return {
    status: 'executed',
    output: buildCapabilityOutput(capability_id, result),
    error: null
  };
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
}

function normalizeScope(payload: Record<string, unknown>, organization_id: string, principal_id: string): PresenceScope {
  const scope = payload.scope;
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) {
    const candidate = scope as Record<string, unknown>;
    const employee_ids = Array.isArray(candidate.employee_ids)
      ? candidate.employee_ids.map((entry: unknown) => normalizeString(entry)).filter((entry: string | null): entry is string => entry !== null)
      : [];
    const kind: PresenceScopeKind =
      candidate.kind === 'self' || candidate.kind === 'organization' || candidate.kind === 'explicit' || candidate.kind === 'unsupported'
        ? (candidate.kind as PresenceScopeKind)
        : 'unsupported';
    return {
      kind,
      requester_principal_id: normalizeString(candidate.requester_principal_id) ?? principal_id,
      organization_id: normalizeString(candidate.organization_id) ?? organization_id,
      employee_ids,
      reason: normalizeString(candidate.reason) ?? 'presence scope provided by caller'
    };
  }

  return {
    kind: 'unsupported',
    requester_principal_id: principal_id,
    organization_id,
    employee_ids: [],
    reason: 'scope missing; TODO define RGPD-safe default'
  };
}

function normalizeEmployeeFindParams(input: PresenceEmployeeFindParams): PresenceEmployeeFindParams {
  return {
    organization_id: input.organization_id.trim(),
    correlation_id: input.correlation_id.trim(),
    term: input.term.trim(),
    limit: normalizePositiveInteger(input.limit, 25)
  };
}

function normalizePunchesListParams(input: PresencePunchesListParams): PresencePunchesListParams {
  return {
    organization_id: input.organization_id.trim(),
    correlation_id: input.correlation_id.trim(),
    employee_id: normalizeString(input.employee_id),
    limit: normalizePositiveInteger(input.limit, 25),
    offset: normalizeNonNegativeInteger(input.offset, 0)
  };
}

function normalizeCurrentParams(input: PresenceCurrentParams): PresenceCurrentParams {
  return {
    organization_id: input.organization_id.trim(),
    correlation_id: input.correlation_id.trim(),
    scope: {
      kind: input.scope.kind,
      requester_principal_id: input.scope.requester_principal_id.trim(),
      organization_id: input.scope.organization_id.trim(),
      employee_ids: input.scope.employee_ids.map((entry: string) => entry.trim()).filter((entry: string) => entry.length > 0),
      reason: input.scope.reason.trim()
    },
    active_window_days: normalizePositiveInteger(input.active_window_days, 90),
    current_window_hours: normalizePositiveInteger(input.current_window_hours, 24)
  };
}

function createEmployeeFindCapability(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'employee.find',
    organization_id,
    title: 'Find employee',
    description: 'Read-only presence lookup for employees.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const term = normalizeString(payload.term);
        if (!organization_id || !correlation_id || !term) {
          return { status: 'denied', output: null, error: 'employee find payload invalid' };
        }
        const result = port.findEmployee(normalizeEmployeeFindParams({ organization_id, correlation_id, term, limit: payload.limit as number }));
        return buildMockResult('employee.find', result);
      }
    }
  };
}

function createPunchesListCapability(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'punches.list',
    organization_id,
    title: 'List punches',
    description: 'Read-only presence lookup for punch history.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        if (!organization_id || !correlation_id) {
          return { status: 'denied', output: null, error: 'punches list payload invalid' };
        }
        const result = port.listPunches(
          normalizePunchesListParams({
            organization_id,
            correlation_id,
            employee_id: payload.employee_id === null ? null : (payload.employee_id as string | null | undefined) ?? null,
            limit: payload.limit as number,
            offset: payload.offset as number
          })
        );
        return buildMockResult('punches.list', result);
      }
    }
  };
}

function createCurrentPresenceCapability(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'presence.current',
    organization_id,
    title: 'Current presence',
    description: 'Read-only current presence lookup.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const principal_id = normalizeString(input.principal_id);
        if (!organization_id || !correlation_id || !principal_id) {
          return { status: 'denied', output: null, error: 'presence current payload invalid' };
        }
        const scope = normalizeScope(payload, organization_id, principal_id);
        const result = port.currentPresence(
          normalizeCurrentParams({
            organization_id,
            correlation_id,
            scope,
            active_window_days: payload.active_window_days as number | undefined,
            current_window_hours: payload.current_window_hours as number | undefined
          })
        );
        return buildMockResult('presence.current', result);
      }
    }
  };
}

export function createPresenceEmployeeFindCapability(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return createEmployeeFindCapability(port, organization_id);
}

export function createPresencePunchesListCapability(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return createPunchesListCapability(port, organization_id);
}

export function createPresenceCurrentCapability(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return createCurrentPresenceCapability(port, organization_id);
}

export function createPresenceCapabilitySet(port: PresenceReadPort, organization_id = 'org-acme'): CapabilityDefinition[] {
  return [
    createPresenceEmployeeFindCapability(port, organization_id),
    createPresencePunchesListCapability(port, organization_id),
    createPresenceCurrentCapability(port, organization_id)
  ];
}
