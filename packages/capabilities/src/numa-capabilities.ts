import {
  type CapabilityDefinition,
  type CapabilityMockResult,
  type CapabilityOutput,
  type NumaHrLeaveBalanceParams,
  type NumaHrLeaveDaysParams,
  type NumaHrLeaveDetailParams,
  type NumaHrPunchDayParams,
  type NumaHrReadPort,
  type NumaHrReportMonthByGroupParams,
  type NumaHrWorktimeSummaryParams
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

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeNumber(entry))
    .filter((entry): entry is number => entry !== null);
}

function buildPunchDayCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'punch.day',
    organization_id,
    title: 'Punch day',
    description: 'Read one employee punch timeline for a specific day.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const date = normalizeString(payload.date);
        if (!organization_id || !correlation_id || !date) {
          return { status: 'denied', output: null, error: 'punch.day payload invalid' };
        }
        const result = port.punchDay({
          organization_id,
          correlation_id,
          employee_id: normalizeString(payload.employee_id),
          employee_name: normalizeString(payload.employee_name),
          date
        });
        return buildMockResult('punch.day', result);
      }
    }
  };
}

function buildLeaveDaysCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'leave.days',
    organization_id,
    title: 'Leave days',
    description: 'Read approved and pending leave days by type.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const year = normalizePositiveInteger(payload.year, 0);
        const time_type_ids = normalizeNumberArray(payload.time_type_ids);
        if (!organization_id || !correlation_id || year === 0 || time_type_ids.length === 0) {
          return { status: 'denied', output: null, error: 'leave.days payload invalid' };
        }
        const result = port.leaveDays({
          organization_id,
          correlation_id,
          employee_id: normalizeString(payload.employee_id),
          employee_name: normalizeString(payload.employee_name),
          year,
          time_type_ids,
          include_pending: Boolean(payload.include_pending)
        });
        return buildMockResult('leave.days', result);
      }
    }
  };
}

function buildLeaveBalanceCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'leave.balance',
    organization_id,
    title: 'Leave balance',
    description: 'Read annual leave balance for configured time types.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const year = normalizePositiveInteger(payload.year, 0);
        const time_type_ids = normalizeNumberArray(payload.time_type_ids);
        const annual_quota_by_time_type = payload.annual_quota_by_time_type && typeof payload.annual_quota_by_time_type === 'object' && !Array.isArray(payload.annual_quota_by_time_type)
          ? (payload.annual_quota_by_time_type as Record<string, unknown>)
          : {};
        if (!organization_id || !correlation_id || year === 0 || time_type_ids.length === 0) {
          return { status: 'denied', output: null, error: 'leave.balance payload invalid' };
        }
        const result = port.leaveBalance({
          organization_id,
          correlation_id,
          employee_id: normalizeString(payload.employee_id),
          employee_name: normalizeString(payload.employee_name),
          year,
          time_type_ids,
          annual_quota_by_time_type: Object.fromEntries(
            Object.entries(annual_quota_by_time_type).map(([key, value]) => [Number(key), normalizePositiveInteger(value, 0)])
          ),
          include_pending: Boolean(payload.include_pending)
        });
        return buildMockResult('leave.balance', result);
      }
    }
  };
}

function buildLeaveDetailCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'leave.detail',
    organization_id,
    title: 'Leave detail',
    description: 'Read detailed leave requests by type and date range.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const date_from = normalizeString(payload.date_from);
        const date_to = normalizeString(payload.date_to);
        const time_type_ids = normalizeNumberArray(payload.time_type_ids);
        const limit = normalizePositiveInteger(payload.limit, 100);
        if (!organization_id || !correlation_id || !date_from || !date_to || time_type_ids.length === 0) {
          return { status: 'denied', output: null, error: 'leave.detail payload invalid' };
        }
        const result = port.leaveDetail({
          organization_id,
          correlation_id,
          employee_id: normalizeString(payload.employee_id),
          employee_name: normalizeString(payload.employee_name),
          date_from,
          date_to,
          time_type_ids,
          include_pending: Boolean(payload.include_pending),
          limit
        });
        return buildMockResult('leave.detail', result);
      }
    }
  };
}

function buildWorktimeSummaryCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'worktime.summary',
    organization_id,
    title: 'Worktime summary',
    description: 'Summarize worked time for a date range.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const date_from = normalizeString(payload.date_from);
        const date_to = normalizeString(payload.date_to);
        if (!organization_id || !correlation_id || !date_from || !date_to) {
          return { status: 'denied', output: null, error: 'worktime.summary payload invalid' };
        }
        const result = port.worktimeSummary({
          organization_id,
          correlation_id,
          employee_id: normalizeString(payload.employee_id),
          employee_name: normalizeString(payload.employee_name),
          date_from,
          date_to,
          theoretical_workday_minutes: payload.theoretical_workday_minutes === undefined || payload.theoretical_workday_minutes === null ? null : normalizePositiveInteger(payload.theoretical_workday_minutes, 480)
        });
        return buildMockResult('worktime.summary', result);
      }
    }
  };
}

function buildReportMonthByGroupCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return {
    capability_id: 'report.month-by-group',
    organization_id,
    title: 'Report by group',
    description: 'Monthly employee summary for a group or center.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: null,
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const organization_id = normalizeString(payload.organization_id);
        const correlation_id = normalizeString(payload.correlation_id);
        const year = normalizePositiveInteger(payload.year, 0);
        const month = normalizePositiveInteger(payload.month, 0);
        const limit = normalizePositiveInteger(payload.limit, 25);
        const offset = normalizeNonNegativeInteger(payload.offset, 0);
        if (!organization_id || !correlation_id || year === 0 || month === 0) {
          return { status: 'denied', output: null, error: 'report.month-by-group payload invalid' };
        }
        const result = port.reportMonthByGroup({
          organization_id,
          correlation_id,
          group_id: normalizeString(payload.group_id),
          group_name: normalizeString(payload.group_name),
          year,
          month,
          limit,
          offset
        });
        return buildMockResult('report.month-by-group', result);
      }
    }
  };
}

export function createNumaPunchDayCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return buildPunchDayCapability(port, organization_id);
}

export function createNumaLeaveDaysCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return buildLeaveDaysCapability(port, organization_id);
}

export function createNumaLeaveBalanceCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return buildLeaveBalanceCapability(port, organization_id);
}

export function createNumaLeaveDetailCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return buildLeaveDetailCapability(port, organization_id);
}

export function createNumaWorktimeSummaryCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return buildWorktimeSummaryCapability(port, organization_id);
}

export function createNumaReportMonthByGroupCapability(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition {
  return buildReportMonthByGroupCapability(port, organization_id);
}

export function createNumaHrCapabilitySet(port: NumaHrReadPort, organization_id = 'org-acme'): CapabilityDefinition[] {
  return [
    createNumaPunchDayCapability(port, organization_id),
    createNumaLeaveDaysCapability(port, organization_id),
    createNumaLeaveBalanceCapability(port, organization_id),
    createNumaLeaveDetailCapability(port, organization_id),
    createNumaWorktimeSummaryCapability(port, organization_id),
    createNumaReportMonthByGroupCapability(port, organization_id)
  ];
}
