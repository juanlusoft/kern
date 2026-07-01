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
    installation_id: 'install-granapublic-live-test',
    organization: {
      organization_id: 'org-granapublic-live-test',
      name: 'Granapublic Live Test',
      active: true,
      isolation_boundary: 'Granapublic live only'
    },
    principals: [
      {
        principal_id: 'principal-gema-granapublic-live-test',
        name: 'Gema Granapublic Live Test',
        principal_type: 'human',
        active: true,
        scopes: ['request:governed', 'read:knowledge', 'read:estimate']
      },
      {
        principal_id: 'principal-juan-granapublic-live-test',
        name: 'Juan Granapublic Live Test',
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
        organization_id: 'org-granapublic-live-test',
        principal_id: 'principal-gema-granapublic-live-test',
        installation_id: 'install-granapublic-live-test',
        principal_type: 'human',
        active: true,
        display_name: 'Gema Granapublic Live Test'
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
      polling_iterations: 1
    }
  };
}

function buildHoldedFetch(): HoldedFetch {
  return (_url: string, _init?: RequestInit): HoldedFetchResponse => {
    const body = [
      {
        estimate_id: 'estimate-old-granapublic',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 2100,
        currency: 'EUR',
        date: '2024-03-09T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-new-granapublic',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'Vinilo Monomerico' }],
        total_amount: 2200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-other',
        customer_id: 'other-customer',
        customer_name: 'Other Customer',
        contact: 'contact-other',
        contactName: 'Other Customer',
        products: [{ name: 'Otro producto' }],
        total_amount: 1800,
        currency: 'EUR',
        date: '2024-08-15T00:00:00.000Z'
      }
    ];
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
                          function: {
                            name: 'mock.resource.read',
                            arguments: {
                              estimate_id: 'estimate-12345',
                              customer_id: 'granapublic',
                              resource_type: 'estimate'
                            }
                          }
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
  const serializedConfig = JSON.stringify(config);
  assert.equal(serializedConfig.includes('org-acme'), false);
  assert.equal(serializedConfig.includes('human-001'), false);
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
          username: 'gema-granapublic',
          first_name: 'Gema',
          last_name: 'Granapublic'
        },
        text: 'Necesito el ultimo presupuesto del cliente Granapublic',
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
  assert.equal(result.orchestration_outcome?.organization_id, 'org-granapublic-live-test');
  assert.equal(result.orchestration_outcome?.response.data?.estimate_id, 'estimate-new-granapublic');
  assert.equal(result.orchestration_outcome?.response.data?.customer_name, 'Granapublic Xx Sl');
  assert.equal(result.orchestration_outcome?.response.data?.lookup_mode, 'by_customer');
  assert.equal(JSON.stringify(result).includes('telegram-secret'), false);
  assert.equal(JSON.stringify(result).includes('holded-secret'), false);
  assert.equal(
    runtime.evidenceLedger.listByCorrelation('runtime-bootstrap').some((record) => record.record_type === 'runtime_started'),
    true
  );
  assert.equal(
    runtime.orchestrationBoundary
      .getEvidenceLedger()
      .listByCorrelation('telegram:install-granapublic-live-test:146574793:200')
      .some((record) => record.record_type === 'workflow_response_created'),
    true
  );
});

test('M11 runtime slice fails closed when live-like organization, principal, scope or capability is removed', () => {
  const baseConfig = buildInstallationConfig();
  const variants: Array<{ name: string; config: RuntimeInstallationConfig }> = [
    {
      name: 'organization inactive',
      config: {
        ...structuredClone(baseConfig),
        organization: {
          ...baseConfig.organization,
          active: false
        }
      } satisfies RuntimeInstallationConfig
    },
    {
      name: 'principal removed',
      config: {
        ...structuredClone(baseConfig),
        principals: []
      } satisfies RuntimeInstallationConfig
    },
    {
      name: 'principal scope removed',
      config: {
        ...structuredClone(baseConfig),
        principals: baseConfig.principals.map((principal) =>
          principal.principal_id === 'principal-gema-granapublic-live-test'
            ? {
                ...principal,
                scopes: []
              }
            : principal
        )
      } satisfies RuntimeInstallationConfig
    },
    {
      name: 'capability removed',
      config: {
        ...structuredClone(baseConfig),
        active_capabilities: []
      } satisfies RuntimeInstallationConfig
    }
  ];

  for (const variant of variants) {
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
          text: 'Necesito el ultimo presupuesto del cliente Granapublic',
          date: 1_751_472_000,
          raw: null
        },
        raw: null
      }
    ]);

    const runtimeResult = startInstallationRuntime({
      rawConfig: variant.config,
      env: buildEnv(),
      telegramTransport,
      qwenTransport: buildQwenTransport(),
      holdedFetch: buildHoldedFetch()
    });

    assert.equal(runtimeResult.status, 'started', `${variant.name} should start fail-closed, not crash`);
    assert.ok(runtimeResult.runtime, `${variant.name} should still produce a runtime`);
    const [result] = runtimeResult.runtime.pollOnce();
    assert.ok(result, `${variant.name} should produce a channel result`);
    assert.equal(result.inbound_message?.message_id, '200');
    assert.equal(JSON.stringify(variant.config).includes('org-acme'), false);
    assert.equal(JSON.stringify(variant.config).includes('human-001'), false);
    if (variant.name === 'organization inactive') {
      assert.equal(result.status, 'blocked');
      assert.equal(result.orchestration_outcome, null);
    } else {
      assert.equal(result.status, 'sent');
      assert.equal(result.orchestration_outcome?.response.status, 'denied');
      assert.equal(result.orchestration_outcome?.response.response_source, 'workflow_blocked');
    }
  }
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
