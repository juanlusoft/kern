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
  NumaHrPunchDayParams,
  NumaHrPunchDayResult,
  NumaHrReadPort,
  NumaHrReportMonthByGroupParams,
  NumaHrReportMonthByGroupResult,
  NumaHrWorktimeSummaryParams,
  NumaHrWorktimeSummaryResult
} from '../../../contracts/src/index';
import {
  buildNumaHrLeaveBalanceStatement,
  buildNumaHrLeaveDaysStatement,
  buildNumaHrPunchDayStatement,
  buildNumaHrReportMonthByGroupStatement,
  buildNumaHrWorktimeSummaryStatement,
  mapNumaHrLeaveBalanceResult,
  mapNumaHrLeaveDaysResult,
  mapNumaHrPunchDayResult,
  mapNumaHrReportMonthByGroupResult,
  mapNumaHrWorktimeSummaryResult,
  type PgHrLeaveDaysRow,
  type PgHrPunchDayRow,
  type PgHrReportMonthByGroupRow,
  type PgHrWorktimeSummaryRow
} from './hr';
import { normalizeNumaCompanyIdByOrganizationId, resolveNumaCompanyId, type NumaCompanyIdByOrganizationId } from './company-scope';

export const NUMA_POSTGRES_READ_ADAPTER_ID = 'numa-postgres' as const;
export const NUMA_POSTGRES_SOURCE_SYSTEM = 'postgres' as const;
export const NUMA_POSTGRES_ROLE = 'kern_ro' as const;

export type PgPresenceQueryId = 'employee.find' | 'punches.list' | 'presence.current';
export type PgHrQueryId = 'punch.day' | 'leave.days' | 'leave.balance' | 'worktime.summary' | 'report.month-by-group';
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

export interface PgPresenceQueryCatalogEntry {
  query_id: PgQueryId;
  description: string;
  buildStatement(input: Record<string, unknown>): PgSqlStatement;
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

function normalizeHrDateString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMinutes(totalMinutes: number): number {
  return Math.max(0, Math.trunc(totalMinutes));
}

function sumWorkedMinutes(rows: Array<{ punched_at: string; direction: PresenceDirection | "neutral" }>): number | null {
  let openEntry: string | null = null;
  let worked = 0;
  for (const row of rows) {
    if (row.direction === "in") {
      openEntry = row.punched_at;
      continue;
    }
    if (row.direction === "out" && openEntry) {
      const start = parseTimestamp(openEntry);
      const end = parseTimestamp(row.punched_at);
      if (start !== null && end !== null && end >= start) {
        worked += formatMinutes((end - start) / 60000);
      }
      openEntry = null;
    }
  }
  return rows.length > 0 ? worked : null;
}

function buildPunchDayStatement(input: NumaHrPunchDayParams): PgSqlStatement {
  return {
    text: `
      SELECT
        cp.punch_id,
        cp.person_id::text AS employee_id,
        concat_ws(' \n', p.name, p.surname) AS employee_name,
        cp.stamp::text AS punched_at,
        cp.punching_point_id,
        pp.name AS point_name,
        CASE
          WHEN pp.name ILIKE '%ENTRADA%' THEN 'in'
          WHEN pp.name ILIKE '%SALIDA%' THEN 'out'
          ELSE 'neutral'
        END AS direction
      FROM core_punches cp
      JOIN org_employees e ON e.person_id = cp.person_id
      JOIN core_persons p ON p.id = e.person_id
      LEFT JOIN core_punching_points pp ON pp.id = cp.punching_point_id
      WHERE cp.type = 1
        AND cp.stamp::date = $2
        AND ($1::text IS NULL OR cp.person_id::text = $1 OR e.code::text = $1)
        AND ($3::text IS NULL OR unaccent(lower(concat_ws(' \n', p.name, p.surname))) LIKE unaccent(lower($3)))
      ORDER BY cp.stamp ASC, cp.id ASC
      LIMIT $4 + 1
    `.trim(),
    values: [input.employee_id ?? null, input.date, input.employee_name ? `%${input.employee_name}%` : null, 25]
  };
}

function buildLeaveDaysStatement(input: NumaHrLeaveDaysParams): PgSqlStatement {
  return {
    text: `
      WITH requested_types AS (
        SELECT unnest($4::int[]) AS time_type_id
      )
      SELECT
        rt.time_type_id,
        tt.name AS time_type_name,
        COUNT(*) FILTER (WHERE r.val_accepted IS TRUE) AS days_disfrutados,
        COUNT(*) FILTER (WHERE r.val_accepted IS NULL) AS days_pendientes
      FROM requested_types rt
      LEFT JOIN ta_requests r
        ON r.employee_id::text = $1
       AND r.type = 4
       AND r.arg_time_type_1 = rt.time_type_id
       AND r.arg_date_1 >= $2::date
       AND r.arg_date_1 < $3::date
      LEFT JOIN ta_time_types tt ON tt.id = rt.time_type_id
      GROUP BY rt.time_type_id, tt.name
      ORDER BY rt.time_type_id ASC
    `.trim(),
    values: [input.employee_id ?? null, `${input.year}-01-01`, `${input.year + 1}-01-01`, input.time_type_ids]
  };
}

function buildLeaveBalanceStatement(input: NumaHrLeaveBalanceParams): PgSqlStatement {
  return {
    text: `
      WITH leave_totals AS (
        SELECT
          r.arg_time_type_1 AS time_type_id,
          COUNT(*) FILTER (WHERE r.val_accepted IS TRUE) AS days_disfrutados,
          COUNT(*) FILTER (WHERE r.val_accepted IS NULL) AS days_pendientes
        FROM ta_requests r
        WHERE r.employee_id::text = $1
          AND r.type = 4
          AND r.arg_time_type_1 = ANY($4::int[])
          AND r.arg_date_1 >= $2::date
          AND r.arg_date_1 < $3::date
        GROUP BY r.arg_time_type_1
      )
      SELECT
        rt.time_type_id,
        tt.name AS time_type_name,
        $5::jsonb ->> rt.time_type_id::text AS annual_quota,
        COALESCE(lt.days_disfrutados, 0) AS days_disfrutados,
        COALESCE(lt.days_pendientes, 0) AS days_pendientes
      FROM (SELECT unnest($4::int[]) AS time_type_id) rt
      LEFT JOIN leave_totals lt ON lt.time_type_id = rt.time_type_id
      LEFT JOIN ta_time_types tt ON tt.id = rt.time_type_id
      ORDER BY rt.time_type_id ASC
    `.trim(),
    values: [input.employee_id ?? null, `${input.year}-01-01`, `${input.year + 1}-01-01`, input.time_type_ids, input.annual_quota_by_time_type]
  };
}

function buildWorktimeSummaryStatement(input: NumaHrWorktimeSummaryParams): PgSqlStatement {
  return {
    text: `
      WITH day_punches AS (
        SELECT
          cp.stamp::date AS work_date,
          cp.stamp::text AS punched_at,
          CASE
            WHEN pp.name ILIKE '%ENTRADA%' THEN 'in'
            WHEN pp.name ILIKE '%SALIDA%' THEN 'out'
            ELSE 'neutral'
          END AS direction
        FROM core_punches cp
        JOIN org_employees e ON e.person_id = cp.person_id
        JOIN core_persons p ON p.id = e.person_id
        LEFT JOIN core_punching_points pp ON pp.id = cp.punching_point_id
        WHERE cp.type = 1
          AND cp.stamp::date >= $2::date
          AND cp.stamp::date < $3::date
          AND ($1::text IS NULL OR cp.person_id::text = $1 OR e.code::text = $1)
          AND ($4::text IS NULL OR unaccent(lower(concat_ws(' \n', p.name, p.surname))) LIKE unaccent(lower($4)))
      )
      SELECT
        work_date::text AS work_date,
        MIN(punched_at) FILTER (WHERE direction = 'in') AS first_entry_at,
        MAX(punched_at) FILTER (WHERE direction = 'out') AS last_exit_at,
        COUNT(*) AS punch_count,
        COALESCE(SUM(CASE WHEN direction IN ('in', 'out') THEN 1 ELSE 0 END), 0) * 0 AS worked_minutes,
        $5::int AS theoretical_minutes,
        0 AS overtime_minutes
      FROM day_punches
      GROUP BY work_date
      ORDER BY work_date ASC
    `.trim(),
    values: [input.employee_id ?? null, input.date_from, input.date_to, input.employee_name ? `%${input.employee_name}%` : null, input.theoretical_workday_minutes ?? null]
  };
}

function buildReportMonthByGroupStatement(input: NumaHrReportMonthByGroupParams): PgSqlStatement {
  return {
    text: `
      WITH emp AS (
        SELECT
          e.person_id::text AS employee_id,
          concat_ws(' \n', p.name, p.surname) AS employee_name,
          e.active
        FROM org_employee_groups_employees ge
        JOIN org_employees e ON e.id = ge.employee_id
        JOIN core_persons p ON p.id = e.person_id
        WHERE ge.group_id::text = COALESCE($1::text, $2::text)
          AND ge.status = true
          AND coalesce(p.name, '') <> coalesce(p.surname, '')
      )
      SELECT
        emp.employee_id,
        emp.employee_name,
        COUNT(DISTINCT cp.stamp::date) AS days_with_punch,
        COALESCE(SUM(0), 0) AS worked_minutes,
        COALESCE(COUNT(DISTINCT r.arg_date_1), 0) AS leave_days,
        COALESCE(COUNT(DISTINCT r.arg_date_1), 0) AS vacation_days,
        emp.active
      FROM emp
      LEFT JOIN core_punches cp
        ON cp.person_id::text = emp.employee_id
       AND cp.type = 1
       AND cp.stamp::date >= $3::date
       AND cp.stamp::date < $4::date
      LEFT JOIN ta_requests r
        ON r.employee_id::text = emp.employee_id
       AND r.type = 4
       AND r.val_accepted IS TRUE
       AND r.arg_date_1 >= $3::date
       AND r.arg_date_1 < $4::date
      GROUP BY emp.employee_id, emp.employee_name, emp.active
      ORDER BY emp.employee_name ASC
      LIMIT $5 + 1
      OFFSET $6
    `.trim(),
    values: [input.group_id ?? null, input.group_name ?? null, `${input.year}-${String(input.month).padStart(2, "0")}-01`, `${input.year}-${String(input.month + 1).padStart(2, "0")}-01`, input.limit, input.offset]
  };
}

function mapHrResultRows<TRecord>(rows: TRecord[], limit: number): { records: TRecord[]; truncated: boolean; row_count: number } {
  const truncated = rows.length > limit;
  return {
    records: rows.slice(0, limit),
    truncated,
    row_count: rows.length
  };
}

function mapPunchDayResult(rows: PgHrPunchDayRow[], input: NumaHrPunchDayParams): NumaHrPunchDayResult {
  const rowsInWindow = rows.slice(0, 25);
  const summary = mapHrResultRows(rowsInWindow, 25);
  const firstEntry = rowsInWindow.find((row) => row.direction === "in")?.punched_at ?? null;
  const lastExit = [...rowsInWindow].reverse().find((row) => row.direction === "out")?.punched_at ?? null;
  return {
    query_id: 'punch.day',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date: input.date,
    records: summary.records.map((row) => ({
      punched_at: row.punched_at,
      punching_point_id: row.punching_point_id,
      point_name: row.point_name,
      direction: row.direction
    })),
    first_entry_at: firstEntry,
    last_exit_at: lastExit,
    worked_minutes: sumWorkedMinutes(rowsInWindow),
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [createCitation('punch.day', ['core_punches', 'core_persons', 'core_punching_points', 'org_employees'], summary.row_count, summary.truncated)]
  };
}

function mapLeaveDaysResult(rows: PgHrLeaveDaysRow[], input: NumaHrLeaveDaysParams): NumaHrLeaveDaysResult {
  const summary = mapHrResultRows(rows, input.time_type_ids.length);
  const records: NumaHrLeaveDaysResult["records"] = summary.records.map((row) => ({
    time_type_id: row.time_type_id,
    time_type_name: row.time_type_name,
    days_disfrutados: row.days_disfrutados,
    days_pendientes: input.include_pending ? row.days_pendientes : null
  })) as NumaHrLeaveDaysResult["records"];
  return {
    query_id: 'leave.days',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    year: input.year,
    time_type_ids: [...input.time_type_ids],
    include_pending: Boolean(input.include_pending),
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [createCitation('leave.days', ['ta_requests', 'ta_time_types'], summary.row_count, summary.truncated)]
  };
}

function mapLeaveBalanceResult(rows: PgHrLeaveDaysRow[], input: NumaHrLeaveBalanceParams): NumaHrLeaveBalanceResult {
  const summary = mapHrResultRows(rows, input.time_type_ids.length);
  const records: NumaHrLeaveBalanceResult["records"] = summary.records.map((row) => {
    const annualQuota = input.annual_quota_by_time_type[row.time_type_id] ?? null;
    const balance = annualQuota === null ? null : annualQuota - row.days_disfrutados;
    return {
      time_type_id: row.time_type_id,
      time_type_name: row.time_type_name,
      annual_quota: annualQuota,
      days_disfrutados: row.days_disfrutados,
      days_pendientes: input.include_pending ? row.days_pendientes : null,
      balance,
      message: annualQuota === null ? `cupo anual no configurado para ${row.time_type_name ?? row.time_type_id}` : null
    };
  }) as NumaHrLeaveBalanceResult["records"];
  return {
    query_id: 'leave.balance',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    year: input.year,
    time_type_ids: [...input.time_type_ids],
    include_pending: Boolean(input.include_pending),
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [createCitation('leave.balance', ['ta_requests', 'ta_time_types'], summary.row_count, summary.truncated)]
  };
}

function mapWorktimeSummaryResult(rows: PgHrWorktimeSummaryRow[], input: NumaHrWorktimeSummaryParams): NumaHrWorktimeSummaryResult {
  const summary = mapHrResultRows(rows, 31);
  const records: NumaHrWorktimeSummaryResult["records"] = summary.records.map((row) => ({
    work_date: row.work_date,
    first_entry_at: row.first_entry_at,
    last_exit_at: row.last_exit_at,
    punch_count: row.punch_count,
    worked_minutes: row.worked_minutes,
    theoretical_minutes: row.theoretical_minutes,
    overtime_minutes: row.overtime_minutes
  })) as NumaHrWorktimeSummaryResult["records"];
  return {
    query_id: 'worktime.summary',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date_from: input.date_from,
    date_to: input.date_to,
    theoretical_workday_minutes: input.theoretical_workday_minutes ?? null,
    records,
    total_worked_minutes: summary.records.reduce((sum, row) => sum + (row.worked_minutes ?? 0), 0),
    total_overtime_minutes: summary.records.reduce((sum, row) => sum + (row.overtime_minutes ?? 0), 0),
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [createCitation('worktime.summary', ['core_punches', 'core_punching_points', 'org_employees', 'core_persons'], summary.row_count, summary.truncated)]
  };
}

function mapReportMonthByGroupResult(rows: PgHrReportMonthByGroupRow[], input: NumaHrReportMonthByGroupParams): NumaHrReportMonthByGroupResult {
  const summary = mapHrResultRows(rows, input.limit);
  const records: NumaHrReportMonthByGroupResult["records"] = summary.records.map((row) => ({
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    days_with_punch: row.days_with_punch,
    worked_minutes: row.worked_minutes,
    leave_days: row.leave_days,
    vacation_days: row.vacation_days,
    active: row.active
  })) as NumaHrReportMonthByGroupResult["records"];
  return {
    query_id: 'report.month-by-group',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    group_id: input.group_id ?? null,
    group_name: input.group_name ?? null,
    year: input.year,
    month: input.month,
    limit: input.limit,
    offset: input.offset,
    employee_count: rows.length,
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [createCitation('report.month-by-group', ['org_employee_groups', 'org_employee_groups_employees', 'org_employees', 'core_persons', 'core_punches', 'ta_requests'], summary.row_count, summary.truncated)]
  };
}

export function getPgPresenceQueryCatalog(): PgPresenceQueryCatalogEntry[] {
  return [
    {
      query_id: 'employee.find',
      description: 'Find employees by search term',
      buildStatement: (input) =>
        buildEmployeeFindStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          term: String(input.term ?? ''),
          limit: Number(input.limit ?? 25)
        })
    },
    {
      query_id: 'punches.list',
      description: 'List employee punch records',
      buildStatement: (input) =>
        buildPunchesListStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          employee_id: input.employee_id === null ? null : normalizeString(input.employee_id),
          limit: Number(input.limit ?? 25),
          offset: Number(input.offset ?? 0)
        })
    },
    {
      query_id: 'presence.current',
      description: 'Resolve the current presence state',
      buildStatement: (input) =>
        buildCurrentPresenceStatement(
          {
            organization_id: String(input.organization_id ?? ''),
            correlation_id: String(input.correlation_id ?? ''),
            scope: {
              kind:
                input.scope_kind === 'self' || input.scope_kind === 'organization' || input.scope_kind === 'explicit' || input.scope_kind === 'unsupported'
                  ? (input.scope_kind as PresenceScope['kind'])
                  : 'unsupported',
              requester_principal_id: String(input.requester_principal_id ?? ''),
              organization_id: String(input.organization_id ?? ''),
              employee_ids: Array.isArray(input.employee_ids) ? input.employee_ids.map((entry: unknown) => String(entry)) : [],
              reason: String(input.reason ?? 'scope missing; TODO define RGPD-safe default')
            },
            active_window_days: Number(input.active_window_days ?? 90),
            current_window_hours: Number(input.current_window_hours ?? 24)
          },
          formatMadridTimestamp(new Date(Date.now() - 24 * 60 * 60 * 1000)),
          formatMadridTimestamp(new Date())
        )
    },
    {
      query_id: 'punch.day',
      description: 'Read one day of punches for an employee',
      buildStatement: (input) =>
        buildNumaHrPunchDayStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          employee_id: input.employee_id === null ? null : normalizeString(input.employee_id),
          employee_name: input.employee_name === null ? null : normalizeString(input.employee_name),
          date: String(input.date ?? ''),
          limit: Number(input.limit ?? 25)
        })
    },
    {
      query_id: 'leave.days',
      description: 'Read leave days by time type',
      buildStatement: (input) =>
        buildNumaHrLeaveDaysStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          employee_id: input.employee_id === null ? null : normalizeString(input.employee_id),
          employee_name: input.employee_name === null ? null : normalizeString(input.employee_name),
          year: Number(input.year ?? 0),
          time_type_ids: Array.isArray(input.time_type_ids) ? input.time_type_ids.map((entry: unknown) => Number(entry)).filter((entry: number) => Number.isFinite(entry)) : [],
          include_pending: Boolean(input.include_pending)
        })
    },
    {
      query_id: 'leave.balance',
      description: 'Read leave balance by time type',
      buildStatement: (input) =>
        buildNumaHrLeaveBalanceStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          employee_id: input.employee_id === null ? null : normalizeString(input.employee_id),
          employee_name: input.employee_name === null ? null : normalizeString(input.employee_name),
          year: Number(input.year ?? 0),
          time_type_ids: Array.isArray(input.time_type_ids) ? input.time_type_ids.map((entry: unknown) => Number(entry)).filter((entry: number) => Number.isFinite(entry)) : [],
          annual_quota_by_time_type: input.annual_quota_by_time_type && typeof input.annual_quota_by_time_type === 'object' && !Array.isArray(input.annual_quota_by_time_type) ? (input.annual_quota_by_time_type as Record<number, number>) : {},
          include_pending: Boolean(input.include_pending)
        })
    },
    {
      query_id: 'worktime.summary',
      description: 'Read worktime summary for a date range',
      buildStatement: (input) =>
        buildNumaHrWorktimeSummaryStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          employee_id: input.employee_id === null ? null : normalizeString(input.employee_id),
          employee_name: input.employee_name === null ? null : normalizeString(input.employee_name),
          date_from: String(input.date_from ?? ''),
          date_to: String(input.date_to ?? ''),
          theoretical_workday_minutes: input.theoretical_workday_minutes === undefined || input.theoretical_workday_minutes === null ? null : Number(input.theoretical_workday_minutes)
        })
    },
    {
      query_id: 'report.month-by-group',
      description: 'Read monthly summary by group',
      buildStatement: (input) =>
        buildNumaHrReportMonthByGroupStatement({
          organization_id: String(input.organization_id ?? ''),
          correlation_id: String(input.correlation_id ?? ''),
          group_id: input.group_id === null ? null : normalizeString(input.group_id),
          group_name: input.group_name === null ? null : normalizeString(input.group_name),
          year: Number(input.year ?? 0),
          month: Number(input.month ?? 0),
          limit: Number(input.limit ?? 25),
          offset: Number(input.offset ?? 0)
        })
    }
  ];
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


  punchDay(input: NumaHrPunchDayParams): NumaHrPunchDayResult {
    const normalized: NumaHrPunchDayParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      employee_id: normalizeString(input.employee_id),
      employee_name: normalizeString(input.employee_name),
      date: input.date.trim()
    };
    const companyId = this.resolveCompanyId(normalized.organization_id);
    const statement = buildNumaHrPunchDayStatement({ ...normalized, organization_id: companyId, limit: this.punchesListLimit });
    const rows = this.queryRunner.query<PgHrPunchDayRow>({
      query_id: 'punch.day',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrPunchDayResult(rows, normalized, this.punchesListLimit);
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
    const statement = buildNumaHrLeaveDaysStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrLeaveDaysRow>({
      query_id: 'leave.days',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrLeaveDaysResult(rows, normalized);
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
    const statement = buildNumaHrLeaveBalanceStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrLeaveDaysRow>({
      query_id: 'leave.balance',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrLeaveBalanceResult(rows, normalized);
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
    const statement = buildNumaHrWorktimeSummaryStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrWorktimeSummaryRow>({
      query_id: 'worktime.summary',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrWorktimeSummaryResult(rows, normalized);
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
    const statement = buildNumaHrReportMonthByGroupStatement({ ...normalized, organization_id: companyId });
    const rows = this.queryRunner.query<PgHrReportMonthByGroupRow>({
      query_id: 'report.month-by-group',
      statement,
      connection: this.connection,
      transaction: this.createTransactionPlan()
    });
    return mapNumaHrReportMonthByGroupResult(rows, normalized);
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
