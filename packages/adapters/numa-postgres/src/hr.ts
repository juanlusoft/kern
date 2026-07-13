import type {
  NumaHrCurrentWorkersParams,
  NumaHrCurrentWorkersResult,
  NumaHrLeaveBalanceParams,
  NumaHrLeaveBalanceResult,
  NumaHrLeaveDaysParams,
  NumaHrLeaveDaysResult,
  NumaHrLeaveDetailParams,
  NumaHrLeaveDetailResult,
  NumaHrPunchDayParams,
  NumaHrPunchDayResult,
  NumaHrPunchDayWorkersParams,
  NumaHrPunchDayWorkersResult,
  NumaHrPunchRangeParams,
  NumaHrPunchRangeResult,
  NumaHrReportMonthByGroupParams,
  NumaHrReportMonthByGroupResult,
  NumaHrWorktimeSummaryParams,
  NumaHrWorktimeSummaryResult,
  PresenceDirection
} from '../../../contracts/src/index';

export interface PgHrPunchDayRow {
  punch_id: string;
  employee_id: string;
  employee_name: string;
  punched_at: string;
  punching_point_id: number | null;
  point_name: string | null;
  direction: PresenceDirection | 'neutral';
}

export interface PgHrCurrentWorkerRow {
  employee_id: string;
  employee_name: string;
  last_entry_at: string;
  punching_point_id: number | null;
  point_name: string | null;
}

export interface PgHrPunchDayWorkerRow {
  employee_id: string;
  employee_name: string;
  punches: PgHrWorktimeSummaryPunchRow[];
  first_entry_at?: string | null;
  last_exit_at?: string | null;
  punch_count?: number;
}

export interface PgHrLeaveDaysRow {
  time_type_id: number;
  time_type_name: string | null;
  days_disfrutados: number;
  days_pendientes: number;
}

export interface PgHrLeaveDetailRow {
  request_id: string;
  time_type_id: number;
  time_type_name: string | null;
  start_date: string;
  end_date: string;
  day_count: number;
  status: 'accepted' | 'pending' | 'rejected';
}

export interface PgHrWorktimeSummaryPunchRow {
  punched_at: string;
  direction: PresenceDirection | 'neutral';
}

export interface PgHrWorktimeSummaryRow {
  work_date: string;
  punches: PgHrWorktimeSummaryPunchRow[];
  first_entry_at?: string | null;
  last_exit_at?: string | null;
  punch_count?: number;
  worked_minutes?: number | null;
  theoretical_minutes?: number | null;
  overtime_minutes?: number | null;
}

export interface PgHrReportMonthByGroupRow {
  employee_id: string;
  employee_name: string;
  active: boolean;
  days_with_punch: number;
  punches: PgHrWorktimeSummaryPunchRow[];
  leave_days: number;
  vacation_days: number;
  worked_minutes?: number | null;
}

export interface PgHrEmployeeCandidateRow {
  employee_id: string;
  employee_name: string;
  exact_match: boolean;
}

export interface PgHrGroupCandidateRow {
  group_id: string;
  group_name: string;
  exact_match: boolean;
}

export interface PgSqlStatement {
  text: string;
  values: readonly unknown[];
}

function buildLikePattern(value: string | null): string | null {
  return value ? `%${value}%` : null;
}

function formatDateYmd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildMonthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: formatDateYmd(start), end: formatDateYmd(end) };
}

function mapHrResultRows<TRecord>(rows: TRecord[], limit: number): { records: TRecord[]; row_count: number; truncated: boolean } {
  return {
    records: rows.slice(0, limit),
    row_count: rows.length,
    truncated: rows.length > limit
  };
}

function normalizePgNumeric(value: number | string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`Expected a finite PostgreSQL numeric value, received ${String(value)}`);
  }
  return numeric;
}


type NumaHrPunchDayQueryInput = NumaHrPunchDayParams & { limit: number };
type NumaHrCurrentWorkersQueryInput = NumaHrCurrentWorkersParams & { window_start: string; window_end: string };
type NumaHrPunchDayWorkersQueryInput = NumaHrPunchDayWorkersParams;
type NumaHrPunchRangeQueryInput = NumaHrPunchRangeParams;

export function buildNumaHrEmployeeResolveStatement(input: Pick<NumaHrPunchDayParams, 'organization_id' | 'employee_name'> & { limit: number }): PgSqlStatement {
  return {
    text: `
      SELECT
        e.person_id::text AS employee_id,
        concat_ws(' ', p.name, p.surname) AS employee_name,
        unaccent(lower(concat_ws(' ', p.name, p.surname))) = unaccent(lower($2)) AS exact_match
      FROM org_employees e
      JOIN core_persons p ON p.id = e.person_id
      WHERE e.company_id = $1
        AND unaccent(lower(concat_ws(' ', p.name, p.surname))) LIKE unaccent(lower($3))
      ORDER BY exact_match DESC, employee_name ASC, e.person_id ASC
      LIMIT $4 + 1
    `.trim(),
    values: [input.organization_id, input.employee_name, buildLikePattern(input.employee_name ?? null), input.limit]
  };
}

export function buildNumaHrGroupResolveStatement(input: Pick<NumaHrReportMonthByGroupParams, 'organization_id' | 'group_name'> & { limit: number }): PgSqlStatement {
  return {
    text: `
      SELECT
        g.id::text AS group_id,
        g.name AS group_name,
        unaccent(lower(g.name)) = unaccent(lower($2)) AS exact_match
      FROM org_employee_groups g
      WHERE g.company_id = $1
        AND unaccent(lower(g.name)) LIKE unaccent(lower($3))
      ORDER BY exact_match DESC, group_name ASC, g.id ASC
      LIMIT $4 + 1
    `.trim(),
    values: [input.organization_id, input.group_name, buildLikePattern(input.group_name ?? null), input.limit]
  };
}

export function buildNumaHrPunchDayStatement(input: NumaHrPunchDayQueryInput): PgSqlStatement {
  return {
    text: `
      SELECT
        cp.id AS punch_id,
        cp.person_id::text AS employee_id,
        concat_ws(' ', p.name, p.surname) AS employee_name,
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
        AND e.company_id = $1
        AND cp.stamp::date = $2::date
        AND (
          ($3::text IS NULL AND $4::text IS NULL)
          OR cp.person_id::text = $3
          OR e.code::text = $3
          OR unaccent(lower(concat_ws(' ', p.name, p.surname))) LIKE unaccent(lower($4))
        )
      ORDER BY cp.stamp ASC, cp.id ASC
      LIMIT $5 + 1
    `.trim(),
    values: [input.organization_id, input.date, input.employee_id ?? null, buildLikePattern(input.employee_name ?? null), input.limit]
  };
}

export function buildNumaHrCurrentWorkersStatement(input: NumaHrCurrentWorkersQueryInput): PgSqlStatement {
  return {
    text: `
      WITH latest_punch AS (
        SELECT DISTINCT ON (cp.person_id)
          cp.person_id::text AS employee_id,
          concat_ws(' ', p.name, p.surname) AS employee_name,
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
          AND e.company_id = $1
          AND cp.stamp >= $2::timestamp
          AND cp.stamp <= $3::timestamp
        ORDER BY cp.person_id, cp.stamp DESC, cp.id DESC
      )
      SELECT
        employee_id,
        employee_name,
        punched_at AS last_entry_at,
        punching_point_id,
        point_name
      FROM latest_punch
      WHERE direction = 'in'
      ORDER BY employee_name ASC, employee_id ASC
      LIMIT $4 + 1
    `.trim(),
    values: [input.organization_id, input.window_start, input.window_end, input.limit]
  };
}

export function buildNumaHrPunchDayWorkersStatement(input: NumaHrPunchDayWorkersQueryInput): PgSqlStatement {
  return {
    text: `
      SELECT
        cp.person_id::text AS employee_id,
        concat_ws(' ', p.name, p.surname) AS employee_name,
        jsonb_agg(
          jsonb_build_object(
            'punched_at', cp.stamp::text,
            'direction', CASE
              WHEN pp.name ILIKE '%ENTRADA%' THEN 'in'
              WHEN pp.name ILIKE '%SALIDA%' THEN 'out'
              ELSE 'neutral'
            END
          )
          ORDER BY cp.stamp ASC, cp.id ASC
        ) AS punches,
        (MIN(cp.stamp) FILTER (WHERE pp.name ILIKE '%ENTRADA%'))::text AS first_entry_at,
        (MAX(cp.stamp) FILTER (WHERE pp.name ILIKE '%SALIDA%'))::text AS last_exit_at,
        COUNT(*) AS punch_count
      FROM core_punches cp
      JOIN org_employees e ON e.person_id = cp.person_id
      JOIN core_persons p ON p.id = e.person_id
      LEFT JOIN core_punching_points pp ON pp.id = cp.punching_point_id
      WHERE cp.type = 1
        AND e.company_id = $1
        AND cp.stamp::date = $2::date
      GROUP BY cp.person_id, p.name, p.surname
      ORDER BY employee_name ASC, employee_id ASC
      LIMIT $3 + 1
    `.trim(),
    values: [input.organization_id, input.date, input.limit]
  };
}

export function buildNumaHrPunchRangeStatement(input: NumaHrPunchRangeQueryInput): PgSqlStatement {
  return {
    text: `
      SELECT
        cp.id AS punch_id,
        cp.person_id::text AS employee_id,
        concat_ws(' ', p.name, p.surname) AS employee_name,
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
        AND e.company_id = $1
        AND cp.stamp::date >= $2::date
        AND cp.stamp::date <= $3::date
        AND (
          ($4::text IS NULL AND $5::text IS NULL)
          OR cp.person_id::text = $4
          OR e.code::text = $4
          OR unaccent(lower(concat_ws(' ', p.name, p.surname))) LIKE unaccent(lower($5))
        )
      ORDER BY cp.stamp ASC, cp.id ASC
      LIMIT $6 + 1
    `.trim(),
    values: [input.organization_id, input.date_from, input.date_to, input.employee_id ?? null, buildLikePattern(input.employee_name ?? null), input.limit]
  };
}

function buildResolutionCandidates(rows: Array<{ employee_name?: string; group_name?: string }>, limit: number): Array<{ name: string }> {
  return rows
    .slice(0, limit)
    .map((row) => row.employee_name ?? row.group_name ?? null)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => ({ name }));
}

function buildResolutionMessage(kind: 'employee' | 'group', requestedName: string | null | undefined, candidateCount: number): string {
  const label = kind === 'employee' ? 'trabajador' : 'centro';
  const requested = requestedName?.trim() ? `"${requestedName.trim()}"` : `el ${label} indicado`;
  if (candidateCount === 0) {
    return `No he encontrado ${label} para ${requested}.`;
  }
  return `He encontrado varios resultados para ${requested}. Necesito que concretes el ${label}.`;
}

export function buildNumaHrPunchDayResolutionResult(
  input: NumaHrPunchDayParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrEmployeeCandidateRow[],
  limit: number
): NumaHrPunchDayResult {
  return {
    query_id: 'punch.day',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date: input.date,
    records: [],
    first_entry_at: null,
    last_exit_at: null,
    worked_minutes: null,
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employees', 'core_persons'], queryId: 'employee.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('employee', input.employee_name, candidates.length)
  };
}

export function buildNumaHrPunchRangeResolutionResult(
  input: NumaHrPunchRangeParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrEmployeeCandidateRow[],
  limit: number
): NumaHrPunchRangeResult {
  return {
    query_id: 'punch.range',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date_from: input.date_from,
    date_to: input.date_to,
    limit: input.limit,
    records: [],
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employees', 'core_persons'], queryId: 'employee.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('employee', input.employee_name, candidates.length)
  };
}

export function buildNumaHrLeaveDaysResolutionResult(
  input: NumaHrLeaveDaysParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrEmployeeCandidateRow[],
  limit: number
): NumaHrLeaveDaysResult {
  return {
    query_id: 'leave.days',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    year: input.year,
    time_type_ids: [...input.time_type_ids],
    include_pending: Boolean(input.include_pending),
    records: [],
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employees', 'core_persons'], queryId: 'employee.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('employee', input.employee_name, candidates.length)
  };
}

export function buildNumaHrLeaveBalanceResolutionResult(
  input: NumaHrLeaveBalanceParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrEmployeeCandidateRow[],
  limit: number
): NumaHrLeaveBalanceResult {
  return {
    query_id: 'leave.balance',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    year: input.year,
    time_type_ids: [...input.time_type_ids],
    include_pending: Boolean(input.include_pending),
    records: [],
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employees', 'core_persons'], queryId: 'employee.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('employee', input.employee_name, candidates.length)
  };
}

export function buildNumaHrLeaveDetailResolutionResult(
  input: NumaHrLeaveDetailParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrEmployeeCandidateRow[],
  limit: number
): NumaHrLeaveDetailResult {
  return {
    query_id: 'leave.detail',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date_from: input.date_from,
    date_to: input.date_to,
    time_type_ids: [...input.time_type_ids],
    include_pending: Boolean(input.include_pending),
    limit: input.limit,
    records: [],
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employees', 'core_persons'], queryId: 'employee.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('employee', input.employee_name, candidates.length)
  };
}

export function buildNumaHrWorktimeSummaryResolutionResult(
  input: NumaHrWorktimeSummaryParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrEmployeeCandidateRow[],
  limit: number
): NumaHrWorktimeSummaryResult {
  return {
    query_id: 'worktime.summary',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date_from: input.date_from,
    date_to: input.date_to,
    theoretical_workday_minutes: input.theoretical_workday_minutes ?? null,
    records: [],
    total_worked_minutes: 0,
    total_overtime_minutes: null,
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employees', 'core_persons'], queryId: 'employee.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('employee', input.employee_name, candidates.length)
  };
}

export function buildNumaHrReportMonthByGroupResolutionResult(
  input: NumaHrReportMonthByGroupParams,
  status: 'ambiguous' | 'not_found',
  candidates: PgHrGroupCandidateRow[],
  limit: number
): NumaHrReportMonthByGroupResult {
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
    employee_count: 0,
    records: [],
    row_count: candidates.length,
    truncated: candidates.length > limit,
    citations: [{ tables: ['org_employee_groups'], queryId: 'group.resolve', rowCount: candidates.length, truncated: candidates.length > limit }],
    resolution_status: status,
    resolution_candidates: buildResolutionCandidates(candidates, limit),
    resolution_message: buildResolutionMessage('group', input.group_name, candidates.length)
  };
}
function buildLeaveStatement(input: NumaHrLeaveDaysParams | NumaHrLeaveBalanceParams): PgSqlStatement {
  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year + 1}-01-01`;
  return {
    text: `
      WITH employee_scope AS (
        SELECT
          e.person_id::text AS employee_id
        FROM org_employees e
        JOIN core_persons p ON p.id = e.person_id
        WHERE e.company_id = $1
          AND (
            ($5::text IS NULL AND $6::text IS NULL)
            OR e.person_id::text = $5
            OR e.code::text = $5
            OR unaccent(lower(concat_ws(' ', p.name, p.surname))) LIKE unaccent(lower($6))
          )
        ORDER BY e.person_id ASC
        LIMIT 1
      ),
      requested_types AS (
        SELECT unnest($4::int[]) AS time_type_id
      )
      SELECT
        rt.time_type_id,
        tt.name AS time_type_name,
        COUNT(*) FILTER (WHERE r.val_accepted IS TRUE) AS days_disfrutados,
        COUNT(*) FILTER (WHERE r.val_accepted IS NULL) AS days_pendientes
      FROM requested_types rt
      CROSS JOIN employee_scope es
      LEFT JOIN ta_requests r
        ON r.employee_id::text = es.employee_id
       AND r.type = 4
       AND r.arg_time_type_1 = rt.time_type_id
       AND r.arg_date_1 >= $2::date
       AND r.arg_date_1 < $3::date
      LEFT JOIN ta_time_types tt ON tt.id = rt.time_type_id AND tt.company_id = $1
      GROUP BY rt.time_type_id, tt.name
      ORDER BY rt.time_type_id ASC
    `.trim(),
    values: [input.organization_id, yearStart, yearEnd, input.time_type_ids, input.employee_id ?? null, buildLikePattern(input.employee_name ?? null)]
  };
}

export function buildNumaHrLeaveDaysStatement(input: NumaHrLeaveDaysParams): PgSqlStatement {
  return buildLeaveStatement(input);
}

export function buildNumaHrLeaveBalanceStatement(input: NumaHrLeaveBalanceParams): PgSqlStatement {
  return buildLeaveStatement(input);
}

export function buildNumaHrLeaveDetailStatement(input: NumaHrLeaveDetailParams): PgSqlStatement {
  return {
    text: `
      WITH employee_scope AS (
        SELECT
          e.person_id::text AS employee_id
        FROM org_employees e
        JOIN core_persons p ON p.id = e.person_id
        WHERE e.company_id = $1
          AND (
            ($6::text IS NULL AND $7::text IS NULL)
            OR e.person_id::text = $6
            OR e.code::text = $6
            OR unaccent(lower(concat_ws(' ', p.name, p.surname))) LIKE unaccent(lower($7))
          )
        ORDER BY e.person_id ASC
        LIMIT 1
      )
      SELECT
        r.id::text AS request_id,
        r.arg_time_type_1 AS time_type_id,
        tt.name AS time_type_name,
        r.arg_date_1::text AS start_date,
        COALESCE(r.arg_date_2, r.arg_date_1)::text AS end_date,
        GREATEST((COALESCE(r.arg_date_2, r.arg_date_1) - r.arg_date_1) + 1, 1) AS day_count,
        CASE
          WHEN r.val_accepted IS TRUE THEN 'accepted'
          WHEN r.val_accepted IS NULL THEN 'pending'
          ELSE 'rejected'
        END AS status
      FROM ta_requests r
      JOIN employee_scope es ON es.employee_id = r.employee_id::text
      LEFT JOIN ta_time_types tt ON tt.id = r.arg_time_type_1 AND tt.company_id = $1
      WHERE r.type = 4
        AND r.arg_time_type_1 = ANY($4::int[])
        AND r.arg_date_1 IS NOT NULL
        AND r.arg_date_1 <= $3::date
        AND COALESCE(r.arg_date_2, r.arg_date_1) >= $2::date
        AND (
          r.val_accepted IS TRUE
          OR ($5::boolean IS TRUE AND r.val_accepted IS NULL)
        )
      ORDER BY r.arg_date_1 ASC, COALESCE(r.arg_date_2, r.arg_date_1) ASC, r.id ASC
      LIMIT $8 + 1
    `.trim(),
    values: [
      input.organization_id,
      input.date_from,
      input.date_to,
      input.time_type_ids,
      Boolean(input.include_pending),
      input.employee_id ?? null,
      buildLikePattern(input.employee_name ?? null),
      input.limit
    ]
  };
}

export function buildNumaHrWorktimeSummaryStatement(input: NumaHrWorktimeSummaryParams): PgSqlStatement {
  return {
    text: `
      SELECT
        cp.stamp::date AS work_date,
        jsonb_agg(
          jsonb_build_object(
            'punched_at', cp.stamp::text,
            'direction', CASE
              WHEN pp.name ILIKE '%ENTRADA%' THEN 'in'
              WHEN pp.name ILIKE '%SALIDA%' THEN 'out'
              ELSE 'neutral'
            END
          )
          ORDER BY cp.stamp ASC, cp.id ASC
        ) AS punches
      FROM core_punches cp
      JOIN org_employees e ON e.person_id = cp.person_id
      JOIN core_persons p ON p.id = e.person_id
      LEFT JOIN core_punching_points pp ON pp.id = cp.punching_point_id
      WHERE cp.type = 1
        AND e.company_id = $1
        AND cp.stamp::date >= $2::date
        AND cp.stamp::date <= $3::date
        AND (
          ($4::text IS NULL AND $5::text IS NULL)
          OR cp.person_id::text = $4
          OR e.code::text = $4
          OR unaccent(lower(concat_ws(' ', p.name, p.surname))) LIKE unaccent(lower($5))
        )
      GROUP BY cp.stamp::date
      ORDER BY cp.stamp::date ASC
      LIMIT 31 + 1
    `.trim(),
    values: [input.organization_id, input.date_from, input.date_to, input.employee_id ?? null, buildLikePattern(input.employee_name ?? null)]
  };
}

export function buildNumaHrReportMonthByGroupStatement(input: NumaHrReportMonthByGroupParams): PgSqlStatement {
  const { start, end } = buildMonthRange(input.year, input.month);
  return {
    text: `
      WITH group_scope AS (
        SELECT g.id
        FROM org_employee_groups g
        WHERE g.company_id = $1
          AND (
            $2::text IS NULL
            OR g.id::text = $2
          )
        AND (
          $3::text IS NULL
          OR unaccent(lower(g.name)) LIKE unaccent(lower($3))
        )
        ORDER BY g.name ASC
        LIMIT 1
      ),
      employees AS (
        SELECT
          e.id AS employee_row_id,
          e.person_id::text AS employee_id,
          concat_ws(' ', p.name, p.surname) AS employee_name,
          TRUE AS active
        FROM org_employee_groups_employees ge
        JOIN group_scope gs ON gs.id = ge.group_id
        JOIN org_employees e ON e.id = ge.employee_id
        JOIN core_persons p ON p.id = e.person_id
        WHERE ge.status = TRUE
          AND e.company_id = $1
      ),
      punch_summary AS (
        SELECT
          cp.person_id::text AS employee_id,
          COUNT(DISTINCT cp.stamp::date) AS days_with_punch,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'punched_at', cp.stamp::text,
                'direction', CASE
                  WHEN pp.name ILIKE '%ENTRADA%' THEN 'in'
                  WHEN pp.name ILIKE '%SALIDA%' THEN 'out'
                  ELSE 'neutral'
                END
              )
              ORDER BY cp.stamp ASC, cp.id ASC
            ),
            '[]'::jsonb
          ) AS punches
        FROM core_punches cp
        JOIN employees e ON e.employee_id = cp.person_id::text
        LEFT JOIN core_punching_points pp ON pp.id = cp.punching_point_id
        WHERE cp.type = 1
          AND cp.stamp::date >= $4::date
          AND cp.stamp::date < $5::date
        GROUP BY cp.person_id::text
      ),
      leave_summary AS (
        SELECT
          r.employee_id::text AS employee_id,
          COUNT(DISTINCT r.arg_date_1) FILTER (WHERE r.val_accepted IS TRUE) AS leave_days,
          COUNT(DISTINCT r.arg_date_1) FILTER (WHERE r.val_accepted IS TRUE AND r.arg_time_type_1 = 5) AS vacation_days
        FROM ta_requests r
        JOIN employees e ON e.employee_id = r.employee_id::text
        WHERE r.type = 4
          AND r.arg_date_1 >= $4::date
          AND r.arg_date_1 < $5::date
        GROUP BY r.employee_id::text
      )
      SELECT
        e.employee_id,
        e.employee_name,
          TRUE AS active,
        COALESCE(ps.days_with_punch, 0) AS days_with_punch,
        COALESCE(ps.punches, '[]'::jsonb) AS punches,
        COALESCE(ls.leave_days, 0) AS leave_days,
        COALESCE(ls.vacation_days, 0) AS vacation_days
      FROM employees e
      LEFT JOIN punch_summary ps ON ps.employee_id = e.employee_id
      LEFT JOIN leave_summary ls ON ls.employee_id = e.employee_id
      ORDER BY e.employee_name ASC
      LIMIT $6 + 1
      OFFSET $7
    `.trim(),
    values: [input.organization_id, input.group_id ?? null, buildLikePattern(input.group_name ?? null), start, end, input.limit, input.offset]
  };
}
function pairWorkedMinutes(rows: PgHrWorktimeSummaryPunchRow[]): number | null {
  if (rows.length === 0) {
    return null;
  }
  let openEntry: string | null = null;
  let worked = 0;
  for (const row of rows) {
    if (row.direction === 'in') {
      openEntry = row.punched_at;
      continue;
    }
    if (row.direction === 'out' && openEntry) {
      const start = Date.parse(openEntry);
      const end = Date.parse(row.punched_at);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        worked += Math.trunc((end - start) / 60000);
      }
      openEntry = null;
    }
  }
  return worked;
}

function normalizePunches(rows: unknown): PgHrWorktimeSummaryPunchRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter((row): row is PgHrWorktimeSummaryPunchRow => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return false;
    }
    const candidate = row as Record<string, unknown>;
    return typeof candidate.punched_at === 'string' && (candidate.direction === 'in' || candidate.direction === 'out' || candidate.direction === 'neutral');
  });
}

export function mapNumaHrPunchDayResult(rows: PgHrPunchDayRow[], input: NumaHrPunchDayParams, limit: number): NumaHrPunchDayResult {
  const summary = mapHrResultRows(rows, limit);
  const records = summary.records.map((row) => ({
    punched_at: row.punched_at,
    punching_point_id: row.punching_point_id,
    point_name: row.point_name,
    direction: row.direction
  })) as NumaHrPunchDayResult['records'];
  const visibleRows = summary.records;
  return {
    query_id: 'punch.day',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date: input.date,
    records,
    first_entry_at: visibleRows.find((row) => row.direction === 'in')?.punched_at ?? null,
    last_exit_at: [...visibleRows].reverse().find((row) => row.direction === 'out')?.punched_at ?? null,
    worked_minutes: pairWorkedMinutes(visibleRows.map((row) => ({ punched_at: row.punched_at, direction: row.direction }))),
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [
      {
        tables: ['core_punches', 'core_persons', 'core_punching_points', 'org_employees'],
        queryId: 'punch.day',
        rowCount: summary.row_count,
        truncated: summary.truncated
      }
    ]
  };
}

export function mapNumaHrCurrentWorkersResult(rows: PgHrCurrentWorkerRow[], input: NumaHrCurrentWorkersParams, asOf: string): NumaHrCurrentWorkersResult {
  const summary = mapHrResultRows(rows, input.limit);
  const records = summary.records.map((row) => ({
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    last_entry_at: row.last_entry_at,
    punching_point_id: row.punching_point_id,
    point_name: row.point_name
  })) as NumaHrCurrentWorkersResult['records'];
  return {
    query_id: 'presence.current-workers',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    as_of: asOf,
    worker_count: summary.row_count,
    limit: input.limit,
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [{ tables: ['core_punches', 'org_employees', 'core_persons', 'core_punching_points'], queryId: 'presence.current-workers', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrPunchDayWorkersResult(rows: PgHrPunchDayWorkerRow[], input: NumaHrPunchDayWorkersParams): NumaHrPunchDayWorkersResult {
  const summary = mapHrResultRows(rows, input.limit);
  const records = summary.records.map((row) => {
    const punches = normalizePunches(row.punches);
    return {
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      first_entry_at: row.first_entry_at ?? punches.find((entry) => entry.direction === 'in')?.punched_at ?? null,
      last_exit_at: row.last_exit_at ?? [...punches].reverse().find((entry) => entry.direction === 'out')?.punched_at ?? null,
      punch_count: normalizePgNumeric(row.punch_count ?? punches.length),
      worked_minutes: pairWorkedMinutes(punches)
    };
  }) as NumaHrPunchDayWorkersResult['records'];
  return {
    query_id: 'punch.day-workers',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    date: input.date,
    worker_count: summary.row_count,
    limit: input.limit,
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [{ tables: ['core_punches', 'org_employees', 'core_persons', 'core_punching_points'], queryId: 'punch.day-workers', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrPunchRangeResult(rows: PgHrPunchDayRow[], input: NumaHrPunchRangeParams, limit: number): NumaHrPunchRangeResult {
  const summary = mapHrResultRows(rows, limit);
  const records = summary.records.map((row) => ({
    punched_at: row.punched_at,
    punching_point_id: row.punching_point_id,
    point_name: row.point_name,
    direction: row.direction
  })) as NumaHrPunchRangeResult['records'];
  return {
    query_id: 'punch.range',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date_from: input.date_from,
    date_to: input.date_to,
    limit,
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [{ tables: ['core_punches', 'core_persons', 'core_punching_points', 'org_employees'], queryId: 'punch.range', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrLeaveDaysResult(rows: PgHrLeaveDaysRow[], input: NumaHrLeaveDaysParams): NumaHrLeaveDaysResult {
  const summary = mapHrResultRows(rows, input.time_type_ids.length);
  const records = summary.records.map((row) => ({
    time_type_id: row.time_type_id,
    time_type_name: row.time_type_name,
    days_disfrutados: normalizePgNumeric(row.days_disfrutados),
    days_pendientes: input.include_pending ? normalizePgNumeric(row.days_pendientes) : null
  })) as NumaHrLeaveDaysResult['records'];
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
    citations: [{ tables: ['ta_requests', 'ta_time_types'], queryId: 'leave.days', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrLeaveBalanceResult(rows: PgHrLeaveDaysRow[], input: NumaHrLeaveBalanceParams): NumaHrLeaveBalanceResult {
  const summary = mapHrResultRows(rows, input.time_type_ids.length);
  const records = summary.records.map((row) => {
    const annualQuota = input.annual_quota_by_time_type[row.time_type_id] ?? (row.time_type_id === 5 ? 22 : null);
    const daysDisfrutados = normalizePgNumeric(row.days_disfrutados);
    return {
      time_type_id: row.time_type_id,
      time_type_name: row.time_type_name,
      annual_quota: annualQuota,
      days_disfrutados: daysDisfrutados,
      days_pendientes: input.include_pending ? normalizePgNumeric(row.days_pendientes) : null,
      balance: annualQuota === null ? null : annualQuota - daysDisfrutados,
      message: annualQuota === null ? `cupo anual no configurado para ${row.time_type_name ?? row.time_type_id}` : null
    };
  }) as NumaHrLeaveBalanceResult['records'];
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
    citations: [{ tables: ['ta_requests', 'ta_time_types'], queryId: 'leave.balance', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrLeaveDetailResult(rows: PgHrLeaveDetailRow[], input: NumaHrLeaveDetailParams): NumaHrLeaveDetailResult {
  const summary = mapHrResultRows(rows, input.limit);
  const records = summary.records.map((row) => ({
    request_id: row.request_id,
    time_type_id: row.time_type_id,
    time_type_name: row.time_type_name,
    start_date: row.start_date,
    end_date: row.end_date,
    day_count: normalizePgNumeric(row.day_count),
    status: row.status
  })) as NumaHrLeaveDetailResult['records'];
  return {
    query_id: 'leave.detail',
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    date_from: input.date_from,
    date_to: input.date_to,
    time_type_ids: [...input.time_type_ids],
    include_pending: Boolean(input.include_pending),
    limit: input.limit,
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [{ tables: ['ta_requests', 'ta_time_types', 'org_employees', 'core_persons'], queryId: 'leave.detail', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrWorktimeSummaryResult(rows: PgHrWorktimeSummaryRow[], input: NumaHrWorktimeSummaryParams): NumaHrWorktimeSummaryResult {
  const summary = mapHrResultRows(rows, 31);
  const records = summary.records.map((row) => {
    const punches = normalizePunches(row.punches);
    const workedMinutes = pairWorkedMinutes(punches);
    const theoreticalMinutes = input.theoretical_workday_minutes ?? null;
    return {
      work_date: row.work_date,
      first_entry_at: punches.find((entry) => entry.direction === 'in')?.punched_at ?? null,
      last_exit_at: [...punches].reverse().find((entry) => entry.direction === 'out')?.punched_at ?? null,
      punch_count: punches.length,
      worked_minutes: workedMinutes ?? 0,
      theoretical_minutes: theoreticalMinutes,
      overtime_minutes: theoreticalMinutes === null || workedMinutes === null ? null : workedMinutes - theoreticalMinutes
    };
  }) as NumaHrWorktimeSummaryResult['records'];
  const totalWorkedMinutes = records.reduce((sum, row) => sum + row.worked_minutes, 0);
  const totalOvertimeMinutes = input.theoretical_workday_minutes === null ? null : records.reduce((sum, row) => sum + (row.overtime_minutes ?? 0), 0);
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
    total_worked_minutes: totalWorkedMinutes,
    total_overtime_minutes: totalOvertimeMinutes,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [{ tables: ['core_punches', 'core_punching_points', 'org_employees', 'core_persons'], queryId: 'worktime.summary', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}

export function mapNumaHrReportMonthByGroupResult(rows: PgHrReportMonthByGroupRow[], input: NumaHrReportMonthByGroupParams): NumaHrReportMonthByGroupResult {
  const summary = mapHrResultRows(rows, input.limit);
  const records = summary.records.map((row) => {
    const punches = normalizePunches(row.punches);
    const workedMinutes = pairWorkedMinutes(punches);
    return {
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      days_with_punch: normalizePgNumeric(row.days_with_punch),
      worked_minutes: workedMinutes,
      leave_days: normalizePgNumeric(row.leave_days),
      vacation_days: normalizePgNumeric(row.vacation_days),
      active: row.active
    };
  }) as NumaHrReportMonthByGroupResult['records'];
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
    employee_count: summary.row_count,
    records,
    row_count: summary.row_count,
    truncated: summary.truncated,
    citations: [{ tables: ['org_employee_groups', 'org_employee_groups_employees', 'org_employees', 'core_persons', 'core_punches', 'ta_requests'], queryId: 'report.month-by-group', rowCount: summary.row_count, truncated: summary.truncated }]
  };
}
