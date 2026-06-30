import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryTelegramTransport } from '../../channels/telegram/src/index';
import type { HoldedFetch } from '../../adapters/holded/src/index';
import type {
  QwenChatCompletionsTransport,
  QwenChatCompletionChoice
} from '../../orchestrators/qwen/src/index';
import {
  startInstallationRuntime,
  type RuntimeInstallationConfig
} from '../src/index';

function buildEnv(): NodeJS.ProcessEnv {
  return {
    HOLDED_API_KEY: 'holded-secret',
    KERN_TELEGRAM_BOT_TOKEN: 'telegram-secret',
    KERN_MODEL_BASE_URL: 'https://model.example.test',
    KERN_MODEL_NAME: 'kern-qwen',
    KERN_MODEL_API_KEY: 'model-secret'
  };
}

function buildInstallationConfig(): RuntimeInstallationConfig {
  return {
    installation_id: 'install-acme',
    organization: {
      organization_id: 'org-acme',
      name: 'Acme',
      active: true,
      isolation_boundary: 'Acme only'
    },
    principals: [
      {
        principal_id: 'human-001',
        name: 'Human One',
        principal_type: 'human',
        active: true,
        scopes: ['read:knowledge', 'read:estimate']
      }
    ],
    identity_mappings: [
      {
        channel: 'telegram',
        telegram_user_id: 'telegram-gema',
        telegram_chat_id: 'telegram-chat-pacoprint',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        installation_id: 'install-acme',
        principal_type: 'human',
        active: true,
        display_name: 'Gema'
      }
    ],
    active_modules: ['telegram-channel', 'qwen-orchestrator', 'holded-read'],
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
      polling_iterations: 1
    }
  } satisfies RuntimeInstallationConfig;
}

function buildQwenTransport(): QwenChatCompletionsTransport {
  return {
    chatCompletions() {
      const choice: QwenChatCompletionChoice = {
        index: 0,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tool-call-1',
              type: 'function',
              function: {
                name: 'mock.resource.read',
                arguments: JSON.stringify({
                  estimate_id: 'estimate-123',
                  customer_id: 'customer-001',
                  resource_type: 'estimate'
                })
              }
            }
          ]
        }
      };
      return {
        id: 'chatcmpl-m11',
        model: 'kern-qwen',
        choices: [choice]
      };
    }
  };
}

function buildHoldedFetch(calls: Array<{ url: string; init?: RequestInit }>): HoldedFetch {
  return (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = {
      estimate_id: 'estimate-123',
      customer_id: 'customer-001',
      customer_name: 'Acme Customer',
      total_amount: 1210,
      currency: 'EUR',
      source_evidence: [
        {
          source_id: 'holded-source-1',
          source_system: 'holded',
          resource_id: 'estimate-123',
          record_id: 'estimate-123',
          field_path: 'estimate_id',
          observed_at: '2026-06-30T00:00:00.000Z',
          correlation_id: 'runtime:paco-print-installation:2'
        }
      ]
    };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => JSON.stringify(body),
      json: () => body,
      headers: { get: () => null }
    };
  };
}

function buildTelegramUpdate() {
  return {
    update_id: 2,
    message: {
      message_id: 200,
      chat: {
        id: 'telegram-chat-pacoprint',
        type: 'private' as const
      },
      from: {
        id: 'telegram-gema',
        username: 'gema',
        first_name: 'Gema',
        last_name: 'Print'
      },
      text: 'Necesito el presupuesto estimate-123 del cliente customer-001',
      date: 1_751_472_000,
      raw: null
    },
    raw: null
  };
}

test('runtime slice wires telegram, qwen, holded and governance evidence end to end', () => {
  const config = buildInstallationConfig();
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([buildTelegramUpdate()]);
  const qwenCalls: Array<unknown> = [];
  const qwenTransport: QwenChatCompletionsTransport = {
    chatCompletions(request) {
      qwenCalls.push(request);
      return buildQwenTransport().chatCompletions(request);
    }
  };
  const holdedCalls: Array<{ url: string; init?: RequestInit }> = [];
  const runtimeResult = startInstallationRuntime({
    rawConfig: config,
    env: buildEnv(),
    telegramTransport,
    qwenTransport,
    holdedFetch: buildHoldedFetch(holdedCalls)
  });

  assert.equal(runtimeResult.status, 'started');
  assert.ok(runtimeResult.runtime);
  assert.deepEqual(runtimeResult.moduleRegistry.listActive().map((module) => module.module_key), [
    'telegram-channel',
    'qwen-orchestrator',
    'holded-read'
  ]);

  const runtime = runtimeResult.runtime;
  const [channelResult] = runtime.pollOnce();
  const runtimeRecords = runtime.evidenceLedger.listByCorrelation('runtime:install-acme:2');
  const orchestrationRecords = runtime.orchestrationBoundary.getEvidenceLedger().listByCorrelation(
    'telegram:install-acme:telegram-chat-pacoprint:200'
  );

  assert.equal(qwenCalls.length > 0, true);
  assert.equal(holdedCalls.length > 0, true);
  assert.equal(channelResult.status, 'sent');
  assert.equal(channelResult.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(channelResult.orchestration_outcome?.response.status, 'completed');
  assert.equal(channelResult.orchestration_outcome?.response.data?.estimate_id, 'estimate-123');
  assert.equal(JSON.stringify(channelResult).includes('telegram-secret'), false);
  assert.equal(JSON.stringify(channelResult).includes('holded-secret'), false);
  assert.equal(
    runtimeResult.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) => record.record_type === 'runtime_started'),
    true
  );
  assert.equal(runtimeRecords.some((record) => record.record_type === 'runtime_message_received'), true);
  assert.equal(runtimeRecords.some((record) => record.record_type === 'runtime_message_processed'), true);
  assert.equal(orchestrationRecords.some((record) => record.record_type === 'orchestration_requested'), true);
  assert.equal(orchestrationRecords.some((record) => record.record_type === 'workflow_invocation_requested'), true);
  assert.equal(orchestrationRecords.some((record) => record.record_type === 'workflow_response_created'), true);
});

test('runtime slice fails closed when a required module is missing', () => {
  const config = {
    ...buildInstallationConfig(),
    active_modules: ['telegram-channel', 'qwen-orchestrator']
  } satisfies RuntimeInstallationConfig;

  const runtimeResult = startInstallationRuntime({
    rawConfig: config,
    env: buildEnv()
  });

  assert.equal(runtimeResult.status, 'blocked');
  assert.equal(runtimeResult.reason, 'required modules missing');
  assert.equal(runtimeResult.runtime, null);
  assert.equal(
    runtimeResult.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) =>
      record.record_type === 'module_missing'
    ),
    true
  );
  assert.equal(
    runtimeResult.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) =>
      record.record_type === 'installation_start_blocked'
    ),
    true
  );
});

test('runInstallation reads config from the environment and blocks safely when modules are missing', async () => {
  const original = new Map<string, string | undefined>([
    ['KERN_RUNTIME_CONFIG_JSON', process.env.KERN_RUNTIME_CONFIG_JSON],
    ['KERN_RUNTIME_CONFIG_PATH', process.env.KERN_RUNTIME_CONFIG_PATH],
    ['HOLDED_API_KEY', process.env.HOLDED_API_KEY],
    ['KERN_TELEGRAM_BOT_TOKEN', process.env.KERN_TELEGRAM_BOT_TOKEN],
    ['KERN_MODEL_BASE_URL', process.env.KERN_MODEL_BASE_URL],
    ['KERN_MODEL_NAME', process.env.KERN_MODEL_NAME],
    ['KERN_MODEL_API_KEY', process.env.KERN_MODEL_API_KEY]
  ]);

  const config = {
    ...buildInstallationConfig(),
    active_modules: ['telegram-channel']
  };

  process.env.KERN_RUNTIME_CONFIG_JSON = JSON.stringify(config);
  process.env.HOLDED_API_KEY = 'holded-secret';
  process.env.KERN_TELEGRAM_BOT_TOKEN = 'telegram-secret';
  process.env.KERN_MODEL_BASE_URL = 'https://model.example.test';
  process.env.KERN_MODEL_NAME = 'kern-qwen';
  process.env.KERN_MODEL_API_KEY = 'model-secret';

  const { runInstallation } = await import('../src/run-installation');
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    assert.equal(runInstallation(), 1);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
