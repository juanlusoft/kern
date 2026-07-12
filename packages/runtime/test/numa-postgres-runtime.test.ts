import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryTelegramTransport } from '../../channels/telegram/src/index';
import type { HoldedFetch } from '../../adapters/holded/src/index';
import type { PgPresenceQueryRunner } from '../../adapters/numa-postgres/src/index';
import type { QwenChatCompletionsTransport } from '../../orchestrators/qwen/src/index';
import { startInstallationRuntime, type RuntimeInstallationConfig, type RuntimeModuleKey } from '../../runtime/src/index';

function buildEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    HOLDED_API_KEY: 'holded-secret',
    KERN_TELEGRAM_BOT_TOKEN: 'telegram-secret',
    KERN_MODEL_BASE_URL: 'https://model.example.test',
    KERN_MODEL_NAME: 'kern-qwen',
    KERN_MODEL_API_KEY: 'model-secret',
    NUMA_PGHOST: 'postgres.example.test',
    NUMA_PGPORT: '5432',
    NUMA_PGDATABASE: 'kern',
    NUMA_PGUSER: 'kern_ro',
    NUMA_PGSSLMODE: 'disable',
    NUMA_PGSTATEMENT_TIMEOUT_MS: '2500',
    NUMA_PGAPPNAME: 'numa-runtime-test',
    ...overrides
  };
}

function buildInstallationConfig(activeModules: RuntimeModuleKey[]): RuntimeInstallationConfig {
  return {
    installation_id: 'install-numa-postgres-runtime-test',
    organization: {
      organization_id: 'org-numa-runtime-test',
      name: 'Numa Runtime Test',
      active: true,
      isolation_boundary: 'Numa runtime only'
    },
    principals: [
      {
        principal_id: 'principal-001',
        name: 'Principal One',
        principal_type: 'human',
        active: true,
        scopes: ['request:governed']
      }
    ],
    identity_mappings: [
      {
        channel: 'telegram',
        telegram_user_id: '1000',
        telegram_chat_id: '1000',
        organization_id: 'org-numa-runtime-test',
        principal_id: 'principal-001',
        installation_id: 'install-numa-postgres-runtime-test',
        principal_type: 'human',
        active: true,
        display_name: 'Principal One'
      }
    ],
    active_modules: activeModules,
    active_capabilities: ['mock.resource.read'],
    secret_refs: {
      HOLDED_API_KEY: 'HOLDED_API_KEY',
      KERN_TELEGRAM_BOT_TOKEN: 'KERN_TELEGRAM_BOT_TOKEN',
      KERN_MODEL_BASE_URL: 'KERN_MODEL_BASE_URL',
      KERN_MODEL_NAME: 'KERN_MODEL_NAME',
      KERN_MODEL_API_KEY: 'KERN_MODEL_API_KEY'
    },
    runtime_options: {
      telegram_mode: 'long_polling',
      telegram_poll_timeout_ms: 30_000,
      telegram_poll_limit: 100,
      qwen_temperature: 0.1,
      qwen_request_timeout_ms: 30_000,
      holded_base_url: null,
      conversation_memory_file_path: null,
      evidence_ledger_file_path: null,
      polling_iterations: 1,
      numa_hr: {
        time_type_by_label: {
          vacaciones: [5],
          'asuntos propios': [34]
        },
        annual_quota_by_time_type: {
          5: 22,
          34: 6
        },
        company_id_by_organization_id: {
          'org-numa-runtime-test': 'company-numa-runtime-test'
        }
      }
    }
  };
}

function buildQwenTransport(): QwenChatCompletionsTransport {
  return {
    chatCompletions() {
      return {
        id: 'chatcmpl-numa',
        model: 'kern-qwen',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: []
            }
          }
        ]
      };
    }
  };
}

function buildHoldedFetch(): HoldedFetch {
  return () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => '[]',
    json: () => [],
    headers: { get: () => null }
  });
}

function buildNumaRunner(calls: Array<{ query_id: string; statement: string; values: readonly unknown[] }>): PgPresenceQueryRunner {
  return {
    query(input) {
      calls.push({ query_id: input.query_id, statement: input.statement.text, values: input.statement.values });
      switch (input.query_id) {
        case 'employee.find':
          return [
            {
              employee_id: 'emp-001',
              principal_id: 'principal-001',
              display_name: 'Jose Alvarez',
              email: 'jose@example.test',
              active: true
            }
          ] as never[];
        case 'punches.list':
          return [
            {
              punch_id: 'punch-001',
              employee_id: 'emp-001',
              display_name: 'Jose Alvarez',
              direction: 'in',
              punched_at: '2026-07-03T08:00:00.000Z',
              source_table: 'kern.employee_punches',
              source_record_id: 'punch-001'
            }
          ] as never[];
        case 'presence.current':
          return [
            {
              presence_status: 'inside',
              employee_id: 'emp-001',
              display_name: 'Jose Alvarez',
              direction: 'in',
              observed_at: '2026-07-03T08:00:00.000Z',
              row_count: 1,
              truncated: false,
              tables: ['kern.employees', 'kern.employee_punches']
            }
          ] as never[];
        case 'punch.day':
          return [
            {
              punch_id: 'punch-001',
              employee_id: 'emp-001',
              employee_name: 'Jose Alvarez',
              punched_at: '2026-07-03T08:00:00.000Z',
              punching_point_id: 1,
              point_name: 'ENTRADA',
              direction: 'in'
            },
            {
              punch_id: 'punch-002',
              employee_id: 'emp-001',
              employee_name: 'Jose Alvarez',
              punched_at: '2026-07-03T17:00:00.000Z',
              punching_point_id: 2,
              point_name: 'SALIDA',
              direction: 'out'
            }
          ] as never[];
        case 'leave.days':
        case 'leave.balance':
          return [
            {
              time_type_id: 5,
              time_type_name: 'Vacaciones',
              days_disfrutados: 2,
              days_pendientes: 1
            }
          ] as never[];
        case 'worktime.summary':
          return [
            {
              work_date: '2026-07-03',
              punches: [
                { punched_at: '2026-07-03T08:00:00.000Z', direction: 'in' },
                { punched_at: '2026-07-03T17:00:00.000Z', direction: 'out' }
              ],
              first_entry_at: '2026-07-03T08:00:00.000Z',
              last_exit_at: '2026-07-03T17:00:00.000Z',
              punch_count: 2,
              worked_minutes: 540,
              theoretical_minutes: 480,
              overtime_minutes: 60
            }
          ] as never[];
        case 'report.month-by-group':
          return [
            {
              employee_id: 'emp-001',
              employee_name: 'Jose Alvarez',
              active: true,
              days_with_punch: 2,
              punches: [],
              leave_days: 1,
              vacation_days: 1,
              worked_minutes: 540
            }
          ] as never[];
        default:
          return [];
      }
    }
  };
}

function invoke(runtime: ReturnType<typeof startInstallationRuntime>['runtime'], capability_id: string, payload: Record<string, unknown>) {
  if (!runtime) {
    throw new Error('runtime missing');
  }
  return runtime.workflowRuntime.getCapabilityRuntime().invokeCapability({
    capability_id,
    organization_id: 'org-numa-runtime-test',
    principal_id: 'principal-001',
    correlation_id: `corr-${capability_id}`,
    input: {
      purpose: `test ${capability_id}`,
      payload,
      requested_scope: []
    }
  });
}

test('runtime slice builds the Numa PostgreSQL read runner when the module is active', () => {
  const calls: Array<{ query_id: string; statement: string; values: readonly unknown[] }> = [];
  const telegramTransport = new InMemoryTelegramTransport();
  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read', 'numa-postgres-read']),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch(),
    numaPostgresQueryRunner: buildNumaRunner(calls)
  });

  assert.equal(runtimeResult.status, 'started');
  assert.ok(runtimeResult.runtime);
  assert.equal(runtimeResult.moduleRegistry.listActive().some((module) => module.module_key === 'numa-postgres-read'), true);

  const presenceResult = invoke(runtimeResult.runtime, 'presence.current', {
    organization_id: 'org-numa-runtime-test',
    correlation_id: 'corr-presence.current',
    scope: {
      kind: 'organization',
      requester_principal_id: 'principal-001',
      organization_id: 'org-numa-runtime-test',
      employee_ids: [],
      reason: 'runtime module smoke test'
    }
  });
  const punchDayResult = invoke(runtimeResult.runtime, 'punch.day', {
    organization_id: 'org-numa-runtime-test',
    correlation_id: 'corr-punch.day',
    employee_id: 'emp-001',
    date: '2026-07-03'
  });

  assert.equal(presenceResult.status, 'executed');
  assert.equal((presenceResult.output?.result as { status?: string }).status, 'inside');
  assert.equal(punchDayResult.status, 'executed');
  assert.equal((punchDayResult.output?.result as { records?: unknown[] }).records?.length, 2);
  assert.equal(calls.some((call) => call.query_id === 'presence.current'), true);
  assert.equal(calls.some((call) => call.query_id === 'punch.day'), true);
  assert.equal(calls.some((call) => call.statement.includes('BEGIN READ ONLY')), false);
});

test('runtime starts the Numa and OpenWebUI installation without Telegram or Holded secrets', async () => {
  const rawConfig = {
    ...buildInstallationConfig(['qwen-orchestrator', 'numa-postgres-read', 'openwebui-channel']),
    secret_refs: {
      KERN_MODEL_BASE_URL: 'KERN_MODEL_BASE_URL',
      KERN_MODEL_NAME: 'KERN_MODEL_NAME',
      KERN_MODEL_API_KEY: 'KERN_MODEL_API_KEY'
    },
    runtime_options: {
      ...buildInstallationConfig(['qwen-orchestrator', 'numa-postgres-read', 'openwebui-channel']).runtime_options,
      openwebui_channel: {
        host: '127.0.0.1',
        port: 0,
        request_body_limit_bytes: 10_000,
        network_boundary: 'loopback',
        allowed_remote_addresses: [],
        identity: {
          source: 'body_user',
          header: null
        },
        users: {
          'openwebui-user-1': {
            principal_id: 'principal-001',
            organization_id: 'org-numa-runtime-test',
            active: true,
            display_name: 'Principal One'
          }
        }
      }
    }
  } satisfies RuntimeInstallationConfig;
  const runtimeResult = startInstallationRuntime({
    rawConfig,
    env: buildEnv({ HOLDED_API_KEY: undefined, KERN_TELEGRAM_BOT_TOKEN: undefined }),
    qwenTransport: buildQwenTransport(),
    numaPostgresQueryRunner: buildNumaRunner([])
  });

  assert.equal(runtimeResult.status, 'started');
  assert.ok(runtimeResult.runtime?.openwebuiServer);
  await runtimeResult.runtime!.openwebuiServer!.ready;
  await runtimeResult.runtime!.openwebuiServer!.close();
});

test('runtime slice fails closed when the Numa company mapping is missing', () => {
  const rawConfig = buildInstallationConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read', 'numa-postgres-read']);
  if (rawConfig.runtime_options.numa_hr) {
    rawConfig.runtime_options.numa_hr.company_id_by_organization_id = {};
  }
  const runtimeResult = startInstallationRuntime({
    rawConfig,
    env: buildEnv(),
    telegramTransport: new InMemoryTelegramTransport(),
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch(),
    numaPostgresQueryRunner: buildNumaRunner([])
  });

  assert.equal(runtimeResult.status, 'blocked');
  assert.equal(runtimeResult.reason?.includes('company_id_by_organization_id'), true);
  assert.equal(runtimeResult.runtime, null);
});
test('runtime slice fails closed when the Numa PostgreSQL env is incomplete', () => {
  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read', 'numa-postgres-read']),
    env: buildEnv({ NUMA_PGHOST: undefined }),
    telegramTransport: new InMemoryTelegramTransport(),
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch(),
    numaPostgresQueryRunner: buildNumaRunner([])
  });

  assert.equal(runtimeResult.status, 'blocked');
  assert.equal(runtimeResult.reason?.includes('NUMA_PGHOST'), true);
  assert.equal(runtimeResult.runtime, null);
});

test('runtime slice does not require Numa PostgreSQL env when the module is inactive', () => {
  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read']),
    env: buildEnv({ NUMA_PGHOST: undefined, NUMA_PGPORT: undefined, NUMA_PGDATABASE: undefined, NUMA_PGUSER: undefined, NUMA_PGSSLMODE: undefined }),
    telegramTransport: new InMemoryTelegramTransport(),
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch()
  });

  assert.equal(runtimeResult.status, 'started');
  assert.equal(runtimeResult.moduleRegistry.listActive().some((module) => module.module_key === 'numa-postgres-read'), false);
});
