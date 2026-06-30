import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryTelegramTransport } from '../../channels/telegram/src/index';
import type { HoldedFetch, HoldedFetchResponse } from '../../adapters/holded/src/index';
import type { QwenChatCompletionsTransport } from '../../orchestrators/qwen/src/index';
import { startInstallationRuntime, type RuntimeInstallationConfig } from '../../runtime/src/index';

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
        telegram_user_id: '146574793',
        telegram_chat_id: '146574793',
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
  };
}

function buildHoldedFetch(): HoldedFetch {
  return (_url: string, _init?: RequestInit): HoldedFetchResponse => {
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

function buildQwenTransport(): QwenChatCompletionsTransport {
  return {
    chatCompletions() {
      return {
        id: 'chatcmpl-m11',
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
          }
        ]
      };
    }
  };
}

test('M11 runtime slice keeps installation config, wiring and evidence isolated and fail-closed', () => {
  const config = buildInstallationConfig();
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 2,
    message: {
      message_id: 200,
      chat: {
        id: 146574793,
        type: 'private'
      },
      from: {
        id: 146574793,
        username: 'gema',
        first_name: 'Gema',
        last_name: 'Print'
        },
        text: 'Necesito el presupuesto estimate-123 del cliente customer-001',
        date: 1_751_472_000,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: config,
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch()
  });

  assert.equal(runtimeResult.status, 'started');
  assert.ok(runtimeResult.runtime);
  assert.deepEqual(runtimeResult.moduleRegistry.listActive().map((module) => module.module_key), [
    'telegram-channel',
    'qwen-orchestrator',
    'holded-read'
  ]);

  const runtime = runtimeResult.runtime;
  const [result] = runtime.pollOnce();

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  assert.equal(result.inbound_message?.message_id, '200');
  assert.equal(result.inbound_message?.chat_id, '146574793');
  assert.equal(result.inbound_message?.user_id, '146574793');
  assert.equal(JSON.stringify(result).includes('telegram-secret'), false);
  assert.equal(JSON.stringify(result).includes('holded-secret'), false);
  assert.equal(
    runtime.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) => record.record_type === 'runtime_started'),
    true
  );
  assert.equal(
    runtime.orchestrationBoundary
      .getEvidenceLedger()
      .listByCorrelation('telegram:install-acme:146574793:200')
      .some((record) => record.record_type === 'workflow_response_created'),
    true
  );
});

test('M11 runtime slice blocks when a required module is missing', () => {
  const runtimeResult = startInstallationRuntime({
    rawConfig: {
      ...buildInstallationConfig(),
      active_modules: ['telegram-channel', 'qwen-orchestrator']
    },
    env: buildEnv()
  });

  assert.equal(runtimeResult.status, 'blocked');
  assert.equal(runtimeResult.reason, 'required modules missing');
  assert.equal(runtimeResult.runtime, null);
  assert.equal(
    runtimeResult.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) => record.record_type === 'module_missing'),
    true
  );
  assert.equal(
    runtimeResult.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) => record.record_type === 'installation_start_blocked'),
    true
  );
});
