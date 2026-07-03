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
  PresenceStatus
} from '../../../contracts/src/index';

export const NUMA_POSTGRES_READ_ADAPTER_ID = 'numa-postgres' as const;
export const NUMA_POSTGRES_SOURCE_SYSTEM = 'postgres' as const;
export const NUMA_POSTGRES_ROLE = 'kern_ro' as const;

export type PgPresenceQueryId = 'employee.find' | 'punches.list' | 'presence.current';

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
    query_id: PgPresenceQueryId;
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
  query_id: PgPresenceQueryId;
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

function createCitation(queryId: PgPresenceQueryId, tables: string[], rowCount: number, truncated: boolean): PresenceSourceCitation {
  return { tables, queryId, rowCount, truncated };
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
      WHERE e.organization_id = $1
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
       AND e.organization_id = p.organization_id
      WHERE p.organization_id = $1
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
        WHERE e.organization_id = $1
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
        WHERE p.organization_id = $1
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
    }
  ];
}

export function createPgConnectionConfigFromEnv(env: Record<string, string | undefined> = process.env): PgConnectionConfig {
  return {
    host: env.KERN_PGHOST ?? '127.0.0.1',
    port: Number(env.KERN_PGPORT ?? '5432'),
    database: env.KERN_PGDATABASE ?? 'kern',
    user: env.KERN_PGUSER ?? NUMA_POSTGRES_ROLE,
    password: env.KERN_PGPASSWORD ?? null,
    sslmode: (env.KERN_PGSSLMODE as PgConnectionConfig['sslmode']) ?? 'disable',
    application_name: env.KERN_PGAPPNAME ?? NUMA_POSTGRES_READ_ADAPTER_ID,
    role: NUMA_POSTGRES_ROLE
  };
}

export class PgReadAdapter implements PresenceReadPort {
  readonly adapter_id = NUMA_POSTGRES_READ_ADAPTER_ID;
  readonly source_system = NUMA_POSTGRES_SOURCE_SYSTEM;

  private readonly queryRunner: PgPresenceQueryRunner;
  private readonly connection: PgConnectionConfig;
  private readonly statementTimeoutMs: number;
  private readonly activeWindowDays: number;
  private readonly currentWindowHours: number;
  private readonly employeeFindLimit: number;
  private readonly punchesListLimit: number;
  private readonly now: () => Date;

  constructor(options: PgReadAdapterOptions) {
    this.queryRunner = options.queryRunner;
    this.connection = { ...createPgConnectionConfigFromEnv(), ...options.connection, role: NUMA_POSTGRES_ROLE };
    this.statementTimeoutMs = options.statement_timeout_ms ?? 15_000;
    this.activeWindowDays = options.active_window_days ?? 90;
    this.currentWindowHours = clampInteger(options.current_window_hours ?? 24, 1, 24);
    this.employeeFindLimit = options.employee_find_limit ?? 25;
    this.punchesListLimit = options.punches_list_limit ?? 25;
    this.now = options.now ?? (() => new Date());
  }

  findEmployee(input: PresenceEmployeeFindParams): PresenceEmployeeFindResult {
    const normalized: PresenceEmployeeFindParams = {
      organization_id: input.organization_id.trim(),
      correlation_id: input.correlation_id.trim(),
      term: input.term.trim(),
      limit: normalizeLimit(input.limit, this.employeeFindLimit)
    };
    const statement = buildEmployeeFindStatement(normalized);
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
    const statement = buildPunchesListStatement(normalized);
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
    const statement = buildCurrentPresenceStatement(normalized, windowStart, windowEnd);
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
