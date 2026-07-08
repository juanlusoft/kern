import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PG_SYNC_QUERY_RUNNER_SCRIPT,
  PgSyncQueryRunner,
  createPgConnectionConfigFromEnv
} from '../src/index';
function createConnection() {
  return {
    host: 'postgres.example.test',
    port: 5432,
    database: 'kern',
    user: 'kern_ro',
    password: null,
    sslmode: 'disable' as const,
    application_name: 'numa-postgres-test',
    role: 'kern_ro'
  };
}

test('PgSyncQueryRunner sends the closed statement and values through spawnSync', () => {
  const calls: Array<{
    command: string;
    args: string[];
    input: string;
  }> = [];
  const runner = new PgSyncQueryRunner({
    connection: createConnection(),
    spawnSyncImpl(command, args, options) {
      calls.push({
        command,
        args: [...(args ?? [])],
        input: String(options?.input ?? '')
      });
      return {
        pid: 123,
        output: [null, JSON.stringify({ rows: [{ employee_id: 'emp-001' }] }), ''],
        stdout: JSON.stringify({ rows: [{ employee_id: 'emp-001' }] }),
        stderr: '',
        status: 0,
        signal: null
      } as never;
    }
  });

  const rows = runner.query({
    query_id: 'employee.find',
    statement: {
      text: 'SELECT employee_id FROM kern.employees WHERE employee_id = $1',
      values: ['emp-001']
    },
    connection: createConnection(),
    transaction: {
      readonly: true,
      isolation_level: 'read committed',
      statement_timeout_ms: 1500,
      role: 'kern_ro',
      application_name: 'numa-postgres-test'
    }
  });

  assert.deepEqual(rows, [{ employee_id: 'emp-001' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.equal(calls[0].args[0], '--input-type=module');
  assert.equal(calls[0].args[1], '--eval');
  assert.equal(calls[0].args[2].includes('BEGIN READ ONLY'), true);
  assert.equal(calls[0].args[2].includes('SET LOCAL statement_timeout'), true);
  assert.equal(calls[0].args[2].includes('COMMIT'), true);
  assert.equal(calls[0].args[2].includes('ROLLBACK'), true);
  assert.equal(calls[0].args[2].includes("import { Client } from 'pg'"), true);

  const payload = JSON.parse(calls[0].input) as {
    query_id: string;
    statement: { text: string; values: unknown[] };
    transaction: { statement_timeout_ms: number };
  };
  assert.equal(payload.query_id, 'employee.find');
  assert.equal(payload.statement.text, 'SELECT employee_id FROM kern.employees WHERE employee_id = $1');
  assert.deepEqual(payload.statement.values, ['emp-001']);
  assert.equal(payload.transaction.statement_timeout_ms, 1500);
});

test('PgSyncQueryRunner surfaces child errors clearly', () => {
  const runner = new PgSyncQueryRunner({
    connection: createConnection(),
    spawnSyncImpl() {
      return {
        pid: 123,
        output: [null, '', 'pg unavailable'],
        stdout: '',
        stderr: 'pg unavailable',
        status: 1,
        signal: null
      } as never;
    }
  });

  assert.throws(
    () =>
      runner.query({
        query_id: 'employee.find',
        statement: {
          text: 'SELECT 1',
          values: []
        },
        connection: createConnection(),
        transaction: {
          readonly: true,
          isolation_level: 'read committed',
          statement_timeout_ms: 1500,
          role: 'kern_ro',
          application_name: 'numa-postgres-test'
        }
      }),
    /pg unavailable/
  );
  assert.equal(PG_SYNC_QUERY_RUNNER_SCRIPT.includes('BEGIN READ ONLY'), true);
});

test('createPgConnectionConfigFromEnv fails closed on incomplete env and reads the timeout', () => {
  assert.throws(
    () =>
      createPgConnectionConfigFromEnv({
        NUMA_PGPORT: '5432',
        NUMA_PGDATABASE: 'kern',
        NUMA_PGUSER: 'kern_ro',
        NUMA_PGSSLMODE: 'disable'
      }),
    /NUMA_PGHOST/
  );

  const config = createPgConnectionConfigFromEnv({
    NUMA_PGHOST: 'postgres.example.test',
    NUMA_PGPORT: '5432',
    NUMA_PGDATABASE: 'kern',
    NUMA_PGUSER: 'kern_ro',
    NUMA_PGPASSWORD: 'secret',
    NUMA_PGSSLMODE: 'disable',
    NUMA_PGAPPNAME: 'numa-postgres-test',
    NUMA_PGSTATEMENT_TIMEOUT_MS: '2750'
  });

  assert.equal(config.host, 'postgres.example.test');
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'kern');
  assert.equal(config.user, 'kern_ro');
  assert.equal(config.password, 'secret');
  assert.equal(config.sslmode, 'disable');
  assert.equal(config.application_name, 'numa-postgres-test');
  assert.equal(config.role, 'kern_ro');
  assert.equal(config.statement_timeout_ms, 2750);
});



