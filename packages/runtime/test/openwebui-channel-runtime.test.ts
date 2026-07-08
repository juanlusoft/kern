import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryTelegramTransport } from '../../channels/telegram/src/index';
import type { HoldedFetch } from '../../adapters/holded/src/index';
import type { QwenChatCompletionsTransport } from '../../orchestrators/qwen/src/index';
import { loadInstallationConfig } from '../src/config';
import { startInstallationRuntime, type RuntimeInstallationConfig } from '../src/index';

function buildEnv(): NodeJS.ProcessEnv {
  return {
    HOLDED_API_KEY: 'holded-secret',
    KERN_TELEGRAM_BOT_TOKEN: 'telegram-secret',
    KERN_MODEL_BASE_URL: 'https://model.example.test',
    KERN_MODEL_NAME: 'kern-qwen',
    KERN_MODEL_API_KEY: 'model-secret'
  };
}

function buildQwenTransport(): QwenChatCompletionsTransport {
  return {
    chatCompletions() {
      return {
        id: 'chatcmpl-openwebui',
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

function buildBaseConfig(activeModules: RuntimeInstallationConfig['active_modules']): RuntimeInstallationConfig {
  return {
    installation_id: 'install-openwebui-runtime-test',
    organization: {
      organization_id: 'org-openwebui-runtime-test',
      name: 'Open WebUI Runtime Test',
      active: true,
      isolation_boundary: 'Open WebUI only'
    },
    principals: [
      {
        principal_id: 'principal-openwebui-runtime-test',
        name: 'Open WebUI Demo User',
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
        organization_id: 'org-openwebui-runtime-test',
        principal_id: 'principal-openwebui-runtime-test',
        installation_id: 'install-openwebui-runtime-test',
        principal_type: 'human',
        active: true,
        display_name: 'Open WebUI Demo User'
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
      openwebui_channel: null
    }
  };
}

test('runtime config accepts openwebui channel settings', () => {
  const loaded = loadInstallationConfig(
    {
      ...buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read']),
      runtime_options: {
        ...buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read']).runtime_options,
        openwebui_channel: {
          host: '127.0.0.1',
          port: 8787,
          request_body_limit_bytes: 10_000,
          users: {
            'openwebui-user-1': {
              principal_id: 'principal-openwebui-runtime-test',
              organization_id: 'org-openwebui-runtime-test',
              active: true,
              display_name: 'Open WebUI Demo User'
            }
          }
        }
      }
    },
    buildEnv()
  );

  assert.equal(loaded.config.runtime_options.openwebui_channel?.users['openwebui-user-1'].organization_id, 'org-openwebui-runtime-test');
  assert.equal(loaded.config.runtime_options.openwebui_channel?.users['openwebui-user-1'].principal_id, 'principal-openwebui-runtime-test');
});

test('runtime slice starts the Open WebUI server only when the module is active', async () => {
  const telegramTransport = new InMemoryTelegramTransport();
  const runtimeResult = startInstallationRuntime({
    rawConfig: {
      ...buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read', 'openwebui-channel']),
      runtime_options: {
        ...buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read', 'openwebui-channel']).runtime_options,
        openwebui_channel: {
          host: '127.0.0.1',
          port: 0,
          request_body_limit_bytes: 10_000,
          users: {
            'openwebui-user-1': {
              principal_id: 'principal-openwebui-runtime-test',
              organization_id: 'org-openwebui-runtime-test',
              active: true,
              display_name: 'Open WebUI Demo User'
            }
          }
        }
      }
    },
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch()
  });

  assert.equal(runtimeResult.status, 'started');
  assert.ok(runtimeResult.runtime);
  assert.equal(runtimeResult.moduleRegistry.listActive().some((module) => module.module_key === 'openwebui-channel'), true);
  assert.ok(runtimeResult.runtime?.openwebuiServer);
  const port = await runtimeResult.runtime!.openwebuiServer!.ready;
  assert.ok(port >= 0);
  await runtimeResult.runtime!.openwebuiServer!.close();
});

test('runtime slice does not start Open WebUI when the module is inactive', () => {
  const runtimeResult = startInstallationRuntime({
    rawConfig: buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read']),
    env: buildEnv(),
    telegramTransport: new InMemoryTelegramTransport(),
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch()
  });

  assert.equal(runtimeResult.status, 'started');
  assert.equal(runtimeResult.runtime?.openwebuiServer, null);
});

test('runtime slice fails closed when openwebui is active but config is missing', () => {
  const runtimeResult = startInstallationRuntime({
    rawConfig: buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read', 'openwebui-channel']),
    env: buildEnv(),
    telegramTransport: new InMemoryTelegramTransport(),
    qwenTransport: buildQwenTransport(),
    holdedFetch: buildHoldedFetch()
  });

  assert.equal(runtimeResult.status, 'blocked');
  assert.equal(runtimeResult.reason?.includes('openwebui_channel'), true);
  assert.equal(runtimeResult.runtime, null);
});

test('runtime config rejects openwebui user mappings without organization_id', () => {
  assert.throws(
    () =>
      loadInstallationConfig(
        {
          ...buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read']),
          runtime_options: {
            ...buildBaseConfig(['telegram-channel', 'qwen-orchestrator', 'holded-read']).runtime_options,
            openwebui_channel: {
              host: '127.0.0.1',
              port: 8787,
              request_body_limit_bytes: 10_000,
              users: {
                'openwebui-user-1': {
                  principal_id: 'principal-openwebui-runtime-test',
                  organization_id: '',
                  active: true,
                  display_name: 'Open WebUI Demo User'
                }
              }
            }
          }
        },
        buildEnv()
      ),
    /organization_id/
  );
});
