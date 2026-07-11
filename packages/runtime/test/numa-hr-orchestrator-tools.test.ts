import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryTelegramTransport } from '../../channels/telegram/src/index';
import type {
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
  PresenceSourceCitation
} from '../../contracts/src/index';
import type { QwenChatCompletionsTransport } from '../../orchestrators/qwen/src/index';
import { startInstallationRuntime, type RuntimeInstallationConfig } from '../src/index';

const HR_TOOL_NAMES = ['punch.day', 'leave.days', 'leave.balance', 'leave.detail', 'worktime.summary', 'report.month-by-group'] as const;

type HrToolName = (typeof HR_TOOL_NAMES)[number];

type QwenRequest = {
  tools?: Array<{
    function?: {
      name?: string;
      parameters?: {
        required?: string[];
        properties?: Record<string, unknown>;
        additionalProperties?: boolean;
      };
    };
  }>;
  tool_choice?: unknown;
  messages?: Array<{
    role?: string;
    content?: string | null;
  }>;
};

type HrCall =
  | { method: 'punchDay'; input: NumaHrPunchDayParams }
  | { method: 'leaveDays'; input: NumaHrLeaveDaysParams }
  | { method: 'leaveBalance'; input: NumaHrLeaveBalanceParams }
  | { method: 'leaveDetail'; input: NumaHrLeaveDetailParams }
  | { method: 'worktimeSummary'; input: NumaHrWorktimeSummaryParams }
  | { method: 'reportMonthByGroup'; input: NumaHrReportMonthByGroupParams };

function buildEnv(): NodeJS.ProcessEnv {
  return {
    HOLDED_API_KEY: 'holded-secret',
    KERN_TELEGRAM_BOT_TOKEN: 'telegram-secret',
    KERN_MODEL_BASE_URL: 'https://model.example.test',
    KERN_MODEL_NAME: 'kern-qwen',
    KERN_MODEL_API_KEY: 'model-secret'
  };
}

function buildInstallationConfig(memoryFilePath: string, evidenceFilePath: string): RuntimeInstallationConfig {
  return {
    installation_id: 'install-numa-hr-tools-test',
    organization: {
      organization_id: 'org-numa-hr-tools-test',
      name: 'Numa HR Tools Test',
      active: true,
      isolation_boundary: 'Numa HR tools only'
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
        telegram_user_id: '146574793',
        telegram_chat_id: '146574793',
        organization_id: 'org-numa-hr-tools-test',
        principal_id: 'principal-001',
        installation_id: 'install-numa-hr-tools-test',
        principal_type: 'human',
        active: true,
        display_name: 'Principal One'
      }
    ],
    active_modules: ['telegram-channel', 'qwen-orchestrator', 'holded-read'],
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
      conversation_memory_file_path: memoryFilePath,
      evidence_ledger_file_path: evidenceFilePath,
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
          'org-numa-hr-tools-test': 'company-numa-hr-tools-test'
        }
      }
    }
  } satisfies RuntimeInstallationConfig;
}

function buildTelegramUpdate(messageId: number, text: string) {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      chat: {
        id: 146574793,
        type: 'private' as const
      },
      from: {
        id: 146574793,
        username: 'gema-granapublic',
        first_name: 'Gema',
        last_name: 'Granapublic'
      },
      text,
      date: 1_751_472_000,
      raw: null
    },
    raw: null
  };
}

function buildQwenTransport(
  capabilityKey: HrToolName,
  args: Record<string, unknown>,
  requests: QwenRequest[]
): QwenChatCompletionsTransport {
  return {
    chatCompletions(request) {
      requests.push(request as QwenRequest);
      return {
        id: 'chatcmpl-numa-hr',
        model: 'kern-qwen',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'tool-call-1',
                  type: 'function',
                  function: {
                    name: capabilityKey,
                    arguments: JSON.stringify(args)
                  }
                }
              ]
            }
          }
        ]
      };
    }
  };
}

function citation(queryId: string, rowCount = 1, truncated = false): PresenceSourceCitation {
  return {
    tables: ['core_punches'],
    queryId,
    rowCount,
    truncated
  };
}

function buildHrReadPort(calls: HrCall[]): NumaHrReadPort {
  return {
    punchDay(input) {
      calls.push({ method: 'punchDay', input });
      const result: NumaHrPunchDayResult = {
        query_id: 'punch.day',
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        row_count: 1,
        truncated: false,
        citations: [citation('punch.day')],
        employee_id: 'emp-001',
        employee_name: input.employee_name ?? 'Eugenio Moya',
        date: input.date,
        records: [
          {
            punched_at: '2026-07-01T08:00:00.000Z',
            punching_point_id: 1,
            point_name: 'ENTRADA',
            direction: 'in'
          }
        ],
        first_entry_at: '2026-07-01T08:00:00.000Z',
        last_exit_at: '2026-07-01T16:19:00.000Z',
        worked_minutes: 499
      };
      return result;
    },
    leaveDays(input) {
      calls.push({ method: 'leaveDays', input });
      const result: NumaHrLeaveDaysResult = {
        query_id: 'leave.days',
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        row_count: 1,
        truncated: false,
        citations: [citation('leave.days')],
        employee_id: 'emp-001',
        employee_name: input.employee_name ?? 'Eugenio Moya',
        year: input.year,
        time_type_ids: [...input.time_type_ids],
        include_pending: Boolean(input.include_pending),
        records: [
          {
            time_type_id: input.time_type_ids[0] ?? 5,
            time_type_name: (input.time_type_ids[0] ?? 5) === 5 ? '_(HOLIDAY)' : 'Asuntos propios',
            days_disfrutados: 2,
            days_pendientes: 1
          }
        ]
      };
      return result;
    },
    leaveBalance(input) {
      calls.push({ method: 'leaveBalance', input });
      const result: NumaHrLeaveBalanceResult = {
        query_id: 'leave.balance',
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        row_count: 1,
        truncated: false,
        citations: [citation('leave.balance')],
        employee_id: 'emp-001',
        employee_name: input.employee_name ?? 'Eugenio Moya',
        year: input.year,
        time_type_ids: [...input.time_type_ids],
        include_pending: Boolean(input.include_pending),
        records: [
          {
            time_type_id: input.time_type_ids[0] ?? 5,
            time_type_name: (input.time_type_ids[0] ?? 5) === 5 ? '_(HOLIDAY)' : 'Asuntos propios',
            annual_quota: input.annual_quota_by_time_type[input.time_type_ids[0] ?? 5] ?? 22,
            days_disfrutados: 4,
            days_pendientes: 1,
            balance: 17,
            message: 'Saldo disponible'
          }
        ]
      };
      return result;
    },
    leaveDetail(input) {
      calls.push({ method: 'leaveDetail', input });
      const result: NumaHrLeaveDetailResult = {
        query_id: 'leave.detail',
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        row_count: 1,
        truncated: false,
        citations: [citation('leave.detail')],
        employee_id: 'emp-001',
        employee_name: input.employee_name ?? 'Eugenio Moya',
        date_from: input.date_from,
        date_to: input.date_to,
        time_type_ids: [...input.time_type_ids],
        include_pending: Boolean(input.include_pending),
        limit: input.limit,
        records: [
          {
            request_id: 'request-001',
            time_type_id: input.time_type_ids[0] ?? 5,
            time_type_name: (input.time_type_ids[0] ?? 5) === 5 ? '_(HOLIDAY)' : 'Asuntos propios',
            start_date: '2026-08-01',
            end_date: '2026-08-05',
            day_count: 5,
            status: 'accepted'
          }
        ]
      };
      return result;
    },
    worktimeSummary(input) {
      calls.push({ method: 'worktimeSummary', input });
      const result: NumaHrWorktimeSummaryResult = {
        query_id: 'worktime.summary',
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        row_count: 1,
        truncated: false,
        citations: [citation('worktime.summary')],
        employee_id: 'emp-001',
        employee_name: input.employee_name ?? 'Eugenio Moya',
        date_from: input.date_from,
        date_to: input.date_to,
        theoretical_workday_minutes: input.theoretical_workday_minutes ?? 480,
        records: [
          {
            work_date: '2026-07-01',
            first_entry_at: '2026-07-01T08:00:00.000Z',
            last_exit_at: '2026-07-01T16:19:00.000Z',
            punch_count: 2,
            worked_minutes: 499,
            theoretical_minutes: 480,
            overtime_minutes: 19
          }
        ],
        total_worked_minutes: 499,
        total_overtime_minutes: 19
      };
      return result;
    },
    reportMonthByGroup(input) {
      calls.push({ method: 'reportMonthByGroup', input });
      const result: NumaHrReportMonthByGroupResult = {
        query_id: 'report.month-by-group',
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        row_count: 1,
        truncated: false,
        citations: [citation('report.month-by-group')],
        group_id: null,
        group_name: input.group_name ?? 'Manindu',
        year: input.year,
        month: input.month,
        limit: input.limit,
        offset: input.offset,
        employee_count: 1,
        records: [
          {
            employee_id: 'emp-001',
            employee_name: 'Eugenio Moya',
            days_with_punch: 2,
            worked_minutes: 499,
            leave_days: 1,
            vacation_days: 1,
            active: true
          }
        ]
      };
      return result;
    }
  };
}

function startRuntimeForCase(capabilityKey: HrToolName, args: Record<string, unknown>, text: string, messageId = 200, now: () => Date = () => new Date('2026-07-11T12:00:00.000Z')) {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-numa-hr-tools-'));
  const qwenRequests: QwenRequest[] = [];
  const hrCalls: HrCall[] = [];
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([buildTelegramUpdate(messageId, text)]);

  try {
    const runtimeResult = startInstallationRuntime({
      rawConfig: buildInstallationConfig(join(tempDir, 'conversation-memory.json'), join(tempDir, 'evidence-ledger.json')),
      env: buildEnv(),
      telegramTransport,
      qwenTransport: buildQwenTransport(capabilityKey, args, qwenRequests),
      hrReadPort: buildHrReadPort(hrCalls),
      now
    });

    assert.equal(runtimeResult.status, 'started');
    assert.ok(runtimeResult.runtime);

    const [channelResult] = runtimeResult.runtime!.pollOnce();
    return { qwenRequests, hrCalls, channelResult };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('runtime slice forces asuntos propios relative-year questions to a deterministic HR tool call', () => {
  const { qwenRequests, hrCalls, channelResult } = startRuntimeForCase(
    'leave.days',
    {
      employee_name: 'BEATRIZ VERA',
      year: '2024',
      time_type_labels: ['vacaciones']
    },
    'BEATRIZ VERA tuvo asuntos propios el a\u00f1o pasado?',
    207,
    () => new Date('2026-07-11T12:00:00.000Z')
  );

  assert.equal(qwenRequests.length, 1);
  const qwenRequest = qwenRequests[0];
  assert.ok(qwenRequest);
  assert.deepEqual((qwenRequest.tools ?? []).map((tool) => tool.function?.name), ['leave.days']);
  assert.deepEqual(qwenRequest.tool_choice, { type: 'function', function: { name: 'leave.days' } });
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Current date: 2026-07-11.'), true);
  assert.equal(hrCalls.length, 1);
  assert.equal(hrCalls[0].method, 'leaveDays');
  assert.deepEqual(hrCalls[0].input, {
    organization_id: 'org-numa-hr-tools-test',
    correlation_id: 'telegram:install-numa-hr-tools-test:146574793:207',
    employee_id: null,
    employee_name: 'BEATRIZ VERA',
    year: 2025,
    time_type_ids: [34],
    include_pending: false
  });
  assert.equal(channelResult.orchestration_outcome?.response.status, 'completed');
  assert.equal((channelResult.orchestration_outcome?.response.data as { query_id?: string } | null | undefined)?.query_id, 'leave.days');
});

function assertHrToolSchemas(request: QwenRequest) {
  const tools = request.tools ?? [];
  const hrTools = tools.filter((tool) => HR_TOOL_NAMES.includes(tool.function?.name as HrToolName));
  assert.deepEqual(
    hrTools.map((tool) => tool.function?.name).sort(),
    [...HR_TOOL_NAMES].sort()
  );

  const expectedProperties: Record<HrToolName, string[]> = {
    'punch.day': ['employee_name', 'date'],
    'leave.days': ['employee_name', 'year', 'time_type_labels'],
    'leave.balance': ['employee_name', 'year', 'time_type_labels'],
    'leave.detail': ['employee_name', 'date_from', 'date_to', 'time_type_labels'],
    'worktime.summary': ['employee_name', 'date_from', 'date_to'],
    'report.month-by-group': ['group_name', 'year', 'month']
  };

  const forbiddenFields = ['employee_id', 'time_type_id', 'time_type_ids', 'annual_quota_by_time_type', 'organization_id', 'correlation_id', 'group_id'];

  for (const toolName of HR_TOOL_NAMES) {
    const schema = tools.find((tool) => tool.function?.name === toolName)?.function?.parameters;
    assert.ok(schema);
    assert.deepEqual(Object.keys(schema?.properties ?? {}).sort(), [...expectedProperties[toolName]].sort());
    assert.deepEqual([...(schema?.required ?? [])].sort(), [...expectedProperties[toolName]].sort());
    assert.equal(schema?.additionalProperties, false);
    assert.equal(Object.keys(schema?.properties ?? {}).some((field) => forbiddenFields.includes(field)), false);
  }
}

test('runtime slice exposes the Numa HR tools in the Qwen catalog without ids or quotas', () => {
  const { qwenRequests } = startRuntimeForCase(
    'leave.days',
    {
      employee_name: 'Eugenio Moya',
      year: '2026',
      time_type_labels: ['asuntos propios']
    },
    'Días de asuntos propios del trabajador Eugenio Moya.'
  );

  assert.equal(qwenRequests.length > 0, true);
  assertHrToolSchemas(qwenRequests[0]);
});

const demoCases: Array<{
  name: string;
  text: string;
  capabilityKey: HrToolName;
  args: Record<string, unknown>;
  messageId?: number;
  expectedMethod: HrCall['method'];
  expectedInput: Record<string, unknown>;
}> = [
  {
    name: 'asuntos propios',
    text: 'Días de asuntos propios del trabajador Eugenio Moya.',
    messageId: 201,
    capabilityKey: 'leave.days',
    args: {
      employee_name: 'Eugenio Moya',
      year: '2026',
      time_type_labels: ['asuntos propios']
    },
    expectedMethod: 'leaveDays',
    expectedInput: {
      employee_id: null,
      employee_name: 'Eugenio Moya',
      year: 2026,
      time_type_ids: [34],
      include_pending: false
    }
  },
  {
    name: 'vacaciones',
    text: 'Días vacaciones del trabajador Eugenio Moya.',
    messageId: 202,
    capabilityKey: 'leave.balance',
    args: {
      employee_name: 'Eugenio Moya',
      year: '2026',
      time_type_labels: ['vacaciones']
    },
    expectedMethod: 'leaveBalance',
    expectedInput: {
      employee_id: null,
      employee_name: 'Eugenio Moya',
      year: 2026,
      time_type_ids: [5],
      annual_quota_by_time_type: {
        5: 22,
        34: 6
      },
      include_pending: false
    }
  },
  {
    name: 'leave detail',
    text: 'Que dias estuvo de vacaciones el trabajador Eugenio Moya en 2026.',
    messageId: 206,
    capabilityKey: 'leave.detail',
    args: {
      employee_name: 'Eugenio Moya',
      date_from: '2026-01-01',
      date_to: '2026-12-31',
      time_type_labels: ['vacaciones']
    },
    expectedMethod: 'leaveDetail',
    expectedInput: {
      employee_id: null,
      employee_name: 'Eugenio Moya',
      date_from: '2026-01-01',
      date_to: '2026-12-31',
      time_type_ids: [5],
      include_pending: false,
      limit: 100
    }
  },
  {
    name: 'punch day',
    text: 'A qué hora ha fichado esta mañana el trabajador Eugenio Moya.',
    messageId: 203,
    capabilityKey: 'punch.day',
    args: {
      employee_name: 'Eugenio Moya',
      date: '2026-07-01'
    },
    expectedMethod: 'punchDay',
    expectedInput: {
      employee_id: null,
      employee_name: 'Eugenio Moya',
      date: '2026-07-01'
    }
  },
  {
    name: 'report month by group',
    text: 'Informe del mes de mayo de los trabajadores del centro Manindu.',
    messageId: 204,
    capabilityKey: 'report.month-by-group',
    args: {
      group_name: 'Manindu',
      year: '2026',
      month: 5
    },
    expectedMethod: 'reportMonthByGroup',
    expectedInput: {
      group_id: null,
      group_name: 'Manindu',
      year: 2026,
      month: 5,
      limit: 25,
      offset: 0
    }
  },
  {
    name: 'worktime summary',
    text: 'Resumen de jornada del trabajador Eugenio Moya del 1 al 7 de julio.',
    messageId: 205,
    capabilityKey: 'worktime.summary',
    args: {
      employee_name: 'Eugenio Moya',
      date_from: '2026-07-01',
      date_to: '2026-07-07'
    },
    expectedMethod: 'worktimeSummary',
    expectedInput: {
      employee_id: null,
      employee_name: 'Eugenio Moya',
      date_from: '2026-07-01',
      date_to: '2026-07-07',
      theoretical_workday_minutes: null
    }
  }
];

for (const demoCase of demoCases) {
  test('runtime slice routes Numa HR demo question: ' + demoCase.name, () => {
    const { qwenRequests, hrCalls, channelResult } = startRuntimeForCase(demoCase.capabilityKey, demoCase.args, demoCase.text, demoCase.messageId);

    assert.equal(hrCalls.length > 0, true);
    assert.equal(hrCalls[0].method, demoCase.expectedMethod);
    assert.deepEqual(hrCalls[0].input, {
      organization_id: 'org-numa-hr-tools-test',
      correlation_id: `telegram:install-numa-hr-tools-test:146574793:${demoCase.messageId}`,
      ...demoCase.expectedInput
    });
    assert.equal(channelResult.orchestration_outcome?.response.status, 'completed');
    assert.equal((channelResult.orchestration_outcome?.response.data as { query_id?: string } | null | undefined)?.query_id, demoCase.capabilityKey);
    assert.equal(channelResult.orchestration_outcome?.organization_id, 'org-numa-hr-tools-test');
    const message = channelResult.orchestration_outcome?.response.message ?? '';
    assert.equal(message.includes('_(HOLIDAY)'), false);
    if (demoCase.capabilityKey === 'leave.balance' || demoCase.capabilityKey === 'leave.detail') {
      assert.equal(message.includes('Vacaciones'), true);
    }
  });
}



const variableEmployeeCases: Array<{
  name: string;
  text: string;
  capabilityKey: HrToolName;
  args: Record<string, unknown>;
  expectedMethod: HrCall['method'];
}> = [
  {
    name: 'leave days for Ana Garc\u00eda',
    text: 'D\u00edas de asuntos propios del trabajador Ana Garc\u00eda.',
    capabilityKey: 'leave.days',
    args: {
      employee_name: 'Ana Garc\u00eda',
      year: '2026',
      time_type_labels: ['asuntos propios']
    },
    expectedMethod: 'leaveDays'
  },
  {
    name: 'leave balance for Juan Mag\u00e1n',
    text: 'D\u00edas vacaciones del trabajador Juan Mag\u00e1n.',
    capabilityKey: 'leave.balance',
    args: {
      employee_name: 'Juan Mag\u00e1n',
      year: '2026',
      time_type_labels: ['vacaciones']
    },
    expectedMethod: 'leaveBalance'
  },
  {
    name: 'punch day for Pepito P\u00e9rez',
    text: 'A qu\u00e9 hora ha fichado esta ma\u00f1ana Pepito P\u00e9rez.',
    capabilityKey: 'punch.day',
    args: {
      employee_name: 'Pepito P\u00e9rez',
      date: '2026-07-01'
    },
    expectedMethod: 'punchDay'
  },
  {
    name: 'report month by group for MANINDU MARTOS',
    text: 'Informe del mes de junio de los trabajadores del centro MANINDU MARTOS.',
    capabilityKey: 'report.month-by-group',
    args: {
      group_name: 'MANINDU MARTOS',
      year: '2026',
      month: 6
    },
    expectedMethod: 'reportMonthByGroup'
  }
];

for (const variableCase of variableEmployeeCases) {
  test('runtime slice forwards variable HR names: ' + variableCase.name, () => {
    const { hrCalls, channelResult } = startRuntimeForCase(variableCase.capabilityKey, variableCase.args, variableCase.text, 300);

    assert.equal(hrCalls.length > 0, true);
    assert.equal(hrCalls[0].method, variableCase.expectedMethod);
    if (variableCase.capabilityKey === 'report.month-by-group') {
      assert.equal((hrCalls[0].input as { group_name?: string }).group_name, 'MANINDU MARTOS');
    } else {
      assert.equal((hrCalls[0].input as { employee_name?: string }).employee_name, variableCase.args.employee_name);
    }
    assert.equal(channelResult.orchestration_outcome?.response.status, 'completed');
  });
}
