import type {
  PresenceCurrentParams,
  PresenceCurrentResult,
  PresenceDirection,
  PresenceEmployeeFindParams,
  PresenceEmployeeFindResult,
  PresenceEmployeeRecord,
  PresencePunchRecord,
  PresencePunchesListParams,
  PresencePunchesListResult,
  PresenceReadPort,
  PresenceScope,
  PresenceSourceCitation,
  PresenceStatus,
  NumaHrLeaveBalanceParams,
  NumaHrLeaveBalanceResult,
  NumaHrLeaveDaysParams,
  NumaHrLeaveDaysResult,
  NumaHrLeaveDetailParams,
  NumaHrLeaveDetailResult,
  NumaHrPunchDayParams,
  NumaHrPunchDayResult,
  NumaHrReadPort,
  NumaHrReportMonthByGroupParams,
  NumaHrReportMonthByGroupResult,
  NumaHrWorktimeSummaryParams,
  NumaHrWorktimeSummaryResult,
  NumaHrCurrentWorkersParams,
  NumaHrCurrentWorkersResult,
  NumaHrPunchDayWorkersParams,
  NumaHrPunchDayWorkersResult,
  NumaHrPunchRangeParams,
  NumaHrPunchRangeResult
} from '../../../contracts/src/index';
import {
  buildNumaHrCurrentWorkersStatement,
  buildNumaHrLeaveBalanceStatement,
  buildNumaHrLeaveDaysStatement,
  buildNumaHrEmployeeResolveStatement,
  buildNumaHrGroupResolveStatement,
  buildNumaHrLeaveBalanceResolutionResult,
  buildNumaHrLeaveDaysResolutionResult,
  buildNumaHrLeaveDetailResolutionResult,
  buildNumaHrLeaveDetailStatement,
  buildNumaHrPunchDayStatement,
  buildNumaHrPunchDayWorkersStatement,
  buildNumaHrPunchDayResolutionResult,
  buildNumaHrPunchRangeResolutionResult,
  buildNumaHrPunchRangeStatement,
  buildNumaHrReportMonthByGroupStatement,
  buildNumaHrReportMonthByGroupResolutionResult,
  buildNumaHrWorktimeSummaryStatement,
  buildNumaHrWorktimeSummaryResolutionResult,
  type PgHrEmployeeCandidateRow,
  type PgHrGroupCandidateRow,
  type PgHrCurrentWorkerRow,
  type PgHrPunchDayWorkerRow,
  mapNumaHrLeaveBalanceResult,
  mapNumaHrCurrentWorkersResult,
  mapNumaHrLeaveDaysResult,
  mapNumaHrLeaveDetailResult,
  mapNumaHrPunchDayResult,
  mapNumaHrPunchDayWorkersResult,
  mapNumaHrPunchRangeResult,
  mapNumaHrReportMonthByGroupResult,
  mapNumaHrWorktimeSummaryResult,
  type PgHrLeaveDaysRow,
  type PgHrLeaveDetailRow,
  type PgHrPunchDayRow,
  type PgHrReportMonthByGroupRow,
  type PgHrWorktimeSummaryRow
} from './hr';
import { normalizeNumaCompanyIdByOrganizationId, resolveNumaCompanyId, type NumaCompanyIdByOrganizationId } from './company-scope';

export const NUMA_POSTGRES_READ_ADAPTER_ID = 'numa-postgres' as const;
export const NUMA_POSTGRES_SOURCE_SYSTEM = 'postgres' as const;
export const NUMA_POSTGRES_ROLE = 'kern_ro' as const;

export type PgPresenceQueryId = 'employee.find' | 'punches.list' | 'presence.current';
export type PgHrQueryId =
  | 'employee.resolve'
  | 'group.resolve'
  | 'presence.current-workers'
  | 'punch.day'
  | 'punch.day-workers'
  | 'punch.range'
  | 'leave.days'
  | 'leave.balance'
  | 'leave.detail'
  | 'worktime.summary'
  | 'report.month-by-group';
export type PgQueryId = PgPresenceQueryId | PgHrQueryId;

export interface PgSqlStatement {
  text: string;
  values: readonly unknown[];
}

export interface PgConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string | null;
  sslmode: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  application_name: string;
  role: string;
  statement_timeout_ms?: number;
}

export interface PgReadOnlyTransactionPlan {
  readonly: true;
  isolation_level: 'read committed';
  statement_timeout_ms: number;
  role: string;
  application_name: string;
}

export interface PgPresenceQueryRunner {
  query<TRecord = Record<string, unknown>>(input: {
    query_id: PgQueryId;
    statement: PgSqlStatement;
    connection: PgConnectionConfig;
    transaction: PgReadOnlyTransactionPlan;
  }): TRecord[];
}

export interface PgReadAdapterOptions {
  queryRunner: PgPresenceQueryRunner;
  connection?: Partial<PgConnectionConfig>;
  now?: () => Date;
  statement_timeout_ms?: number;
  active_window_days?: number;
  current_window_hours?: number;
  employee_find_limit?: number;
  punches_list_limit?: number;
  company_id_by_organization_id?: Record<string, string>;
}

export interface PgPresenceSearchRow {
  employee_id: string;
  principal_id: string | null;
  display_name: string;
  email: string | null;
  active: boolean;
}

export interface PgPresencePunchRow {
  punch_id: string;
  employee_id: string;
  display_name: string;
  direction: PresenceDirection;
  punched_at: string;
  source_table: string;
  source_record_id: string;
}

export interface PgPresenceCurrentRow {
  presence_status: PresenceStatus;
  employee_id: string | null;
  display_name: string | null;
  direction: PresenceDirection | null;
  observed_at: string | null;
  row_count: number;
  truncated: boolean;
  tables: string[];
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeLimit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizeOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function formatMadridTimestamp(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get('year')}-${lookup.get('month')}-${lookup.get('day')} ${lookup.get('hour')}:${lookup.get('minute')}:${lookup.get('second')}`;
}

function createCitation(queryId: PgQueryId, tables: string[], rowCount: number, truncated: boolean): PresenceSourceCitation {
  return { tables, queryId, rowCount, truncated };
}

function normalizePgConnectionString(value: unknown, field: string): string {
  const candidate = normalizeString(value);
  if (!candidate) {
    throw new Error('Missing required Numa PostgreSQL env: ' + field);
  }
  return candidate;
}

function normalizePgPort(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim().length > 0 ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Missing or invalid Numa PostgreSQL env: ' + field);
  }
  return parsed;
}

function normalizePgSslMode(value: unknown, field: string): PgConnectionConfig['sslmode'] {
  const candidate = normalizeString(value);
  const allowed: PgConnectionConfig['sslmode'][] = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];
  if (!candidate || !allowed.includes(candidate as PgConnectionConfig['sslmode'])) {
    throw new Error('Missing or invalid Numa PostgreSQL env: ' + field);
  }
  return candidate as PgConnectionConfig['sslmode'];
}

function normalizePgTimeoutMs(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Missing or invalid Numa PostgreSQL env: NUMA_PGSTATEMENT_TIMEOUT_MS');
  }
  return Math.trunc(parsed);
}
function buildEmployeeFindStatement(input: PresenceEmployeeFindParams): PgSqlStatement {
  return {
    text: `
      SELECT
        e.employee_id,
        e.principal_id,
        e.display_name,
        e.email,
        e.active
      FROM kern.employees e
      WHERE e.company_id = $1
        AND (
          unaccent(lower(COALESCE(e.display_name, ''))) LIKE unaccent(lower($2))
          OR unaccent(lower(COALESCE(e.email, ''))) LIKE unaccent(lower($2))
          OR unaccent(lower(COALESCE(e.employee_id, ''))) LIKE unaccent(lower($2))
        )
      ORDER BY e.display_name ASC
      LIMIT $3 + 1
    `.trim(),
    values: [input.organization_id, `%${input.term}%`, input.limit]
  };
}

function buildPunchesListStatement(input: PresencePunchesListParams): PgSqlStatement {
  return {
    text: `
      SELECT
        p.punch_id,
        p.employee_id,
        e.display_name,
        p.direction,
        p.punched_at,
        'kern.employee_punches' AS source_table,
        p.punch_id AS source_record_id
      FROM kern.employee_punches p
      JOIN kern.employees e
        ON e.employee_id = p.employee_id
       AND e.company_id = p.company_id
      WHERE p.company_id = $1
        AND ($2::text IS NULL OR p.employee_id = $2)
      ORDER BY p.punched_at DESC, p.punch_id DESC
      LIMIT $3 + 1
      OFFSET $4
    `.trim(),
    values: [input.organization_id, input.employee_id, input.limit, input.offset]
  };
}

function buildCurrentPresenceStatement(input: PresenceCurrentParams, windowStart: string, windowEnd: string): PgSqlStatement {
  return {
    text: `
      WITH active_employees AS (
        SELECT
          e.employee_id,
          e.principal_id,
          e.display_name
        FROM kern.employees e
        WHERE e.company_id = $1
          AND e.active = TRUE
          AND (
            $2 = 'organization'
            OR ($2 = 'self' AND e.principal_id = $3)
            OR ($2 = 'explicit' AND e.employee_id = ANY($4::text[]))
          )
      ),
      window_activity AS (
        SELECT
          p.employee_id,
          p.direction,
          p.punched_at,
          p.punch_id
        FROM kern.employee_punches p
        JOIN active_employees ae
          ON ae.employee_id = p.employee_id
        WHERE p.company_id = $1
          AND timezone('Europe/Madrid', p.punched_at) >= $5::timestamp
          AND timezone('Europe/Madrid', p.punched_at) < $6::timestamp
      ),
      last_directional_punch AS (
        SELECT DISTINCT ON (wa.employee_id)
          wa.employee_id,
          wa.direction,
          wa.punched_at,
          wa.punch_id
        FROM window_activity wa
        WHERE wa.direction IN ('in', 'out')
        ORDER BY wa.employee_id, wa.punched_at DESC, wa.punch_id DESC
      )
      SELECT
        CASE
          WHEN COUNT(wa.punch_id) = 0 THEN 'no_data'
          WHEN ld.direction = 'in' THEN 'inside'
          WHEN ld.direction = 'out' THEN 'outside'
          ELSE 'unknown'
        END AS presence_status,
        ld.employee_id,
        ae.display_name,
        ld.direction,
        ld.punched_at AS observed_at,
        COUNT(wa.punch_id) AS row_count,
        COUNT(wa.punch_id) > $7 AS truncated,
        ARRAY['kern.employees', 'kern.employee_punches']::text[] AS tables
      FROM active_employees ae
      LEFT JOIN window_activity wa ON wa.employee_id = ae.employee_id
      LEFT JOIN last_directional_punch ld ON ld.employee_id = ae.employee_id
      GROUP BY ld.employee_id, ae.display_name, ld.direction, ld.punched_at
      ORDER BY ae.display_name ASC
      LIMIT 1
    `.trim(),
    values: [input.organization_id, input.scope.kind, input.scope.requester_principal_id, input.scope.employee_ids, windowStart, windowEnd, input.current_window_hours ?? 24]
  };
}

function mapEmployeeRows(rows: PgPresenceSearchRow[], input: PresenceEmployeeFindParams): PresenceEmployeeFindResult {
  const truncated = rows.length > input.limit;
  const records: PresenceEmployeeRecord[] = rows.slice(0, input.limit).map((row) => ({
    employee_id: row.employee_id,
    principal_id: row.principal_id,
    display_name: row.display_name,
    email: row.email,
    active: row.active
  }));
  return {
    query_id: 'employee.find',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    search_term: input.term,
    records,
    truncated,
    citations: [createCitation('employee.find', ['kern.employees'], rows.length, truncated)]
  };
}

function mapPunchRows(rows: PgPresencePunchRow[], input: PresencePunchesListParams): PresencePunchesListResult {
  const truncated = rows.length > input.limit;
  const records: PresencePunchRecord[] = rows.slice(0, input.limit).map((row) => ({
    punch_id: row.punch_id,
    employee_id: row.employee_id,
    display_name: row.display_name,
    direction: row.direction,
    punched_at: row.punched_at,
    source_table: row.source_table,
    source_record_id: row.source_record_id
  }));
  return {
    query_id: 'punches.list',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id,
    records,
    truncated,
    citations: [createCitation('punches.list', ['kern.employee_punches', 'kern.employees'], rows.length, truncated)]
  };
}

function buildCurrentResult(input: {
  scope: PresenceScope;
  row: PgPresenceCurrentRow | undefined;
  organization_id: string;
  correlation_id: string;
}): PresenceCurrentResult {
  if (!input.row) {
    return {
      query_id: 'presence.current',
      organization_id: input.organization_id,
      correlation_id: input.correlation_id,
      scope: input.scope,
      status: 'no_data',
      employee_id: null,
      display_name: null,
      direction: null,
      observed_at: null,
      row_count: 0,
      truncated: false,
      citations: [createCitation('presence.current', ['kern.employees', 'kern.employee_punches'], 0, false)]
    };
  }

  return {
    query_id: 'presence.current',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    scope: input.scope,
    status: input.row.presence_status,
    employee_id: input.row.employee_id,
    display_name: input.row.display_name,
    direction: input.row.direction,
    observed_at: input.row.observed_at,
    row_count: input.row.row_count,
    truncated: input.row.truncated,
    citations: [createCitation('presence.current', input.row.tables, input.row.row_count, input.row.truncated)]
  };
}

export function createPgConnectionConfigFromEnv(env: Record<string, string | undefined> = process.env): PgConnectionConfig {
  return {
    host: normalizePgConnectionString(env.NUMA_PGHOST, 'NUMA_PGHOST'),
    port: normalizePgPort(env.NUMA_PGPORT, 'NUMA_PGPORT'),
    database: normalizePgConnectionString(env.NUMA_PGDATABASE, 'NUMA_PGDATABASE'),
    user: normalizePgConnectionString(env.NUMA_PGUSER, 'NUMA_PGUSER'),
    password: normalizeString(env.NUMA_PGPASSWORD ?? null),
    sslmode: normalizePgSslMode(env.NUMA_PGSSLMODE, 'NUMA_PGSSLMODE'),
    application_name: normalizeString(env.NUMA_PGAPPNAME ?? null) ?? NUMA_POSTGRES_READ_ADAPTER_ID,
    role: NUMA_POSTGRES_ROLE,
    statement_timeout_ms: normalizePgTimeoutMs(env.NUMA_PGSTATEMENT_TIMEOUT_MS, 15000)
  };
}

export class PgReadAdapter implements PresenceReadPort, NumaHrReadPort {
  readonly adapter_id = NUMA_POSTGRES_READ_ADAPTER_ID;
  readonly source_system = NUMA_POSTGRES_SOURCE_SYSTEM;

  private readonly queryRunner: PgPresenceQueryRunner;
  private readonly connection: PgConnectionConfig;
  private readonly statementTimeoutMs: number;
  private readonly activeWindowDays: number;
  private readonly currentWindowHours: number;
  private readonly employeeFindLimit: number;
  private readonly punchesListLimit: number;
  private readonly companyIdByOrganizationId: NumaCompanyIdByOrganizationId;
  private readonly now: () => Date;

  constructor(options: PgReadAdapterOptions) {
    this.queryRunner = options.queryRunner;
    this.connection = options.connection
      ? ({ ...options.connection, role: NUMA_POSTGRES_ROLE } as PgConnectionConfig)
      : createPgConnectionConfigFromEnv();
    this.statementTimeoutMs = options.statement_timeout_ms ?? options.connection?.statement_timeout_ms ?? this.connection.statement_timeout_ms ?? 15_000;
    this.activeWindowDays = options.active_window_days ?? 90;
    this.currentWindowHours = clampInteger(options.current_window_hours ?? 24, 1, 24);
    this.employeeFindLimit = options.employee_find_limit ?? 25;
    this.punchesListLimit = options.punches_list_limit ?? 25;
    this.companyIdByOrganizationId = normalizeNumaCompanyIdByOrganizationId(options.company_id_by_organization_id ?? null, 'company_id_by_organization_id');
    this.now = options.now ?? (() => new Date());
  }

  private resolveCompanyId(organizationId: string): string {
    return resolveNumaCompanyId(organizationId, this.companyIdByOrganizationId);
  }

  private resolveHrEmployee(input: {
    company_id: string;
    employee_id: string | null;
    employee_name: string | null;
  }):
    | { status: 'resolved'; employee_id: string | null; employee_name: string | null }
    | { status: 'ambiguous' | 'not_found'; candidates: PgHrEmployeeCandidateRow[] } {
    if (input.employee_id || !input.employee_name) {
      return { status: 'resolved', employee_id: input.employee_id, employee_name: input.employee_name };
    }
    const statement = buildNumaHrEmployeeResolveStatement({
      organization_id: input.company_id,
      employee_name: input.employee_name,
      limit: 5
    });
    const rows = this.queryRunner.query<PgHrEmployeeCandidateRow>({
      query_id: 'employee.resolve',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    const exactRows = rows.filter((row) => row.exact_match);
    const candidates = exactRows.length > 0 ? exactRows : rows;
    if (candidates.length === 0) {
      return { status: 'not_found', candidates: [] };
    }
    if (candidates.length > 1) {
      return { status: 'ambiguous', candidates };
    }
    const [candidate] = candidates;
    return {
      status: 'resolved',
      employee_id: candidate.employee_id,
      employee_name: candidate.employee_name
    };
  }

  private resolveHrGroup(input: {
    company_id: string;
    group_id: string | null;
    group_name: string | null;
  }):
    | { status: 'resolved'; group_id: string | null; group_name: string | null }
    | { status: 'ambiguous' | 'not_found'; candidates: PgHrGroupCandidateRow[] } {
    if (input.group_id || !input.group_name) {
      return { status: 'resolved', group_id: input.group_id, group_name: input.group_name };
    }
    const statement = buildNumaHrGroupResolveStatement({
      organization_id: input.company_id,
      group_name: input.group_name,
      limit: 5
    });
    const rows = this.queryRunner.query<PgHrGroupCandidateRow>({
      query_id: 'group.resolve',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    const exactRows = rows.filter((row) => row.exact_match);
    const candidates = exactRows.length > 0 ? exactRows : rows;
    if (candidates.length === 0) {
      return { status: 'not_found', candidates: [] };
    }
    if (candidates.length > 1) {
      return { status: 'ambiguous', candidates };
    }
    const [candidate] = candidates;
    return {
      status: 'resolved',
      group_id: candidate.group_id,
      group_name: candidate.group_name
    };
  }

  findEmployee(input: PresenceEmployeeFindParams): PresenceEmployeeFindResult {
    const normalized: PresenceEmployeeFindParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      term: input.term.trim(),
      limit: normalizeLimit(input.limit, this.employeeFindLimit)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const statement = buildEmployeeFindStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgPresenceSearchRow>({
      query_id: 'employee.find',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapEmployeeRows(rows, normalized);
  }

  listPunches(input: PresencePunchesListParams): PresencePunchesListResult {
    const normalized: PresencePunchesListParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      limit: normalizeLimit(input.limit, this.punchesListLimit),
      offset: normalizeOffset(input.offset)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const statement = buildPunchesListStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgPresencePunchRow>({
      query_id: 'punches.list',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapPunchRows(rows, normalized);
  }

  currentPresence(input: PresenceCurrentParams): PresenceCurrentResult {
    const normalized: PresenceCurrentParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      scope: {
        kind: input.scope.kind,
        requester_principal_id: input.scope.requester_principal_id.trim(),
        organization_id: input.scope.organization_id.trim(),
        employee_ids: input.scope.employee_ids.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
        reason: input.scope.reason.trim()
      },
      active_window_days: input.active_window_days ?? this.activeWindowDays,
      current_window_hours: clampInteger(input.current_window_hours ?? this.currentWindowHours, 1, 24)
    };

    if (normalized.scope.kind === 'unsupported') {
      return {
        query_id: 'presence.current',
        organization_id: normalized.organization_id,
        correlation_id: normalized.correlation_id,
        scope: normalized.scope,
        status: 'unsupported',
        employee_id: null,
        display_name: null,
        direction: null,
        observed_at: null,
        row_count: 0,
        truncated: false,
        citations: [createCitation('presence.current', ['kern.employees', 'kern.employee_punches'], 0, false)]
      };
    }

    const now = this.now();
    const currentWindowHours = normalized.current_window_hours ?? 24;
    const windowStart = formatMadridTimestamp(new Date(now.getTime() - currentWindowHours * 60 * 60 * 1000));
    const windowEnd = formatMadridTimestamp(now);
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const statement = buildCurrentPresenceStatement({ ...normalized, organization_id: companyId }, windowStart, windowEnd);
    const rows = this.queryRunner.query<PgPresenceCurrentRow>({
      query_id: 'presence.current',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return buildCurrentResult({
      scope: normalized.scope,
      row: rows[0],
      organization_id: normalized.organization_id,
      correlation_id: normalized.correlation_id
    });
  }

  currentWorkers(input: NumaHrCurrentWorkersParams): NumaHrCurrentWorkersResult {
    const normalized: NumaHrCurrentWorkersParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      limit: Math.trunc(input.limit)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const now = this.now();
    const windowStart = formatMadridTimestamp(new Date(now.getTime() - this.currentWindowHours * 60 * 60 * 1000));
    const windowEnd = formatMadridTimestamp(now);
    const statement = buildNumaHrCurrentWorkersStatement({ ...normalized, organization_id: companyId, window_start: windowStart, window_end: windowEnd });
    const rows = this.queryRunner.query<PgHrCurrentWorkerRow>({
      query_id: 'presence.current-workers',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrCurrentWorkersResult(rows, normalized, now.toISOString());
  }


  punchDay(input: NumaHrPunchDayParams): NumaHrPunchDayResult {
    const normalized: NumaHrPunchDayParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      date: input.date.trim()
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedEmployee = this.resolveHrEmployee({
      company_id: companyId,
      employee_id: normalized.employee_id ?? null,
      employee_name: normalized.employee_name ?? null
    });
    if (resolvedEmployee.status !== 'resolved') {
      return buildNumaHrPunchDayResolutionResult(normalized, resolvedEmployee.status, resolvedEmployee.candidates, 5);
    }
    const resolved = {
      ...normalized,
      employee_id: resolvedEmployee.employee_id,
      employee_name: resolvedEmployee.employee_name
    };
    const statement = buildNumaHrPunchDayStatement({ ...resolved, organization_id: companyId, limit: this.punchesListLimit });
    const rows = this.queryRunner.query<PgHrPunchDayRow>({
      query_id: 'punch.day',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrPunchDayResult(rows, resolved, this.punchesListLimit);
  }

  punchDayWorkers(input: NumaHrPunchDayWorkersParams): NumaHrPunchDayWorkersResult {
    const normalized: NumaHrPunchDayWorkersParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      date: input.date.trim(),
      limit: Math.trunc(input.limit)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const statement = buildNumaHrPunchDayWorkersStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrPunchDayWorkerRow>({
      query_id: 'punch.day-workers',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrPunchDayWorkersResult(rows, normalized);
  }

  punchRange(input: NumaHrPunchRangeParams): NumaHrPunchRangeResult {
    const normalized: NumaHrPunchRangeParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      date_from: input.date_from.trim(),
      date_to: input.date_to.trim(),
      limit: Math.trunc(input.limit)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedEmployee = this.resolveHrEmployee({
      company_id: companyId,
      employee_id: normalized.employee_id ?? null,
      employee_name: normalized.employee_name ?? null
    });
    if (resolvedEmployee.status !== 'resolved') {
      return buildNumaHrPunchRangeResolutionResult(normalized, resolvedEmployee.status, resolvedEmployee.candidates, 5);
    }
    const resolved = {
      ...normalized,
      employee_id: resolvedEmployee.employee_id,
      employee_name: resolvedEmployee.employee_name
    };
    const statement = buildNumaHrPunchRangeStatement({ ...resolved, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrPunchDayRow>({
      query_id: 'punch.range',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrPunchRangeResult(rows, resolved, normalized.limit);
  }

  leaveDays(input: NumaHrLeaveDaysParams): NumaHrLeaveDaysResult {
    const normalized: NumaHrLeaveDaysParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      year: Math.trunc(input.year),
      time_type_ids: input.time_type_ids.map((entry) => Math.trunc(entry)),
      include_pending: Boolean(input.include_pending)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedEmployee = this.resolveHrEmployee({
      company_id: companyId,
      employee_id: normalized.employee_id ?? null,
      employee_name: normalized.employee_name ?? null
    });
    if (resolvedEmployee.status !== 'resolved') {
      return buildNumaHrLeaveDaysResolutionResult(normalized, resolvedEmployee.status, resolvedEmployee.candidates, 5);
    }
    const resolved = {
      ...normalized,
      employee_id: resolvedEmployee.employee_id,
      employee_name: resolvedEmployee.employee_name
    };
    const statement = buildNumaHrLeaveDaysStatement({ ...resolved, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrLeaveDaysRow>({
      query_id: 'leave.days',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrLeaveDaysResult(rows, resolved);
  }

  leaveBalance(input: NumaHrLeaveBalanceParams): NumaHrLeaveBalanceResult {
    const normalized: NumaHrLeaveBalanceParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      year: Math.trunc(input.year),
      time_type_ids: input.time_type_ids.map((entry) => Math.trunc(entry)),
      annual_quota_by_time_type: { ...input.annual_quota_by_time_type },
      include_pending: Boolean(input.include_pending)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedEmployee = this.resolveHrEmployee({
      company_id: companyId,
      employee_id: normalized.employee_id ?? null,
      employee_name: normalized.employee_name ?? null
    });
    if (resolvedEmployee.status !== 'resolved') {
      return buildNumaHrLeaveBalanceResolutionResult(normalized, resolvedEmployee.status, resolvedEmployee.candidates, 5);
    }
    const resolved = {
      ...normalized,
      employee_id: resolvedEmployee.employee_id,
      employee_name: resolvedEmployee.employee_name
    };
    const statement = buildNumaHrLeaveBalanceStatement({ ...resolved, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrLeaveDaysRow>({
      query_id: 'leave.balance',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrLeaveBalanceResult(rows, resolved);
  }

  leaveDetail(input: NumaHrLeaveDetailParams): NumaHrLeaveDetailResult {
    const normalized: NumaHrLeaveDetailParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      date_from: input.date_from.trim(),
      date_to: input.date_to.trim(),
      time_type_ids: input.time_type_ids.map((entry) => Math.trunc(entry)),
      include_pending: Boolean(input.include_pending),
      limit: Math.trunc(input.limit)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedEmployee = this.resolveHrEmployee({
      company_id: companyId,
      employee_id: normalized.employee_id ?? null,
      employee_name: normalized.employee_name ?? null
    });
    if (resolvedEmployee.status !== 'resolved') {
      return buildNumaHrLeaveDetailResolutionResult(normalized, resolvedEmployee.status, resolvedEmployee.candidates, 5);
    }
    const resolved = {
      ...normalized,
      employee_id: resolvedEmployee.employee_id,
      employee_name: resolvedEmployee.employee_name
    };
    const statement = buildNumaHrLeaveDetailStatement({ ...resolved, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrLeaveDetailRow>({
      query_id: 'leave.detail',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrLeaveDetailResult(rows, resolved);
  }

  worktimeSummary(input: NumaHrWorktimeSummaryParams): NumaHrWorktimeSummaryResult {
    const normalized: NumaHrWorktimeSummaryParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      date_from: input.date_from.trim(),
      date_to: input.date_to.trim(),
      theoretical_workday_minutes: input.theoretical_workday_minutes === undefined || input.theoretical_workday_minutes === null ? null : Math.trunc(input.theoretical_workday_minutes)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedEmployee = this.resolveHrEmployee({
      company_id: companyId,
      employee_id: normalized.employee_id ?? null,
      employee_name: normalized.employee_name ?? null
    });
    if (resolvedEmployee.status !== 'resolved') {
      return buildNumaHrWorktimeSummaryResolutionResult(normalized, resolvedEmployee.status, resolvedEmployee.candidates, 5);
    }
    const resolved = {
      ...normalized,
      employee_id: resolvedEmployee.employee_id,
      employee_name: resolvedEmployee.employee_name
    };
    const statement = buildNumaHrWorktimeSummaryStatement({ ...resolved, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrWorktimeSummaryRow>({
      query_id: 'worktime.summary',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrWorktimeSummaryResult(rows, resolved);
  }

  reportMonthByGroup(input: NumaHrReportMonthByGroupParams): NumaHrReportMonthByGroupResult {
    const normalized: NumaHrReportMonthByGroupParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      group_id: normalizeString(input.group_id),
      group_name: normalizeString(input.group_name),
      year: Math.trunc(input.year),
      month: Math.trunc(input.month),
      limit: Math.trunc(input.limit),
      offset: Math.trunc(input.offset)
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const resolvedGroup = this.resolveHrGroup({
      company_id: companyId,
      group_id: normalized.group_id ?? null,
      group_name: normalized.group_name ?? null
    });
    if (resolvedGroup.status !== 'resolved') {
      return buildNumaHrReportMonthByGroupResolutionResult(normalized, resolvedGroup.status, resolvedGroup.candidates, 5);
    }
    const resolved = {
      ...normalized,
      group_id: resolvedGroup.group_id,
      group_name: resolvedGroup.group_name
    };
    const statement = buildNumaHrReportMonthByGroupStatement({ ...resolved, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrReportMonthByGroupRow>({
      query_id: 'report.month-by-group',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrReportMonthByGroupResult(rows, resolved);
  }

  private createTransactionPlan(): PgReadOnlyTransactionPlan {
    return {
      readonly: true,
      isolation_level: 'read committed',
      statement_timeout_ms: this.statementTimeoutMs,
      role: NUMA_POSTGRES_ROLE,
      application_name: this.connection.application_name
    };
  }
}

export function createPgReadAdapter(options: PgReadAdapterOptions): PgReadAdapter {
  return new PgReadAdapter(options);
}

export { PG_SYNC_QUERY_RUNNER_SCRIPT, PgSyncQueryRunner, createPgSyncQueryRunner, type PgSyncQueryRunnerOptions } from './runner';
