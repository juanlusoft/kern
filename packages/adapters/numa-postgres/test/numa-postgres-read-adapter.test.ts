import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMA_POSTGRES_ROLE,
  createPgReadAdapter,
  getPgPresenceQueryCatalog,
  type PgPresenceQueryRunner
} from '../src/index';

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
    term: 'jos\u00E9',
    limit: 5
  });

  assert.equal(result.records[0]?.display_name, 'Jos\u00E9 Alvarez');
  assert.match(calls[0].statement, /unaccent\(lower/);
  assert.match(calls[0].statement, /LIMIT \$3 \+ 1/);
  assert.equal(calls[0].transactionRole, NUMA_POSTGRES_ROLE);
  assert.deepEqual(getPgPresenceQueryCatalog().map((entry) => entry.query_id), ['employee.find', 'punches.list', 'presence.current', 'punch.day', 'leave.days', 'leave.balance', 'worktime.summary', 'report.month-by-group']);
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
});
