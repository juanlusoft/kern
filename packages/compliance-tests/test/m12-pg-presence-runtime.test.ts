import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPgReadAdapter, type PgPresenceQueryRunner } from '../../adapters/numa-postgres/src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';

function createPresenceQueryRunner() {
  const calls: Array<{ query_id: string; statement: string }> = [];
  const runner = {
    query(input: Parameters<PgPresenceQueryRunner['query']>[0]) {
      calls.push({ query_id: input.query_id, statement: input.statement.text });
      switch (input.query_id) {
        case 'employee.find':
          return [
            {
              employee_id: 'emp-001',
              principal_id: 'principal-001',
              display_name: 'Jos\u00E9 Alvarez',
              email: 'jose@example.test',
              active: true
            }
          ];
        case 'punches.list':
          return [
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
            }
          ];
        case 'presence.current':
          return [
            {
              presence_status: 'inside',
              employee_id: 'emp-001',
              display_name: 'Jos\u00E9 Alvarez',
              direction: 'in',
              observed_at: '2026-07-03T08:00:00.000Z',
              row_count: 2,
              truncated: false,
              tables: ['kern.employees', 'kern.employee_punches']
            }
          ];
        default:
          return [];
      }
    }
  } as PgPresenceQueryRunner;

  return { runner, calls };
}

function createRuntime() {
  const { runner, calls } = createPresenceQueryRunner();
  const adapter = createPgReadAdapter({
    queryRunner: runner,
    connection: {
      host: 'postgres.example.test',
      port: 5432,
      database: 'kern',
      user: 'kern_ro',
      password: null,
      sslmode: 'disable',
      application_name: 'm12-test',
      role: 'kern_ro'
    }
  });
  const runtime = new InMemoryGovernedWorkflowRuntime({ presenceReadPort: adapter });
  return { runtime, calls };
}

function invokePresenceCapability(runtime: InMemoryGovernedWorkflowRuntime, capability_id: string, payload: Record<string, unknown>) {
  return runtime.getCapabilityRuntime().invokeCapability({
    capability_id,
    organization_id: 'org-acme',
    principal_id: 'principal-001',
    correlation_id: 'corr-001',
    input: {
      purpose: `test ${capability_id}`,
      payload,
      requested_scope: []
    }
  });
}

test('runtime registers PostgreSQL presence capabilities and executes them read-only', () => {
  const { runtime, calls } = createRuntime();
  const capabilityIds = runtime.getCapabilityRuntime().listCapabilities().map((capability) => capability.capability_id);

  assert.ok(capabilityIds.includes('employee.find'));
  assert.ok(capabilityIds.includes('punches.list'));
  assert.ok(capabilityIds.includes('presence.current'));

  const employeeResult = invokePresenceCapability(runtime, 'employee.find', {
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    term: 'jose',
    limit: 5
  });
  const punchesResult = invokePresenceCapability(runtime, 'punches.list', {
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    employee_id: 'emp-001',
    limit: 5,
    offset: 0
  });
  const currentResult = invokePresenceCapability(runtime, 'presence.current', {
    organization_id: 'org-acme',
    correlation_id: 'corr-001',
    scope: {
      kind: 'organization',
      requester_principal_id: 'principal-001',
      organization_id: 'org-acme',
      employee_ids: [],
      reason: 'runtime smoke test'
    }
  });

  assert.equal(employeeResult.status, 'executed');
  assert.equal((employeeResult.output?.result as { records?: Array<{ display_name: string }> }).records?.[0]?.display_name, 'Jos\u00E9 Alvarez');
  assert.equal((punchesResult.output?.result as { records?: Array<{ punch_id: string }> }).records?.length, 2);
  assert.equal((currentResult.output?.result as { status?: string }).status, 'inside');
  assert.deepEqual(
    calls.map((call) => call.query_id),
    ['employee.find', 'punches.list', 'presence.current']
  );
});

test('core source stays free of PostgreSQL adapter details', () => {
  const coreSource = readFileSync(new URL('../../core/src/index.ts', import.meta.url), 'utf8');
  assert.equal(coreSource.includes('pg'), false);
  assert.equal(coreSource.includes('numa-postgres'), false);
});
