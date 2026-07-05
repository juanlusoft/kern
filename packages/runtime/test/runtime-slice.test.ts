import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryTelegramTransport } from '../../channels/telegram/src/index';
import type { HoldedFetch } from '../../adapters/holded/src/index';
import type {
  QwenChatCompletionsTransport,
  QwenChatCompletionChoice
} from '../../orchestrators/qwen/src/index';
import { createNodeFetchHoldedTransport } from '../src/index';
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

function buildInstallationConfig(conversationMemoryFilePath: string | null = null): RuntimeInstallationConfig {
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
      conversation_memory_file_path: conversationMemoryFilePath,
      polling_iterations: 1
    }
  } satisfies RuntimeInstallationConfig;
}

function buildQwenTransport(
  options: {
    resource_type?: 'estimate' | 'invoice';
    payment_status?: 'pending' | 'paid' | 'overdue' | null;
    customer_id?: string | null;
    limit?: number | null;
    year?: string | null;
    tool_name?: 'mock.resource.read' | 'request_clarification';
    clarification?: {
      missing: 'customer' | 'document_id' | 'ambiguous' | 'unsupported';
      reason: string;
    };
  } = {}
): QwenChatCompletionsTransport {
  const resource_type = options.resource_type ?? 'estimate';
  const payment_status = options.payment_status ?? null;
  const customer_id = options.customer_id ?? 'Granapublic';
  const limit = options.limit ?? null;
  const year = options.year ?? null;
  const toolName = options.tool_name ?? 'mock.resource.read';
  return {
    chatCompletions() {
      const clarification = options.clarification ?? {
        missing: 'customer' as const,
        reason: 'Falta el cliente para buscar el documento correcto.'
      };
      const toolArguments =
        toolName === 'request_clarification'
          ? clarification
          : {
              resource_type,
              ...(customer_id ? { customer_id } : {}),
              ...(limit ? { limit } : {}),
              ...(year ? { year } : {}),
              ...(payment_status ? { payment_status } : {}),
              ...(!payment_status && !year && !customer_id ? { estimate_id: 'estimate-12345' } : {})
            };
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
                        name: toolName,
                        arguments:
                          toolName === 'request_clarification'
                            ? JSON.stringify(toolArguments)
                            : JSON.stringify({
                                name: 'mock.resource.read',
                                arguments: toolArguments
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

function buildHoldedFetch(calls: Array<{ url: string; init?: RequestInit }>, resource_type: 'estimate' | 'invoice' = 'estimate'): HoldedFetch {
  return (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body =
      resource_type === 'invoice'
        ? [
            {
              resource_type: 'invoice',
              source_system: 'Holded',
              invoice_id: 'F26/1930',
              docNumber: 'F26/1930',
              customer_id: 'granapublic',
              customer_name: 'Granapublic Xx Sl',
              contact: 'contact-granapublic',
              contactName: 'Granapublic Xx Sl',
              status: 0,
              paymentsPending: 1100,
              dueDate: '2024-03-09T00:00:00.000Z',
              total_amount: 1100,
              currency: 'EUR',
              date: '2024-03-09T00:00:00.000Z'
            },
            {
              resource_type: 'invoice',
              source_system: 'Holded',
              invoice_id: 'F26/1931',
              docNumber: 'F26/1931',
              customer_id: 'granapublic',
              customer_name: 'Granapublic Xx Sl',
              contact: 'contact-granapublic',
              contactName: 'Granapublic Xx Sl',
              products: [{ name: 'MUPIS PAPEL' }],
              status: 0,
              paymentsPending: 1200,
              dueDate: '2024-07-03T00:00:00.000Z',
              total_amount: 1200,
              currency: 'EUR',
              date: '2024-07-03T00:00:00.000Z'
            },
            {
              resource_type: 'invoice',
              source_system: 'Holded',
              invoice_id: 'F26/1932',
              docNumber: 'F26/1932',
              customer_id: 'granapublic',
              customer_name: 'Granapublic Xx Sl',
              contact: 'contact-granapublic',
              contactName: 'Granapublic Xx Sl',
              products: [{ name: 'Vinilo Monomérico Plus' }],
              status: 0,
              paymentsPending: 1300,
              dueDate: '2024-07-02T00:00:00.000Z',
              total_amount: 1300,
              currency: 'EUR',
              date: '2024-07-02T00:00:00.000Z'
            }
          ]
        : [
            {
              estimate_id: 'P26/04366',
              docNumber: 'P26/04366',
              customer_id: 'granapublic',
              customer_name: 'Granapublic Xx Sl',
              contact: 'contact-granapublic',
              contactName: 'Granapublic Xx Sl',
              total_amount: 2100,
              currency: 'EUR',
              date: '2024-03-09T00:00:00.000Z'
            },
            {
              estimate_id: 'P26/04367',
              docNumber: 'P26/04367',
              customer_id: 'granapublic',
              customer_name: 'Granapublic Xx Sl',
              contact: 'contact-granapublic',
              contactName: 'Granapublic Xx Sl',
              products: [{ name: 'Vinilo Monomérico' }],
              total_amount: 2200,
              currency: 'EUR',
              date: '2024-07-03T00:00:00.000Z'
            },
            {
              estimate_id: 'P26/04368',
              docNumber: 'P26/04368',
              customer_id: 'granapublic',
              customer_name: 'Granapublic Xx Sl',
              contact: 'contact-granapublic',
              contactName: 'Granapublic Xx Sl',
              products: [{ name: 'Vinilo Monomérico Plus' }],
              total_amount: 2300,
              currency: 'EUR',
              date: '2024-07-04T00:00:00.000Z'
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

function buildTelegramUpdate() {
  return {
    update_id: 2,
    message: {
      message_id: 200,
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
      text: 'Necesito el ultimo presupuesto del cliente Granapublic',
      date: 1_751_472_000,
      raw: null
    },
    raw: null
  };
}

function buildLargeHoldedPayload() {
  return [
    {
      estimate_id: 'estimate-000000',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      total_amount: 2100,
      currency: 'EUR',
      date: '2024-07-03T00:00:00.000Z',
      memo: 'Granapublic estimate payload '.repeat(60_000)
    }
  ];
}

test('runtime slice wires telegram, qwen, holded and governance evidence end to end', () => {
  const config = buildInstallationConfig();
  const serializedConfig = JSON.stringify(config);
  assert.equal(serializedConfig.includes('org-acme'), false);
  assert.equal(serializedConfig.includes('human-001'), false);
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
  const sentMessages = telegramTransport.listSentMessages();
  const runtimeRecords = runtime.evidenceLedger.listByCorrelation('runtime:install-granapublic-live-test:2');
  const orchestrationRecords = runtime.orchestrationBoundary.getEvidenceLedger().listByCorrelation(
    'telegram:install-granapublic-live-test:146574793:200'
  );

  assert.equal(qwenCalls.length > 0, true);
  assert.equal(holdedCalls.length > 0, true);
  const qwenRequest = qwenCalls[0] as {
    tools?: Array<{
      function?: {
        name?: string;
        parameters?: {
          required?: string[];
          anyOf?: Array<{ required?: string[] }>;
          properties?: {
            year?: {
              pattern?: string;
            };
            limit?: {
              type?: string;
              minimum?: number;
              maximum?: number;
            };
          };
        };
      };
    }>;
    messages?: Array<{ role?: string; content?: string | null }>;
    tool_choice?: string | Record<string, unknown>;
  };
  assert.equal(qwenRequest.tools?.[0]?.function?.parameters?.required?.includes('resource_type'), true);
  assert.equal(qwenRequest.tools?.some((tool) => tool.function?.name === 'request_clarification'), true);
  assert.equal(
    qwenRequest.tools?.[0]?.function?.parameters?.anyOf?.some(
      (candidate) => candidate.required?.includes('customer_id') && candidate.required?.length === 1
    ),
    true
  );
  assert.equal(qwenRequest.tools?.[0]?.function?.parameters?.anyOf?.some((candidate) => candidate.required?.includes('limit')), false);
  assert.equal(qwenRequest.tools?.[0]?.function?.parameters?.properties?.limit?.type, 'integer');
  assert.equal(qwenRequest.tools?.[0]?.function?.parameters?.properties?.limit?.minimum, 1);
  assert.equal(qwenRequest.tools?.[0]?.function?.parameters?.properties?.limit?.maximum, 20);
  assert.equal(
    qwenRequest.tools?.[0]?.function?.parameters?.anyOf?.some(
      (candidate) => candidate.required?.includes('invoice_id') && candidate.required?.length === 1
    ),
    true
  );
  assert.equal(
    qwenRequest.tools?.[0]?.function?.parameters?.anyOf?.some(
      (candidate) => candidate.required?.includes('year') && candidate.required?.length === 1
    ),
    true
  );
  assert.equal(qwenRequest.tools?.[0]?.function?.parameters?.properties?.year?.pattern, '^\\d{4}$');
  assert.equal(qwenRequest.tool_choice, 'auto');
  assert.equal(
    qwenRequest.messages?.[0]?.content?.includes('Do not output business results, answers, claims, prices, amounts, invoice totals, document contents, SourceEvidence, runtime results, CapabilityInvocationResult, or ResourceResult.'),
    true
  );
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('request_clarification instead of inventing params'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Use request_clarification with missing="customer"'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('ACME SL'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Cliente Ejemplo SL'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Cliente Demo SL'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Granapublic Xx Sl'), false);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Petroprix'), false);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('latest N estimates or invoices of a customer'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('Use limit only with customer_id.'), true);
  assert.equal(
    qwenRequest.messages?.[0]?.content?.includes('Do not invent estimate_id or invoice_id.'),
    true
  );
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('year-based document lists'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('do not compute date ranges or timestamps'), true);
  assert.equal(channelResult.status, 'sent');
  assert.equal(channelResult.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(channelResult.orchestration_outcome?.response.status, 'completed');
  assert.equal(channelResult.inbound_message?.message_id, '200');
  assert.equal(channelResult.inbound_message?.chat_id, '146574793');
  assert.equal(channelResult.inbound_message?.user_id, '146574793');
  assert.equal(channelResult.orchestration_outcome?.response.data?.estimate_id, 'P26/04368');
  assert.equal((channelResult.orchestration_outcome?.response.data as { docNumber?: string } | undefined)?.docNumber, 'P26/04368');
  assert.equal(channelResult.orchestration_outcome?.response.data?.customer_name, 'Granapublic Xx Sl');
  assert.equal(channelResult.orchestration_outcome?.response.data?.lookup_mode, 'by_customer');
  assert.equal(channelResult.orchestration_outcome?.organization_id, 'org-granapublic-live-test');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('Último presupuesto de Granapublic Xx Sl (P26/04368):'), true);
  assert.equal(sentMessages[0].text.includes('P26/04368'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('\n'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
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

test('runtime slice can read invoices and formats Telegram output safely', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 3,
      message: {
        message_id: 300,
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
        text: 'Necesito la factura del cliente Granapublic',
        date: 1_751_472_060,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport({ resource_type: 'invoice' }),
    holdedFetch: buildHoldedFetch([], 'invoice')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  assert.equal(result.orchestration_outcome?.response.data?.invoice_id, 'F26/1931');
  assert.equal((result.orchestration_outcome?.response.data as { docNumber?: string } | undefined)?.docNumber, 'F26/1931');
  assert.equal(result.orchestration_outcome?.response.data?.lookup_mode, 'by_customer');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].text.includes('Última factura de Granapublic Xx Sl (F26/1931):'), true);
  assert.equal(sentMessages[0].text.includes('F26/1931'), true);
  assert.equal(sentMessages[0].text.includes('MUPIS PAPEL'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('\n'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
});

test('runtime slice can read the latest N invoices by customer and keeps Telegram output human-readable', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 31,
      message: {
        message_id: 310,
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
        text: 'Necesito las 3 últimas facturas de Granapublic',
        date: 1_751_472_210,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport({ resource_type: 'invoice', customer_id: 'Granapublic', limit: 3 }),
    holdedFetch: buildHoldedFetch([], 'invoice')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  const responseData = result.orchestration_outcome?.response.data as
    | { kind?: string; lookup_mode?: string; aggregate?: { count?: number; totalAmount?: number } }
    | null
    | undefined;
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.lookup_mode, 'latest_n');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.totalAmount, 3600);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('Últimas 3 facturas de Granapublic:'), true);
  assert.equal(sentMessages[0].text.includes('F26/1931'), true);
  assert.equal(sentMessages[0].text.includes('F26/1932'), true);
  assert.equal(sentMessages[0].text.includes('F26/1930'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
});

test('runtime slice can read the latest N estimates by customer and keeps Telegram output human-readable', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 32,
      message: {
        message_id: 320,
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
        text: 'Necesito los 2 últimos presupuestos de Granapublic',
        date: 1_751_472_220,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport({ resource_type: 'estimate', customer_id: 'Granapublic', limit: 2 }),
    holdedFetch: buildHoldedFetch([], 'estimate')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  const responseData = result.orchestration_outcome?.response.data as
    | { kind?: string; lookup_mode?: string; aggregate?: { count?: number; totalAmount?: number } }
    | null
    | undefined;
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.lookup_mode, 'latest_n');
  assert.equal(responseData?.aggregate?.count, 2);
  assert.equal(responseData?.aggregate?.totalAmount, 4500);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('Últimos 2 presupuestos de Granapublic:'), true);
  assert.equal(sentMessages[0].text.includes('2 · 4500,00 € presupuestado'), true);
  assert.equal(sentMessages[0].text.includes('P26/04368'), true);
  assert.equal(sentMessages[0].text.includes('P26/04367'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
});

test('runtime slice asks for clarification honestly when the model requests it', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 33,
      message: {
        message_id: 330,
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
        text: 'facturas',
        date: 1_751_472_230,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport({
      tool_name: 'request_clarification',
      clarification: {
        missing: 'customer',
        reason: 'Falta el cliente para buscar el documento correcto.'
      }
    }),
    holdedFetch: buildHoldedFetch([], 'invoice')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.status, 'no_proposal');
  assert.equal(result.orchestration_outcome?.response.data?.kind, 'request_clarification');
  assert.equal(result.orchestration_outcome?.response.data?.missing, 'customer');
  assert.equal(result.orchestration_outcome?.response.data?.reason, 'Falta el cliente para buscar el documento correcto.');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].text, '¿De qué cliente?');
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.includes('no_proposal'), false);
});

test('runtime slice can read invoice payment-status lists and formats Telegram output safely', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 4,
      message: {
        message_id: 400,
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
        text: 'Necesito las facturas vencidas de Granapublic',
        date: 1_751_472_120,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport({ resource_type: 'invoice', payment_status: 'overdue' }),
    holdedFetch: buildHoldedFetch([], 'invoice')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  const responseData = result.orchestration_outcome?.response.data as
    | { kind?: string; payment_status?: string; aggregate?: { count?: number; paymentsPendingTotal?: number; totalAmount?: number } }
    | null
    | undefined;
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.payment_status, 'overdue');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.paymentsPendingTotal, 3600);
  assert.equal(responseData?.aggregate?.totalAmount, 3600);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('Facturas vencidas de Granapublic:'), true);
  assert.equal(sentMessages[0].text.includes('3 · 3600,00 € pendientes'), true);
  assert.equal(sentMessages[0].text.includes('F26/1931'), true);
  assert.equal(sentMessages[0].text.includes('F26/1932'), true);
  assert.equal(sentMessages[0].text.includes('F26/1930'), true);
  assert.equal(sentMessages[0].text.includes('vencida'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
});

test('runtime slice can read invoice payment-status lists without a customer and formats Telegram output safely', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 5,
      message: {
        message_id: 500,
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
        text: 'Necesito las facturas pendientes',
        date: 1_751_472_180,
        raw: null
      },
      raw: null
    }
  ]);

  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: buildQwenTransport({ resource_type: 'invoice', payment_status: 'pending', customer_id: null }),
    holdedFetch: buildHoldedFetch([], 'invoice')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  const responseData = result.orchestration_outcome?.response.data as
    | { kind?: string; payment_status?: string; aggregate?: { count?: number; paymentsPendingTotal?: number; totalAmount?: number } }
    | null
    | undefined;
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.payment_status, 'pending');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.paymentsPendingTotal, 3600);
  assert.equal(responseData?.aggregate?.totalAmount, 3600);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('Facturas pendientes de Granapublic:'), true);
  assert.equal(sentMessages[0].text.includes('3 · 3600,00 € pendientes'), true);
  assert.equal(sentMessages[0].text.includes('F26/1931'), true);
  assert.equal(sentMessages[0].text.includes('pendiente'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
});

test('runtime slice can read year-based invoice lists and converts year filters into Holded date ranges', () => {
  const telegramTransport = new InMemoryTelegramTransport();
  telegramTransport.seedUpdates([
    {
      update_id: 6,
      message: {
        message_id: 600,
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
        text: 'Necesito las facturas de 2024',
        date: 1_751_472_240,
        raw: null
      },
      raw: null
    }
  ]);

  const qwenCalls: Array<unknown> = [];
  const holdedCalls: Array<{ url: string; init?: RequestInit }> = [];
  const runtimeResult = startInstallationRuntime({
    rawConfig: buildInstallationConfig(),
    env: buildEnv(),
    telegramTransport,
    qwenTransport: {
      chatCompletions(request) {
        qwenCalls.push(request);
        return buildQwenTransport({ resource_type: 'invoice', year: '2024', customer_id: null }).chatCompletions(request);
      }
    },
    holdedFetch: buildHoldedFetch(holdedCalls, 'invoice')
  });

  assert.equal(runtimeResult.status, 'started');
  const runtime = runtimeResult.runtime;
  assert.ok(runtime);
  const [result] = runtime.pollOnce();
  const sentMessages = telegramTransport.listSentMessages();

  assert.equal(qwenCalls.length > 0, true);
  const qwenRequest = qwenCalls[0] as {
    messages?: Array<{ content?: string | null }>;
  };
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('year-based document lists'), true);
  assert.equal(qwenRequest.messages?.[0]?.content?.includes('do not compute date ranges or timestamps'), true);
  assert.equal(holdedCalls.length > 0, true);
  const requestUrl = new URL(holdedCalls[0].url);
  assert.equal(requestUrl.searchParams.get('starttmp'), '1704067200');
  assert.equal(requestUrl.searchParams.get('endtmp'), '1735689599');
  assert.equal(/^\d+$/.test(requestUrl.searchParams.get('starttmp') ?? ''), true);
  assert.equal(/^\d+$/.test(requestUrl.searchParams.get('endtmp') ?? ''), true);
  assert.equal(requestUrl.searchParams.get('starttmp')?.includes('T') ?? false, false);
  assert.equal(requestUrl.searchParams.get('endtmp')?.includes('T') ?? false, false);
  assert.equal(requestUrl.searchParams.get('starttmp')?.includes('-') ?? false, false);
  assert.equal(requestUrl.searchParams.get('endtmp')?.includes('-') ?? false, false);
  assert.equal(requestUrl.searchParams.get('starttmp')?.includes('.') ?? false, false);
  assert.equal(requestUrl.searchParams.get('endtmp')?.includes('.') ?? false, false);
  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  const responseData = result.orchestration_outcome?.response.data as
    | { kind?: string; lookup_mode?: string; year?: string; aggregate?: { count?: number; paymentsPendingTotal?: number; totalAmount?: number } }
    | null
    | undefined;
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.lookup_mode, 'by_year');
  assert.equal(responseData?.year, '2024');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.paymentsPendingTotal, 3600);
  assert.equal(responseData?.aggregate?.totalAmount, 3600);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('Facturas de 2024 de Granapublic:'), true);
  assert.equal(sentMessages[0].text.includes('3 · 3600,00 € facturado'), true);
  assert.equal(sentMessages[0].text.includes('F26/1931'), true);
  assert.equal(sentMessages[0].text.includes('Fuente:'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
});

test('runtime transport handles large Holded payloads without becoming unavailable', async () => {
  const body = JSON.stringify(buildLargeHoldedPayload());
  const transport = createNodeFetchHoldedTransport({
    baseUrl: 'data:',
    apiKey: 'holded-secret',
    timeoutMs: 120_000
  });
  const response = transport(`data:application/json;base64,${Buffer.from(body).toString('base64')}`);
  const text = response.text();
  const payload = response.json() as Array<{ estimate_id?: string }>;

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.equal(text.length > 1_000_000, true);
  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.estimate_id, 'estimate-000000');
  assert.equal(payload.at(-1)?.estimate_id, 'estimate-000000');
});

test('runtime slice fails closed for live-like installation changes without falling back to M1 fixtures', () => {
  const baseConfig = buildInstallationConfig();
  const missingOrganization = {
    ...structuredClone(baseConfig),
    organization: {
      ...baseConfig.organization,
      active: false
    }
  } satisfies RuntimeInstallationConfig;
  const missingPrincipal = {
    ...structuredClone(baseConfig),
    principals: []
  } satisfies RuntimeInstallationConfig;
  const missingScope = {
    ...structuredClone(baseConfig),
    principals: baseConfig.principals.map((principal) =>
      principal.principal_id === 'principal-gema-granapublic-live-test'
        ? {
            ...principal,
            scopes: []
          }
        : principal
    )
  } satisfies RuntimeInstallationConfig;
  const missingCapability = {
    ...structuredClone(baseConfig),
    active_capabilities: []
  } satisfies RuntimeInstallationConfig;

  const run = (config: RuntimeInstallationConfig, correlation_id: string) => {
    const telegramTransport = new InMemoryTelegramTransport();
    telegramTransport.seedUpdates([buildTelegramUpdate()]);
    const runtimeResult = startInstallationRuntime({
      rawConfig: config,
      env: buildEnv(),
      telegramTransport,
      qwenTransport: buildQwenTransport(),
      holdedFetch: buildHoldedFetch([])
    });
    assert.equal(runtimeResult.status, 'started');
    const [result] = runtimeResult.runtime?.pollOnce() ?? [];
    assert.ok(result);
    assert.equal(result.inbound_message?.message_id, '200');
    assert.equal(JSON.stringify(config).includes('org-acme'), false);
    assert.equal(JSON.stringify(config).includes('human-001'), false);
    return { result, correlation_id };
  };

  const orgResult = run(missingOrganization, 'runtime:org-inactive');
  const principalResult = run(missingPrincipal, 'runtime:principal-missing');
  const scopeResult = run(missingScope, 'runtime:scope-missing');
  const capabilityResult = run(missingCapability, 'runtime:capability-missing');

  assert.equal(orgResult.result.status, 'blocked');
  assert.equal(orgResult.result.orchestration_outcome, null);
  assert.equal(principalResult.result.status, 'sent');
  assert.equal(principalResult.result.orchestration_outcome?.response.status, 'denied');
  assert.equal(principalResult.result.orchestration_outcome?.response.response_source, 'workflow_blocked');
  assert.equal(scopeResult.result.status, 'sent');
  assert.equal(scopeResult.result.orchestration_outcome?.response.status, 'denied');
  assert.equal(scopeResult.result.orchestration_outcome?.response.response_source, 'workflow_blocked');
  assert.equal(capabilityResult.result.status, 'sent');
  assert.equal(capabilityResult.result.orchestration_outcome?.response.status, 'denied');
  assert.equal(capabilityResult.result.orchestration_outcome?.response.response_source, 'workflow_blocked');
});

test('runtime slice fails closed when a required module is missing', () => {
  const config = {
    ...buildInstallationConfig(),
    active_modules: ['telegram-channel', 'qwen-orchestrator'],
    active_capabilities: ['mock.resource.read']
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

test('runtime slice keeps conversation memory isolated per chat and persists it when configured', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-conversation-memory-'));
  const memoryFilePath = join(tempDir, 'conversation-memory.json');
  try {
    const config = buildInstallationConfig(memoryFilePath);
    config.identity_mappings.push({
      channel: 'telegram',
      telegram_user_id: '146574794',
      telegram_chat_id: '146574794',
      organization_id: 'org-granapublic-live-test',
      principal_id: 'principal-juan-granapublic-live-test',
      installation_id: 'install-granapublic-live-test',
      principal_type: 'human',
      active: true,
      display_name: 'Juan Granapublic Live Test'
    });

    const telegramTransport = new InMemoryTelegramTransport();
    telegramTransport.seedUpdates([
      {
        update_id: 50,
        message: {
          message_id: 500,
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
          text: 'Necesito el presupuesto de Granapublic',
          date: 1_751_472_500,
          raw: null
        },
        raw: null
      },
      {
        update_id: 51,
        message: {
          message_id: 501,
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
          text: '¿y el siguiente?',
          date: 1_751_472_560,
          raw: null
        },
        raw: null
      },
      {
        update_id: 52,
        message: {
          message_id: 502,
          chat: {
            id: 146574794,
            type: 'private'
          },
          from: {
            id: 146574794,
            username: 'juan-granapublic',
            first_name: 'Juan',
            last_name: 'Granapublic'
          },
          text: 'Necesito el presupuesto de Granapublic',
          date: 1_751_472_620,
          raw: null
        },
        raw: null
      }
    ]);

    const qwenCalls: Array<{ messages?: Array<{ role?: string; content?: string | null }> }> = [];
    const qwenTransport: QwenChatCompletionsTransport = {
      chatCompletions(request) {
        qwenCalls.push(structuredClone(request));
        return buildQwenTransport({ resource_type: 'estimate', customer_id: 'Granapublic' }).chatCompletions(request);
      }
    };

    const runtimeResult = startInstallationRuntime({
      rawConfig: config,
      env: buildEnv(),
      telegramTransport,
      qwenTransport,
      holdedFetch: buildHoldedFetch([], 'estimate')
    });

    assert.equal(runtimeResult.status, 'started');
    assert.ok(runtimeResult.runtime);
    const runtime = runtimeResult.runtime;
    const firstBatch = runtime.pollOnce();
    const secondBatch = runtime.pollOnce();
    const thirdBatch = runtime.pollOnce();

    assert.equal(firstBatch.length, 3);
    assert.equal(secondBatch.length, 0);
    assert.equal(thirdBatch.length, 0);
    assert.equal(qwenCalls.length, 3);
    assert.equal(qwenCalls[0].messages?.length, 2);
    assert.equal(qwenCalls[1].messages?.length, 4);
    assert.deepEqual(qwenCalls[1].messages?.map((message) => message.role), ['system', 'user', 'assistant', 'user']);
    assert.equal(qwenCalls[1].messages?.[1].content, 'Necesito el presupuesto de Granapublic');
    assert.equal(qwenCalls[1].messages?.[2].role, 'assistant');
    assert.equal((qwenCalls[1].messages?.[2].content?.length ?? 0) > 0, true);
    assert.equal(qwenCalls[2].messages?.length, 2);
    assert.deepEqual(qwenCalls[2].messages?.map((message) => message.role), ['system', 'user']);
    assert.equal(qwenCalls[2].messages?.[1].content, 'Necesito el presupuesto de Granapublic');
    assert.equal(existsSync(memoryFilePath), true);
    assert.equal(readFileSync(memoryFilePath, 'utf8').includes('install-granapublic-live-test'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});