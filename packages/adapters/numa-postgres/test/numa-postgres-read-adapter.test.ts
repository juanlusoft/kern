import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMA_POSTGRES_ROLE,
  createPgReadAdapter,
  getPgPresenceQueryCatalog,
  type PgPresenceQueryRunner
} from '../src/index';
import {
  buildNumaHrLeaveBalanceStatement,
  buildNumaHrLeaveDaysStatement,
  buildNumaHrPunchDayStatement,
  buildNumaHrWorktimeSummaryStatement
} from '../src/hr';

const company_id_by_organization_id = { 'org-acme': 'company-acme' };

function createRunner(responseByQueryId: Record<string, unknown[]>) {
  const calls: Array<{ query_id: string; statement: string; transactionRole: string; values: readonly unknown[] }> = [];
  const runner: PgPresenceQueryRunner = {
    query(input) {
      calls.push({
        query_id: input.query_id,
        statement: input.statement.text,
        transactionRole: input.transaction.role,
        values: input.statement.values
      });
      return (responseByQueryId[input.query_id] ?? []) as never[];
    }
  };
  return { runner, calls };
}

test('presence adapter search uses unaccent and closed query catalog', () => {
  const { runner, calls } = createRunner({
    'employee.find': [
      {
        employee_id: 'emp-001',
        principal_id: 'principal-001',
        display_name: 'Jos\u00E9 Alvarez',
        email: 'jose@example.test',
        active: true
      }
    ]
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  const result = adapter.findEmployee({
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    term: 'Jos\u00E9',
    limit: 5
  });

  assert.equal(result.records[0]?.display_name, 'Jos\u00E9 Alvarez');
  assert.match(calls[0].statement, /unaccent\(lower/);
  assert.match(calls[0].statement, /company_id = \$1/);
  assert.equal(calls[0].values[0], 'company-acme');
  assert.match(calls[0].statement, /LIMIT \$3 \+ 1/);
  assert.equal(calls[0].transactionRole, NUMA_POSTGRES_ROLE);
  assert.deepEqual(getPgPresenceQueryCatalog().map((entry) => entry.query_id), ['employee.find', 'punches.list', 'presence.current', 'punch.day', 'leave.days', 'leave.balance', 'worktime.summary', 'report.month-by-group']);
});

test('presence adapter fails closed when company mapping is missing', () => {
  const { runner } = createRunner({
    'employee.find': []
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    company_id_by_organization_id: {},
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  assert.throws(
    () =>
      adapter.findEmployee({
        organization_id: 'org-acme',
        correlation_id: 'corr-missing-company-id',
        term: 'Jos\u00E9',
        limit: 5
      }),
    /Missing Numa company_id mapping/
  );
});
test('presence adapter truncates punch lists and resolves current presence from CTE-based rows', () => {
  const { runner, calls } = createRunner({
    'punches.list': [
      {
        punch_id: 'punch-001',
        employee_id: 'emp-001',
        display_name: 'Jos\u00E9 Alvarez',
        direction: 'in',
        punched_at: '2026-07-03T08:00:00.000Z',
        source_table: 'kern.employee_punches',
        source_record_id: 'punch-001'
      },
      {
        punch_id: 'punch-002',
        employee_id: 'emp-001',
        display_name: 'Jos\u00E9 Alvarez',
        direction: 'out',
        punched_at: '2026-07-03T17:30:00.000Z',
        source_table: 'kern.employee_punches',
        source_record_id: 'punch-002'
      },
      {
        punch_id: 'punch-003',
        employee_id: 'emp-001',
        display_name: 'Jos\u00E9 Alvarez',
        direction: 'neutral',
        punched_at: '2026-07-03T18:00:00.000Z',
        source_table: 'kern.employee_punches',
        source_record_id: 'punch-003'
      }
    ],
    'presence.current': [
      {
        presence_status: 'inside',
        employee_id: 'emp-001',
        display_name: 'Jos\u00E9 Alvarez',
        direction: 'in',
        observed_at: '2026-07-03T08:00:00.000Z',
        row_count: 3,
        truncated: false,
        tables: ['kern.employees', 'kern.employee_punches']
      }
    ]
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  const punches = adapter.listPunches({
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    employee_id: 'emp-001',
    limit: 2,
    offset: 0
  });
  const current = adapter.currentPresence({
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    scope: {
      kind: 'organization',
      requester_principal_id: 'principal-001',
      organization_id: 'org-acme',
      employee_ids: [],
      reason: 'test scope'
    }
  });

  assert.equal(punches.records.length, 2);
  assert.equal(punches.truncated, true);
  assert.match(calls[0].statement, /LIMIT \$3 \+ 1/);
  assert.match(calls[0].statement, /OFFSET \$4/);
  assert.match(calls[1].statement, /WITH active_employees AS/);
  assert.match(calls[1].statement, /company_id = \$1/);
  assert.match(calls[1].statement, /last_directional_punch/);
  assert.equal(current.status, 'inside');
  assert.equal(current.citations[0]?.rowCount, 3);
});

test('presence adapter returns unknown for neutral-only punches and no_data for empty windows', () => {
  const { runner } = createRunner({
    'presence.current': [
      {
        presence_status: 'unknown',
        employee_id: 'emp-001',
        display_name: 'Jos\u00E9 Alvarez',
        direction: 'neutral',
        observed_at: '2026-07-03T18:00:00.000Z',
        row_count: 2,
        truncated: false,
        tables: ['kern.employees', 'kern.employee_punches']
      }
    ]
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    now: () => new Date('2026-07-03T18:30:00.000Z'),
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  const unknown = adapter.currentPresence({
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    scope: {
      kind: 'organization',
      requester_principal_id: 'principal-001',
      organization_id: 'org-acme',
      employee_ids: [],
      reason: 'neutral-only test'
    }
  });

  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.direction, 'neutral');
  assert.equal(unknown.citations[0]?.truncated, false);
  assert.equal(unknown.citations[0]?.rowCount, 2);

  const emptyRunner = createRunner({ 'presence.current': [] });
  const emptyAdapter = createPgReadAdapter({
    queryRunner: emptyRunner.runner,
    now: () => new Date('2026-07-03T18:30:00.000Z'),
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });
  const noData = emptyAdapter.currentPresence({
    organization_id: 'org-acme',
    correlation_id: 'corr-002',
    scope: {
      kind: 'organization',
      requester_principal_id: 'principal-001',
      organization_id: 'org-acme',
      employee_ids: [],
      reason: 'empty-window test'
    }
  });

  assert.equal(noData.status, 'no_data');
  assert.equal(noData.row_count, 0);
  assert.equal(noData.citations[0]?.rowCount, 0);
});

test('presence adapter uses a backward-moving window for night shifts', () => {
  const { runner, calls } = createRunner({
    'presence.current': [
      {
        presence_status: 'inside',
        employee_id: 'emp-001',
        display_name: 'Jos\u00E9 Alvarez',
        direction: 'in',
        observed_at: '2026-07-03T21:30:00.000Z',
        row_count: 1,
        truncated: false,
        tables: ['kern.employees', 'kern.employee_punches']
      }
    ]
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    now: () => new Date('2026-07-04T01:30:00.000Z'),
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  const result = adapter.currentPresence({
    organization_id: 'org-acme',
    correlation_id: 'corr-003',
    scope: {
      kind: 'organization',
      requester_principal_id: 'principal-001',
      organization_id: 'org-acme',
      employee_ids: [],
      reason: 'night-shift test'
    },
    current_window_hours: 6
  });

  assert.equal(result.status, 'inside');
  assert.equal(calls[0].values[4], '2026-07-03 21:30:00');
  assert.equal(calls[0].values[5], '2026-07-04 03:30:00');
  assert.match(calls[0].statement, /timezone\('Europe\/Madrid', p\.punched_at\)/);
  assert.match(calls[0].statement, /company_id = \$1/);
});


test('HR builders keep name filters from short-circuiting when employee_id is null', () => {
  const punchDayStatement = buildNumaHrPunchDayStatement({
    organization_id: 'org-acme',
    correlation_id: 'corr-punch',
    employee_id: null,
    employee_name: 'Ana García',
    date: '2026-07-02',
    limit: 25
  });
  assert.match(punchDayStatement.text, /\(\$1::text IS NULL AND \$3::text IS NULL\)/);
  assert.match(punchDayStatement.text, /OR unaccent\(lower\(concat_ws\(' ', p\.name, p\.surname\)\)\) LIKE unaccent\(lower\(\$3\)\)/);
  assert.deepEqual(punchDayStatement.values, [null, '2026-07-02', '%Ana García%', 25]);

  const leaveDaysStatement = buildNumaHrLeaveDaysStatement({
    organization_id: 'org-acme',
    correlation_id: 'corr-leave-days',
    employee_id: null,
    employee_name: 'Ana García',
    year: 2026,
    time_type_ids: [34],
    include_pending: false
  });
  assert.match(leaveDaysStatement.text, /\(\$5::text IS NULL AND \$6::text IS NULL\)/);
  assert.match(leaveDaysStatement.text, /OR unaccent\(lower\(concat_ws\(' ', p\.name, p\.surname\)\)\) LIKE unaccent\(lower\(\$6\)\)/);
  assert.deepEqual(leaveDaysStatement.values, ['org-acme', '2026-01-01', '2027-01-01', [34], null, '%Ana García%']);

  const leaveBalanceStatement = buildNumaHrLeaveBalanceStatement({
    organization_id: 'org-acme',
    correlation_id: 'corr-leave-balance',
    employee_id: '185',
    employee_name: null,
    year: 2026,
    time_type_ids: [5],
    annual_quota_by_time_type: { 5: 22 },
    include_pending: false
  });
  assert.match(leaveBalanceStatement.text, /\(\$5::text IS NULL AND \$6::text IS NULL\)/);
  assert.match(leaveBalanceStatement.text, /OR e\.person_id::text = \$5/);
  assert.deepEqual(leaveBalanceStatement.values, ['org-acme', '2026-01-01', '2027-01-01', [5], '185', null]);

  const worktimeStatement = buildNumaHrWorktimeSummaryStatement({
    organization_id: 'org-acme',
    correlation_id: 'corr-worktime',
    employee_id: null,
    employee_name: 'Ana García',
    date_from: '2026-07-01',
    date_to: '2026-07-31',
    theoretical_workday_minutes: 480
  });
  assert.match(worktimeStatement.text, /\(\$4::text IS NULL AND \$5::text IS NULL\)/);
  assert.match(worktimeStatement.text, /OR unaccent\(lower\(concat_ws\(' ', p\.name, p\.surname\)\)\) LIKE unaccent\(lower\(\$5\)\)/);
  assert.deepEqual(worktimeStatement.values, ['org-acme', '2026-07-01', '2026-07-31', null, '%Ana García%']);

  const punchDayUnfiltered = buildNumaHrPunchDayStatement({
    organization_id: 'org-acme',
    correlation_id: 'corr-punch-unfiltered',
    employee_id: null,
    employee_name: null,
    date: '2026-07-02',
    limit: 25
  });
  assert.deepEqual(punchDayUnfiltered.values, [null, '2026-07-02', null, 25]);
});

test('HR adapter forwards variable employee and group names without tying behavior to a single fixture', () => {
  const { runner, calls } = createRunner({
    'punch.day': [
      {
        punch_id: 'punch-001',
        employee_id: 'emp-002',
        employee_name: 'Ana García',
        punched_at: '2026-07-02T08:00:00.000Z',
        punching_point_id: 1,
        point_name: 'ENTRADA',
        direction: 'in'
      }
    ],
    'leave.days': [
      {
        time_type_id: 34,
        time_type_name: 'Asuntos propios',
        days_disfrutados: 1,
        days_pendientes: 0
      }
    ],
    'leave.balance': [
      {
        time_type_id: 5,
        time_type_name: 'Vacaciones',
        days_disfrutados: 4,
        days_pendientes: 1
      }
    ],
    'worktime.summary': [
      {
        work_date: '2026-07-02',
        punches: [],
        first_entry_at: '2026-07-02T08:00:00.000Z',
        last_exit_at: '2026-07-02T16:00:00.000Z',
        punch_count: 2,
        worked_minutes: 480,
        theoretical_minutes: 480,
        overtime_minutes: 0
      }
    ],
    'report.month-by-group': [
      {
        employee_id: 'emp-002',
        employee_name: 'Ana García',
        active: true,
        days_with_punch: 2,
        punches: [],
        leave_days: 1,
        vacation_days: 1,
        worked_minutes: 480
      }
    ]
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  const punchDay = adapter.punchDay({
    organization_id: 'org-acme',
    correlation_id: 'corr-punch-day-ana',
    employee_name: 'ANA GARCÍA',
    date: '2026-07-02'
  });
  const leaveDays = adapter.leaveDays({
    organization_id: 'org-acme',
    correlation_id: 'corr-leave-days-ana',
    employee_name: 'Ana García',
    year: 2026,
    time_type_ids: [34],
    include_pending: false
  });
  const leaveBalance = adapter.leaveBalance({
    organization_id: 'org-acme',
    correlation_id: 'corr-leave-balance-juan',
    employee_name: 'Juan Magán',
    year: 2026,
    time_type_ids: [5],
    annual_quota_by_time_type: { 5: 22 },
    include_pending: false
  });
  const worktime = adapter.worktimeSummary({
    organization_id: 'org-acme',
    correlation_id: 'corr-worktime-ana',
    employee_name: 'Ana García',
    date_from: '2026-07-01',
    date_to: '2026-07-31',
    theoretical_workday_minutes: 480
  });
  const report = adapter.reportMonthByGroup({
    organization_id: 'org-acme',
    correlation_id: 'corr-report-martos',
    group_name: 'Martos',
    year: 2026,
    month: 7,
    limit: 10,
    offset: 0
  });

  const punchDayEmployeeName = punchDay.employee_name;
  assert.ok(punchDayEmployeeName);
  assert.equal(punchDayEmployeeName.toLowerCase(), 'ana garcía');
  assert.equal(leaveDays.employee_name, 'Ana García');
  assert.equal(leaveBalance.employee_name, 'Juan Magán');
  assert.equal(worktime.employee_name, 'Ana García');
  assert.equal(report.group_name, 'Martos');
  assert.match(calls[1].statement, /company_id = \$1/);
  assert.match(calls[2].statement, /company_id = \$1/);
  assert.doesNotMatch(calls[1].statement, /\be\.(?:active|organization_id)\b/);
  assert.doesNotMatch(calls[2].statement, /\be\.(?:active|organization_id)\b/);
  assert.match(calls[4].statement, /TRUE AS active/);
  assert.doesNotMatch(calls[4].statement, /\be\.(?:active|organization_id)\b/);
  assert.match(calls[0].statement, /cp\.person_id::text = \$3/);
  assert.match(calls[0].statement, /e\.code::text = \$3/);
  assert.match(calls[0].statement, /LIKE unaccent\(lower\(\$4\)\)/);
  assert.match(calls[0].statement, /company_id = \$1/);
  assert.equal(calls[0].values[2], null);
  assert.equal(String(calls[0].values[3]).toLowerCase(), '%ana garcía%');
  assert.equal(calls[0].values[4], 25);
  assert.equal(calls[1].values[0], 'company-acme');
  assert.equal(calls[1].values[5], '%Ana García%');
  assert.equal(calls[2].values[0], 'company-acme');
  assert.equal(calls[2].values[5], '%Juan Magán%');
  assert.equal(calls[4].values[0], 'company-acme');
  assert.equal(calls[4].values[2], '%Martos%');
});

test('punch.day binds employee_id exactly when provided', () => {
  const { runner, calls } = createRunner({
    'punch.day': [
      {
        punch_id: 'punch-002',
        employee_id: 'emp-002',
        employee_name: 'Ana García',
        punched_at: '2026-07-02T08:00:00.000Z',
        punching_point_id: 1,
        point_name: 'ENTRADA',
        direction: 'in'
      }
    ]
  });
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    company_id_by_organization_id,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'numa-postgres-test',
      role: NUMA_POSTGRES_ROLE
    }
  });

  const result = adapter.punchDay({
    organization_id: 'org-acme',
    correlation_id: 'corr-punch-day-id',
    employee_id: 'emp-002',
    date: '2026-07-02'
  });

  assert.equal(result.employee_id, 'emp-002');
  assert.match(calls[0].statement, /cp\.id AS punch_id/);
  assert.doesNotMatch(calls[0].statement, /cp\.punch_id/);
  assert.match(calls[0].statement, /cp\.person_id::text = \$3/);
  assert.match(calls[0].statement, /e\.code::text = \$3/);
  assert.equal(calls[0].values[2], 'emp-002');
  assert.equal(calls[0].values[3], null);
  assert.equal(calls[0].values[4], 25);
});
