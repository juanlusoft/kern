import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGovernedWorkflowRuntime } from '../../../workflows/src/index';
import { InMemoryOrchestrationBoundary } from '../../../orchestration/src/index';
import { createMockOrchestrator } from '../../../orchestrators/mock/src/index';
import {
  buildTelegramOutboundText,
  createTelegramChannelAdapter,
  InMemoryTelegramTransport,
  type TelegramChannelAdapterOptions
} from '../src/index';
import type { TelegramChannelUpdate } from '../../../contracts/src/index';

function buildUpdate(overrides: Partial<TelegramChannelUpdate> = {}): TelegramChannelUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 101,
      chat: {
        id: 146574793,
        type: 'private'
      },
      from: {
        id: 146574793,
        username: 'acme-user',
        first_name: 'Acme',
        last_name: 'User'
      },
      text: 'Necesito el presupuesto estimate-123 del cliente customer-001',
      date: 1751472000,
      raw: null
    },
    raw: null,
    ...overrides
  };
}

function buildAdapter(options: Partial<TelegramChannelAdapterOptions> = {}) {
  const runtime = new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-30T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator: createMockOrchestrator({
      now: () => new Date('2026-06-30T00:00:00.000Z'),
      unsafe_claimed_result: {
        estimate_id: 'invented'
      }
    }),
    installationCapabilities: {
      'telegram-installation': ['mock.resource.read', 'mock.email.send']
    }
  });
  const transport = new InMemoryTelegramTransport();
  const installation = {
    channel: 'telegram' as const,
    installation_id: 'telegram-installation',
    active: true,
    bot_token: 'telegram-secret-token',
    identity_mappings: [
      {
        channel: 'telegram' as const,
        telegram_user_id: '146574793',
        telegram_chat_id: '146574793',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        installation_id: 'telegram-installation',
        principal_type: 'human' as const,
        active: true,
        display_name: 'Acme Human'
      },
      {
        channel: 'telegram' as const,
        telegram_user_id: 'user-acme',
        telegram_chat_id: 'chat-acme',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        installation_id: 'telegram-installation',
        principal_type: 'human' as const,
        active: true,
        display_name: 'Acme Human Legacy'
      },
      {
        channel: 'telegram' as const,
        telegram_user_id: '146574794',
        telegram_chat_id: '146574794',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        installation_id: 'telegram-installation',
        principal_type: 'human' as const,
        active: true,
        display_name: 'Secondary Acme Human'
      },
      {
        channel: 'telegram' as const,
        telegram_user_id: 'user-foreign',
        telegram_chat_id: 'chat-foreign',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        installation_id: 'telegram-installation',
        principal_type: 'human' as const,
        active: true,
        display_name: 'Secondary Acme Human Legacy'
      }
    ]
  };

  return {
    adapter: createTelegramChannelAdapter({
      installation,
      orchestrationBoundary: boundary,
      transport,
      now: () => new Date('2026-06-30T00:00:00.000Z'),
      ...options
    }),
    transport,
    boundary
  };
}

test('Telegram adapter resolves Telegram identity and sends runtime-only responses through injected transport', () => {
  const { adapter, transport, boundary } = buildAdapter();
  transport.seedUpdates([
    buildUpdate(),
    {
      update_id: 2,
      message: {
        message_id: 102,
        chat: {
          id: 146574794,
          type: 'private'
        },
        from: {
          id: 146574794,
          username: 'foreign-user',
          first_name: 'Foreign',
          last_name: 'Agent'
        },
        text: 'enviar correo a foreign@example.com',
        date: 1751472060,
        raw: null
      },
      raw: null
    }
  ]);

  const results = adapter.pollUpdates();
  const sentMessages = transport.listSentMessages();
  const records = boundary.getEvidenceLedger().list();

  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'sent');
  assert.equal(results[1].status, 'sent');
  assert.equal(results[0].inbound_message?.message_id, '101');
  assert.equal(results[0].inbound_message?.chat_id, '146574793');
  assert.equal(results[0].inbound_message?.user_id, '146574793');
  assert.equal(results[0].organization_id, 'org-acme');
  assert.equal(results[0].principal_id, 'human-001');
  assert.equal(results[1].organization_id, 'org-acme');
  assert.equal(results[1].principal_id, 'human-001');
  assert.equal(results[0].orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(results[0].orchestration_outcome?.response.status, 'completed');
  assert.equal(results[1].orchestration_outcome?.response.status, 'blocked');
  assert.equal(results[0].orchestration_outcome?.response.data?.estimate_id, 'estimate-123');
  assert.equal(JSON.stringify(results).includes('invented'), false);
  assert.equal(JSON.stringify(sentMessages).includes('telegram-secret-token'), false);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('runtime completed'), false);
  assert.equal(sentMessages[0].text.includes('Último presupuesto'), true);
  assert.equal(sentMessages[0].text.includes('estimate-123'), true);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
  assert.equal(records.some((record) => record.record_type === 'channel_message_received'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_identity_resolved'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_orchestration_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_response_prepared'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_message_sent'), true);
});

test('Telegram adapter denies unknown identities and blocks inactive installations', () => {
  const { adapter, transport, boundary } = buildAdapter();

  const denied = adapter.handleInboundMessage({
    channel: 'telegram',
    message_id: '201',
    chat_id: 'chat-acme',
    user_id: 'unknown-user',
    text: 'presupuesto estimate-123',
    received_at: '2026-06-30T00:00:00.000Z',
    raw: null
  });
  const deniedRecords = boundary.getEvidenceLedger().listByCorrelation(denied.correlation_id);

  assert.equal(denied.status, 'denied');
  assert.equal(transport.listSentMessages().length, 0);
  assert.equal(deniedRecords.some((record) => record.record_type === 'channel_identity_denied'), true);

  const blockedTransport = new InMemoryTelegramTransport();
  const blockedBoundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-30T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      organization_id: 'org-acme',
      now: () => new Date('2026-06-30T00:00:00.000Z')
    }),
    orchestrator: createMockOrchestrator({
      now: () => new Date('2026-06-30T00:00:00.000Z')
    }),
    installationCapabilities: {
      'telegram-installation': ['mock.resource.read']
    }
  });
  const blockedAdapter = createTelegramChannelAdapter({
    installation: {
      channel: 'telegram',
      installation_id: 'telegram-installation',
      active: false,
      bot_token: 'telegram-secret-token',
      identity_mappings: []
    },
    orchestrationBoundary: blockedBoundary,
    transport: blockedTransport,
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const blocked = blockedAdapter.handleInboundMessage({
    channel: 'telegram',
    message_id: '202',
    chat_id: 'chat-acme',
    user_id: 'user-acme',
    text: 'presupuesto estimate-123',
    received_at: '2026-06-30T00:00:00.000Z',
    raw: null
  });
  const blockedRecords = blockedBoundary.getEvidenceLedger().listByCorrelation(blocked.correlation_id);

  assert.equal(blocked.status, 'blocked');
  assert.equal(blockedTransport.listSentMessages().length, 0);
  assert.equal(blockedRecords.some((record) => record.record_type === 'channel_message_blocked'), true);
});

test('Telegram adapter reports no proposal honestly and does not invent runtime data', () => {
  const { adapter, transport, boundary } = buildAdapter();

  const result = adapter.handleInboundMessage({
    channel: 'telegram',
    message_id: '301',
    chat_id: 'chat-acme',
    user_id: 'user-acme',
    text: 'hola',
    received_at: '2026-06-30T00:00:00.000Z',
    raw: null
  });
  const sentMessages = transport.listSentMessages();
  const records = boundary.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.status, 'no_proposal');
  assert.equal(result.orchestration_outcome?.response.message.includes('no puedo determinar'), true);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('no_proposal'), false);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(JSON.stringify(sentMessages[0]).includes('invented'), false);
  assert.equal(records.some((record) => record.record_type === 'channel_orchestration_requested'), true);
});

test('Telegram outbound text summarizes runtime results safely and truncates long payloads', () => {
  const completedOutcome = {
    request_id: 'telegram:req',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-safe',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: {
      workflow_id: 'wf-safe',
      workflow_kind: 'mock.estimate.read',
      organization_id: 'org-granapublic-live-test',
      correlation_id: 'corr-safe',
      turn_id: null,
      status: 'completed',
      response: {
        response_source: 'runtime_result',
        workflow_kind: 'mock.estimate.read',
        status: 'completed',
        message: 'estimate retrieved from runtime',
        data: {
          contactName: 'Granapublic Xx Sl',
          estimate_id: 'P26/04366',
          total_amount: 6.1,
          tax_amount: 1.26,
          currency: 'EUR',
          lookup_mode: 'by_customer',
          line_id: 'line_123',
          s_iva_21: 'yes'
        }
      },
      capability_result: {
        invocation_id: 'capability-invocation-1',
        capability_id: 'mock.resource.read',
        organization_id: 'org-granapublic-live-test',
        principal_id: 'principal-gema-granapublic-live-test',
        correlation_id: 'corr-safe',
        status: 'executed',
        runtime_decision: 'executed',
        binding_id: null,
        decision_binding_id: null,
        policy_decision_id: null,
        executed_by_runtime: true,
        output: {
          capability_id: 'mock.resource.read',
          status: 'executed',
          result: {
            status: 'found',
    data: {
      contactName: 'Granapublic Xx Sl',
      estimate_id: 'P26/04366',
      total_amount: 6.1,
      tax_amount: 1.26,
      currency: 'EUR',
              lookup_mode: 'by_customer',
              line_id: 'line_123',
              s_iva_21: 'yes'
            },
            source_evidence: [
              {
                source_id: 'source-1',
                source_type: 'document',
                source_system: 'Holded',
                resource_id: 'P26/04366',
                record_id: 'P26/04366',
                field_path: 'estimate',
                observed_at: '2026-06-30T00:00:00.000Z',
                correlation_id: 'corr-safe'
              }
            ],
            error: null
          },
          processed_at: '2026-06-30T00:00:00.000Z'
        },
        error: null,
        evidence_links: ['evidence-1'],
        created_at: '2026-06-30T00:00:00.000Z',
        evidence_reference: 'evidence-1',
        reason: 'ok'
      },
      evidence_links: ['evidence-1'],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      steps: [],
      evidence_trace: {
        evidence_ids: ['evidence-1'],
        record_types: ['workflow_response_created']
      }
    },
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'estimate retrieved from runtime',
      data: {
        contactName: 'Granapublic Xx Sl',
        estimate_id: 'P26/04366',
        total_amount: 6.1,
        tax_amount: 1.26,
        currency: 'EUR',
        lookup_mode: 'by_customer',
        line_id: 'line_123',
        s_iva_21: 'yes'
      }
    },
    evidence_links: ['evidence-1'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const safeText = buildTelegramOutboundText(completedOutcome);
  assert.equal(safeText.includes('Último presupuesto'), true);
  assert.equal(safeText.includes('P26/04366'), true);
  assert.equal(safeText.includes('6,10'), true);
  assert.equal(safeText.includes('IVA incl.'), true);
  assert.equal(safeText.includes('Fuente:'), false);
  assert.equal(safeText.includes('\n'), false);
  assert.equal(safeText.includes('{'), false);
  assert.equal(safeText.includes('line_id'), false);
  assert.equal(safeText.includes('s_iva_21'), false);
  assert.equal(safeText.includes('parse_mode'), false);

  const latestNEstimateOutcome = {
    request_id: 'telegram:req-estimate-latest-n',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-estimate-latest-n',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: {
      workflow_id: 'wf-estimate-latest-n',
      workflow_kind: 'mock.estimate.read',
      organization_id: 'org-granapublic-live-test',
      correlation_id: 'corr-estimate-latest-n',
      turn_id: null,
      status: 'completed',
      response: {
        response_source: 'runtime_result',
        workflow_kind: 'mock.estimate.read',
        status: 'completed',
        message: 'estimate list retrieved from runtime',
        data: {
          kind: 'list',
          result_mode: 'list',
          resource_type: 'estimate',
          payment_status: null,
          lookup_mode: 'latest_n',
          customer: 'Granapublic',
          records: [
            {
              estimate_id: 'P26/04368',
              docNumber: 'P26/04368',
              customer_name: 'Granapublic Xx Sl',
              total_amount: 2300,
              currency: 'EUR',
              source_system: 'Holded'
            },
            {
              estimate_id: 'P26/04367',
              docNumber: 'P26/04367',
              customer_name: 'Granapublic Xx Sl',
              total_amount: 2200,
              currency: 'EUR',
              source_system: 'Holded'
            }
          ],
          aggregate: {
            count: 2,
            paymentsPendingTotal: 0,
            totalAmount: 4500
          }
        }
      },
      capability_result: {
        invocation_id: 'capability-invocation-estimate-latest-n',
        capability_id: 'mock.resource.read',
        organization_id: 'org-granapublic-live-test',
        principal_id: 'principal-gema-granapublic-live-test',
        correlation_id: 'corr-estimate-latest-n',
        status: 'executed',
        runtime_decision: 'executed',
        binding_id: null,
        decision_binding_id: null,
        policy_decision_id: null,
        executed_by_runtime: true,
        output: {
          capability_id: 'mock.resource.read',
          status: 'executed',
          result: {
            status: 'found',
            data: {
              kind: 'list',
              result_mode: 'list',
              resource_type: 'estimate',
              payment_status: null,
              lookup_mode: 'latest_n',
              customer: 'Granapublic',
              records: [
                {
                  estimate_id: 'P26/04368',
                  docNumber: 'P26/04368',
                  customer_name: 'Granapublic Xx Sl',
                  total_amount: 2300,
                  currency: 'EUR',
                  source_system: 'Holded'
                },
                {
                  estimate_id: 'P26/04367',
                  docNumber: 'P26/04367',
                  customer_name: 'Granapublic Xx Sl',
                  total_amount: 2200,
                  currency: 'EUR',
                  source_system: 'Holded'
                }
              ],
              aggregate: {
                count: 2,
                paymentsPendingTotal: 0,
                totalAmount: 4500
              },
              source_evidence: [
                {
                  source_id: 'source-estimate-latest-n',
                  source_type: 'document',
                  source_system: 'Holded',
                  resource_id: 'P26/04368',
                  record_id: 'P26/04368',
                  field_path: 'estimate',
                  observed_at: '2026-06-30T00:00:00.000Z',
                  correlation_id: 'corr-estimate-latest-n'
                }
              ],
              error: null
            },
            processed_at: '2026-06-30T00:00:00.000Z'
          },
          processed_at: '2026-06-30T00:00:00.000Z'
        },
        error: null,
        evidence_links: ['evidence-estimate-latest-n'],
        created_at: '2026-06-30T00:00:00.000Z',
        evidence_reference: 'evidence-estimate-latest-n',
        reason: 'ok'
      },
      evidence_links: ['evidence-estimate-latest-n'],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      steps: [],
      evidence_trace: {
        evidence_ids: ['evidence-estimate-latest-n'],
        record_types: ['workflow_response_created']
      }
    },
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'estimate list retrieved from runtime',
      data: {
        kind: 'list',
        result_mode: 'list',
        resource_type: 'estimate',
        payment_status: null,
        lookup_mode: 'latest_n',
        customer: 'Granapublic',
        records: [
          {
            estimate_id: 'P26/04368',
            docNumber: 'P26/04368',
            customer_name: 'Granapublic Xx Sl',
            total_amount: 2300,
            currency: 'EUR',
            source_system: 'Holded'
          },
          {
            estimate_id: 'P26/04367',
            docNumber: 'P26/04367',
            customer_name: 'Granapublic Xx Sl',
            total_amount: 2200,
            currency: 'EUR',
            source_system: 'Holded'
          }
        ],
        aggregate: {
          count: 2,
          paymentsPendingTotal: 0,
          totalAmount: 4500
        }
      }
    },
    evidence_links: ['evidence-estimate-latest-n'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const latestNEstimateText = buildTelegramOutboundText(latestNEstimateOutcome);
  assert.equal(latestNEstimateText.includes('Últimos 2 presupuestos de Granapublic:'), true);
  assert.equal(latestNEstimateText.includes('2 · 4500,00 € presupuestado'), true);
  assert.equal(latestNEstimateText.includes('P26/04368'), true);
  assert.equal(latestNEstimateText.includes('Fuente:'), false);
  assert.equal(latestNEstimateText.includes('{'), false);
  assert.equal(latestNEstimateText.includes('parse_mode'), false);

  const longOutcome = {
    request_id: 'telegram:req-long',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-long',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: null,
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'estimate retrieved from runtime',
      data: {
        contactName: `Granapublic ${'X'.repeat(5000)}`,
        estimate_id: 'P26/04366',
        total_amount: 6.1,
        currency: 'EUR',
        lookup_mode: 'by_customer'
      }
    },
    evidence_links: ['evidence-1'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const truncatedText = buildTelegramOutboundText(longOutcome);
  assert.equal(truncatedText.length <= 3900, true);
  assert.equal(truncatedText.endsWith('… [respuesta resumida]'), true);
});

test('Telegram outbound text formats invoice results safely and keeps runtime-only content', () => {
  const invoiceOutcome = {
    request_id: 'telegram:req-invoice',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-invoice',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: {
      workflow_id: 'wf-invoice',
      workflow_kind: 'mock.estimate.read',
      organization_id: 'org-granapublic-live-test',
      correlation_id: 'corr-invoice',
      turn_id: null,
      status: 'completed',
      response: {
        response_source: 'runtime_result',
        workflow_kind: 'mock.estimate.read',
        status: 'completed',
        message: 'invoice retrieved from runtime',
        data: {
          contactName: 'Granapublic Xx Sl',
          customer: 'Petroprix',
          resource_type: 'invoice',
          source_system: 'Holded',
          invoice_id: 'F26/1931',
          docNumber: 'F26/1931',
          products: [{ name: 'MUPIS PAPEL' }],
          total_amount: 6.1,
          tax_amount: 1.26,
          currency: 'EUR',
          lookup_mode: 'by_customer',
          line_id: 'line_456',
          raw: { hidden: true }
        }
      },
      capability_result: null,
      evidence_links: ['evidence-2'],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      steps: [],
      evidence_trace: {
        evidence_ids: ['evidence-2'],
        record_types: ['workflow_response_created']
      }
    },
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'invoice retrieved from runtime',
    data: {
      contactName: 'Granapublic Xx Sl',
      customer: 'Petroprix',
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1931',
        docNumber: 'F26/1931',
        products: [{ name: 'MUPIS PAPEL' }],
        total_amount: 6.1,
        tax_amount: 1.26,
        currency: 'EUR',
        lookup_mode: 'by_customer',
        line_id: 'line_456',
        raw: { hidden: true }
      }
    },
    evidence_links: ['evidence-2'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const safeText = buildTelegramOutboundText(invoiceOutcome);
  assert.equal(safeText.includes('Última factura de Petroprix (F26/1931):'), true);
  assert.equal(safeText.includes('MUPIS PAPEL'), true);
  assert.equal(safeText.includes('6,10 € IVA incl.'), true);
  assert.equal(safeText.includes('Fuente:'), false);
  assert.equal(safeText.includes('\n'), false);
  assert.equal(safeText.includes('{'), false);
  assert.equal(safeText.includes('line_id'), false);
  assert.equal(safeText.includes('raw'), false);
  assert.equal(safeText.includes('parse_mode'), false);
  assert.equal(safeText.includes('raw'), false);
  assert.equal(safeText.includes('parse_mode'), false);
});

test('Telegram outbound text deduplicates repeated products in document summaries', () => {
  const duplicatedProductsOutcome = {
    request_id: 'telegram:req-duplicated-products',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-duplicated-products',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: null,
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'estimate retrieved from runtime',
      data: {
        contactName: 'Granapublic Xx Sl',
        estimate_id: 'P26/04368',
        products: [{ name: 'Lona Frontlit 510gr' }, { name: 'Lona Frontlit 510gr' }],
        total_amount: 41.14,
        currency: 'EUR',
        lookup_mode: 'by_customer'
      }
    },
    evidence_links: ['evidence-dup'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const safeText = buildTelegramOutboundText(duplicatedProductsOutcome);
  assert.equal(safeText.includes('Lona Frontlit 510gr'), true);
  assert.equal((safeText.match(/Lona Frontlit 510gr/g) || []).length, 1);
  assert.equal(safeText.includes('Fuente:'), false);
  assert.equal(safeText.includes('\n'), false);
});

test('Telegram outbound text formats invoice lists safely and summarizes aggregate status', () => {
  const listOutcome = {
    request_id: 'telegram:req-invoice-list',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-invoice-list',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: {
      workflow_id: 'wf-invoice-list',
      workflow_kind: 'mock.estimate.read',
      organization_id: 'org-granapublic-live-test',
      correlation_id: 'corr-invoice-list',
      turn_id: null,
      status: 'completed',
      response: {
        response_source: 'runtime_result',
        workflow_kind: 'mock.estimate.read',
        status: 'completed',
        message: 'invoice list retrieved from runtime',
        data: {
          kind: 'list',
          result_mode: 'list',
          resource_type: 'invoice',
          payment_status: 'overdue',
          lookup_mode: 'by_customer',
          records: [
            {
              invoice_id: 'F26/1931',
              docNumber: 'F26/1931',
              customer_name: 'Granapublic Xx Sl',
              products: [{ name: 'MUPIS PAPEL' }],
              paymentsPending: 1200,
              dueDate: '2024-07-03T00:00:00.000Z',
              total_amount: 1200,
              currency: 'EUR',
              source_system: 'Holded'
            },
            {
              invoice_id: 'F26/1932',
              docNumber: 'F26/1932',
              customer_name: 'Granapublic Xx Sl',
              paymentsPending: 1300,
              dueDate: '2024-07-02T00:00:00.000Z',
              total_amount: 1300,
              currency: 'EUR',
              source_system: 'Holded'
            },
            {
              invoice_id: 'F26/1930',
              docNumber: 'F26/1930',
              customer_name: 'Granapublic Xx Sl',
              paymentsPending: 1100,
              dueDate: '2024-03-09T00:00:00.000Z',
              total_amount: 1100,
              currency: 'EUR',
              source_system: 'Holded'
            }
          ],
          aggregate: {
            count: 3,
            paymentsPendingTotal: 3600
          }
        }
      },
      capability_result: {
        invocation_id: 'capability-invocation-2',
        capability_id: 'mock.resource.read',
        organization_id: 'org-granapublic-live-test',
        principal_id: 'principal-gema-granapublic-live-test',
        correlation_id: 'corr-invoice-list',
        status: 'executed',
        runtime_decision: 'executed',
        binding_id: null,
        decision_binding_id: null,
        policy_decision_id: null,
        executed_by_runtime: true,
        output: {
          capability_id: 'mock.resource.read',
          status: 'executed',
          result: {
            status: 'found',
            data: {
              kind: 'list',
              result_mode: 'list',
              resource_type: 'invoice',
              payment_status: 'overdue',
              lookup_mode: 'by_customer',
              records: [
                {
                  invoice_id: 'F26/1931',
                  docNumber: 'F26/1931',
                  customer_name: 'Granapublic Xx Sl',
                  products: [{ name: 'MUPIS PAPEL' }],
                  paymentsPending: 1200,
                  dueDate: '2024-07-03T00:00:00.000Z',
                  total_amount: 1200,
                  currency: 'EUR',
                  source_system: 'Holded'
                },
                {
                  invoice_id: 'F26/1932',
                  docNumber: 'F26/1932',
                  customer_name: 'Granapublic Xx Sl',
                  paymentsPending: 1300,
                  dueDate: '2024-07-02T00:00:00.000Z',
                  total_amount: 1300,
                  currency: 'EUR',
                  source_system: 'Holded'
                },
                {
                  invoice_id: 'F26/1930',
                  docNumber: 'F26/1930',
                  customer_name: 'Granapublic Xx Sl',
                  paymentsPending: 1100,
                  dueDate: '2024-03-09T00:00:00.000Z',
                  total_amount: 1100,
                  currency: 'EUR',
                  source_system: 'Holded'
                }
              ],
              aggregate: {
                count: 3,
                paymentsPendingTotal: 3600
              },
              source_evidence: [
                {
                  source_id: 'source-2',
                  source_type: 'document',
                  source_system: 'Holded',
                  resource_id: 'F26/1931',
                  record_id: 'F26/1931',
                  field_path: 'invoice',
                  observed_at: '2026-06-30T00:00:00.000Z',
                  correlation_id: 'corr-invoice-list'
                }
              ],
              error: null
            },
            processed_at: '2026-06-30T00:00:00.000Z'
          },
          processed_at: '2026-06-30T00:00:00.000Z'
        },
        error: null,
        evidence_links: ['evidence-3'],
        created_at: '2026-06-30T00:00:00.000Z',
        evidence_reference: 'evidence-3',
        reason: 'ok'
      },
      evidence_links: ['evidence-3'],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      steps: [],
      evidence_trace: {
        evidence_ids: ['evidence-3'],
        record_types: ['workflow_response_created']
      }
    },
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'invoice list retrieved from runtime',
      data: {
        kind: 'list',
        result_mode: 'list',
        resource_type: 'invoice',
        payment_status: 'overdue',
        lookup_mode: 'by_customer',
        records: [
          {
            invoice_id: 'F26/1931',
            docNumber: 'F26/1931',
            customer_name: 'Granapublic Xx Sl',
            products: [{ name: 'MUPIS PAPEL' }],
            paymentsPending: 1200,
            dueDate: '2024-07-03T00:00:00.000Z',
            total_amount: 1200,
            currency: 'EUR',
            source_system: 'Holded'
          },
          {
            invoice_id: 'F26/1932',
            docNumber: 'F26/1932',
            customer_name: 'Granapublic Xx Sl',
            paymentsPending: 1300,
            dueDate: '2024-07-02T00:00:00.000Z',
            total_amount: 1300,
            currency: 'EUR',
            source_system: 'Holded'
          },
          {
            invoice_id: 'F26/1930',
            docNumber: 'F26/1930',
            customer_name: 'Granapublic Xx Sl',
            paymentsPending: 1100,
            dueDate: '2024-03-09T00:00:00.000Z',
            total_amount: 1100,
            currency: 'EUR',
            source_system: 'Holded'
          }
        ],
        aggregate: {
          count: 3,
          paymentsPendingTotal: 3600
        }
      }
    },
    evidence_links: ['evidence-3'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const safeText = buildTelegramOutboundText(listOutcome);
  assert.equal(safeText.includes('Facturas vencidas:'), true);
  assert.equal(safeText.includes('3 · 3600,00 € pendientes'), true);
  assert.equal(safeText.includes('F26/1931'), true);
  assert.equal(safeText.includes('MUPIS PAPEL'), true);
  assert.equal(safeText.includes('vencida'), true);
  assert.equal(safeText.includes('Fuente:'), false);
  assert.equal(safeText.includes('{'), false);
  assert.equal(safeText.includes('parse_mode'), false);
});

test('Telegram outbound text formats latest N invoice lists safely', () => {
  const latestNOutcome = {
    request_id: 'telegram:req-invoice-latest-n',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-invoice-latest-n',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: {
      workflow_id: 'wf-invoice-latest-n',
      workflow_kind: 'mock.estimate.read',
      organization_id: 'org-granapublic-live-test',
      correlation_id: 'corr-invoice-latest-n',
      turn_id: null,
      status: 'completed',
      response: {
        response_source: 'runtime_result',
        workflow_kind: 'mock.estimate.read',
        status: 'completed',
        message: 'invoice list retrieved from runtime',
        data: {
          kind: 'list',
          result_mode: 'list',
          resource_type: 'invoice',
          payment_status: null,
          lookup_mode: 'latest_n',
          customer: 'Granapublic',
          records: [
            {
              invoice_id: 'F26/1932',
              docNumber: 'F26/1932',
              customer_name: 'Granapublic Xx Sl',
              total_amount: 1300,
              currency: 'EUR',
              source_system: 'Holded'
            },
            {
              invoice_id: 'F26/1931',
              docNumber: 'F26/1931',
              customer_name: 'Granapublic Xx Sl',
              products: [{ name: 'MUPIS PAPEL' }],
              total_amount: 1200,
              currency: 'EUR',
              source_system: 'Holded'
            },
            {
              invoice_id: 'F26/1930',
              docNumber: 'F26/1930',
              customer_name: 'Granapublic Xx Sl',
              total_amount: 1100,
              currency: 'EUR',
              source_system: 'Holded'
            }
          ],
          aggregate: {
            count: 3,
            paymentsPendingTotal: 0,
            totalAmount: 3600
          }
        }
      },
      capability_result: {
        invocation_id: 'capability-invocation-latest-n',
        capability_id: 'mock.resource.read',
        organization_id: 'org-granapublic-live-test',
        principal_id: 'principal-gema-granapublic-live-test',
        correlation_id: 'corr-invoice-latest-n',
        status: 'executed',
        runtime_decision: 'executed',
        binding_id: null,
        decision_binding_id: null,
        policy_decision_id: null,
        executed_by_runtime: true,
        output: {
          capability_id: 'mock.resource.read',
          status: 'executed',
          result: {
            status: 'found',
            data: {
              kind: 'list',
              result_mode: 'list',
              resource_type: 'invoice',
              payment_status: null,
              lookup_mode: 'latest_n',
              customer: 'Granapublic',
              records: [
                {
                  invoice_id: 'F26/1932',
                  docNumber: 'F26/1932',
                  customer_name: 'Granapublic Xx Sl',
                  total_amount: 1300,
                  currency: 'EUR',
                  source_system: 'Holded'
                },
                {
                  invoice_id: 'F26/1931',
                  docNumber: 'F26/1931',
                  customer_name: 'Granapublic Xx Sl',
                  products: [{ name: 'MUPIS PAPEL' }],
                  total_amount: 1200,
                  currency: 'EUR',
                  source_system: 'Holded'
                },
                {
                  invoice_id: 'F26/1930',
                  docNumber: 'F26/1930',
                  customer_name: 'Granapublic Xx Sl',
                  total_amount: 1100,
                  currency: 'EUR',
                  source_system: 'Holded'
                }
              ],
              aggregate: {
                count: 3,
                paymentsPendingTotal: 0,
                totalAmount: 3600
              },
              source_evidence: [
                {
                  source_id: 'source-latest-n',
                  source_type: 'document',
                  source_system: 'Holded',
                  resource_id: 'F26/1932',
                  record_id: 'F26/1932',
                  field_path: 'invoice',
                  observed_at: '2026-06-30T00:00:00.000Z',
                  correlation_id: 'corr-invoice-latest-n'
                }
              ],
              error: null
            },
            processed_at: '2026-06-30T00:00:00.000Z'
          },
          processed_at: '2026-06-30T00:00:00.000Z'
        },
        error: null,
        evidence_links: ['evidence-latest-n'],
        created_at: '2026-06-30T00:00:00.000Z',
        evidence_reference: 'evidence-latest-n',
        reason: 'ok'
      },
      evidence_links: ['evidence-latest-n'],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      steps: [],
      evidence_trace: {
        evidence_ids: ['evidence-latest-n'],
        record_types: ['workflow_response_created']
      }
    },
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'invoice list retrieved from runtime',
      data: {
        kind: 'list',
        result_mode: 'list',
        resource_type: 'invoice',
        payment_status: null,
        lookup_mode: 'latest_n',
        customer: 'Granapublic',
        records: [
          {
            invoice_id: 'F26/1932',
            docNumber: 'F26/1932',
            customer_name: 'Granapublic Xx Sl',
            total_amount: 1300,
            currency: 'EUR',
            source_system: 'Holded'
          },
          {
            invoice_id: 'F26/1931',
            docNumber: 'F26/1931',
            customer_name: 'Granapublic Xx Sl',
            products: [{ name: 'MUPIS PAPEL' }],
            total_amount: 1200,
            currency: 'EUR',
            source_system: 'Holded'
          },
          {
            invoice_id: 'F26/1930',
            docNumber: 'F26/1930',
            customer_name: 'Granapublic Xx Sl',
            total_amount: 1100,
            currency: 'EUR',
            source_system: 'Holded'
          }
        ],
        aggregate: {
          count: 3,
          paymentsPendingTotal: 0,
          totalAmount: 3600
        }
      }
    },
    evidence_links: ['evidence-latest-n'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const safeText = buildTelegramOutboundText(latestNOutcome);
  assert.equal(safeText.includes('Últimas 3 facturas de Granapublic:'), true);
  assert.equal(safeText.includes('3 · 3600,00 € facturado'), true);
  assert.equal(safeText.includes('F26/1932'), true);
  assert.equal(safeText.includes('Fuente:'), false);
  assert.equal(safeText.includes('{'), false);
  assert.equal(safeText.includes('parse_mode'), false);
});

test('Telegram outbound text formats year-based invoice lists safely', () => {
  const listOutcome = {
    request_id: 'telegram:req-invoice-year-list',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-invoice-year-list',
    installation_id: 'telegram-installation',
    status: 'proposal',
    proposal: null,
    validation: null,
    workflow_kind: 'mock.estimate.read',
    workflow_result: {
      workflow_id: 'wf-invoice-year-list',
      workflow_kind: 'mock.estimate.read',
      organization_id: 'org-granapublic-live-test',
      correlation_id: 'corr-invoice-year-list',
      turn_id: null,
      status: 'completed',
      response: {
        response_source: 'runtime_result',
        workflow_kind: 'mock.estimate.read',
        status: 'completed',
        message: 'invoice year list retrieved from runtime',
        data: {
          kind: 'list',
          result_mode: 'list',
          resource_type: 'invoice',
          payment_status: null,
          lookup_mode: 'by_year',
          year: '2024',
          records: [
            {
              invoice_id: 'F26/1931',
              docNumber: 'F26/1931',
              customer_name: 'Granapublic Xx Sl',
              products: [{ name: 'MUPIS PAPEL' }],
              paymentsPending: 1200,
              dueDate: '2024-07-03T00:00:00.000Z',
              total_amount: 1200,
              currency: 'EUR',
              source_system: 'Holded'
            }
          ],
          aggregate: {
            count: 1,
            paymentsPendingTotal: 1200,
            totalAmount: 1200
          }
        }
      },
      capability_result: {
        invocation_id: 'capability-invocation-4',
        capability_id: 'mock.resource.read',
        organization_id: 'org-granapublic-live-test',
        principal_id: 'principal-gema-granapublic-live-test',
        correlation_id: 'corr-invoice-year-list',
        status: 'executed',
        runtime_decision: 'executed',
        binding_id: null,
        decision_binding_id: null,
        policy_decision_id: null,
        executed_by_runtime: true,
        output: {
          capability_id: 'mock.resource.read',
          status: 'executed',
          result: {
            status: 'found',
            data: {
              kind: 'list',
              result_mode: 'list',
              resource_type: 'invoice',
              payment_status: null,
              lookup_mode: 'by_year',
              year: '2024',
              records: [
                {
                  invoice_id: 'F26/1931',
                  docNumber: 'F26/1931',
                  customer_name: 'Granapublic Xx Sl',
                  products: [{ name: 'MUPIS PAPEL' }],
                  paymentsPending: 1200,
                  dueDate: '2024-07-03T00:00:00.000Z',
                  total_amount: 1200,
                  currency: 'EUR',
                  source_system: 'Holded'
                }
              ],
              aggregate: {
                count: 1,
                paymentsPendingTotal: 1200,
                totalAmount: 1200
              },
              source_evidence: [
                {
                  source_id: 'source-4',
                  source_type: 'document',
                  source_system: 'Holded',
                  resource_id: 'F26/1931',
                  record_id: 'F26/1931',
                  field_path: 'invoice',
                  observed_at: '2026-06-30T00:00:00.000Z',
                  correlation_id: 'corr-invoice-year-list'
                }
              ],
              error: null
            },
            processed_at: '2026-06-30T00:00:00.000Z'
          },
          processed_at: '2026-06-30T00:00:00.000Z'
        },
        error: null,
        evidence_links: ['evidence-4'],
        created_at: '2026-06-30T00:00:00.000Z',
        evidence_reference: 'evidence-4',
        reason: 'ok'
      },
      evidence_links: ['evidence-4'],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      steps: [],
      evidence_trace: {
        evidence_ids: ['evidence-4'],
        record_types: ['workflow_response_created']
      }
    },
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'mock.estimate.read',
      status: 'completed',
      message: 'invoice year list retrieved from runtime',
      data: {
        kind: 'list',
        result_mode: 'list',
        resource_type: 'invoice',
        payment_status: null,
        lookup_mode: 'by_year',
        year: '2024',
        records: [
          {
            invoice_id: 'F26/1931',
            docNumber: 'F26/1931',
            customer_name: 'Granapublic Xx Sl',
            products: [{ name: 'MUPIS PAPEL' }],
            paymentsPending: 1200,
            dueDate: '2024-07-03T00:00:00.000Z',
            total_amount: 1200,
            currency: 'EUR',
            source_system: 'Holded'
          }
        ],
        aggregate: {
          count: 1,
          paymentsPendingTotal: 1200,
          totalAmount: 1200
        }
      }
    },
    evidence_links: ['evidence-4'],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'ok'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0];

  const safeText = buildTelegramOutboundText(listOutcome);
  assert.equal(safeText.includes('Facturas de 2024:'), true);
  assert.equal(safeText.includes('1 · 1200,00 € facturado'), true);
  assert.equal(safeText.includes('F26/1931'), true);
  assert.equal(safeText.includes('MUPIS PAPEL'), true);
  assert.equal(safeText.includes('Fuente:'), false);
  assert.equal(safeText.includes('{'), false);
  assert.equal(safeText.includes('parse_mode'), false);
});

test('Telegram outbound text reports runtime failure states honestly', () => {
  const cases = [
    {
      status: 'not_found',
      message: 'estimate not found',
      expected: 'No he encontrado resultados para esa consulta.'
    },
    {
      status: 'unavailable',
      message: 'estimate service unavailable',
      expected: 'El servicio necesario no está disponible ahora mismo. Inténtalo de nuevo más tarde.'
    },
    {
      status: 'error',
      message: 'estimate runtime error',
      expected: 'Ha habido un problema técnico al procesar la consulta. Inténtalo de nuevo.'
    },
    {
      status: 'denied',
      message: 'estimate denied',
      expected: 'Esa consulta no está disponible en esta instalación.'
    },
    {
      status: 'blocked',
      message: 'estimate blocked',
      expected: 'Esa consulta no está disponible en esta instalación.'
    },
    {
      status: 'no_proposal',
      message: 'no proposal',
      expected: 'No tengo suficiente contexto para responder. Indica qué necesitas y aporta los datos relevantes.'
    }
  ] as const;

  for (const testCase of cases) {
    const text = buildTelegramOutboundText({
      request_id: 'telegram:req-failure',
      organization_id: 'org-granapublic-live-test',
      principal_id: 'principal-gema-granapublic-live-test',
      correlation_id: 'corr-failure',
      installation_id: 'telegram-installation',
      status: 'proposal',
      proposal: null,
      validation: null,
      workflow_kind: 'mock.estimate.read',
      workflow_result: null,
      response: {
        response_source: 'workflow_blocked',
        workflow_kind: 'mock.estimate.read',
        status: testCase.status,
        message: testCase.message,
        data: null
      },
      evidence_links: [],
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
      reason: testCase.message
    } as unknown as Parameters<typeof buildTelegramOutboundText>[0]);

    assert.equal(text, testCase.expected);
    assert.equal(text.includes('{'), false);
    assert.equal(text.includes('parse_mode'), false);
    assert.equal(/Holded|facturas?|presupuestos?/i.test(text), false);
    if (testCase.status === 'error') {
      assert.equal(text.includes('runtime'), false);
    }
  }
});

test('Telegram outbound text uses structured clarification reasons when available', () => {
  const text = buildTelegramOutboundText({
    request_id: 'telegram:req-clarification',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-clarification',
    installation_id: 'telegram-installation',
    status: 'no_proposal',
    proposal: null,
    validation: null,
    workflow_kind: null,
    workflow_result: null,
    response: {
      response_source: 'workflow_blocked',
      workflow_kind: null,
      status: 'no_proposal',
      message: 'Falta el cliente para buscar el documento correcto.',
      data: {
        kind: 'request_clarification',
        missing: 'customer',
        reason: 'Falta el cliente para buscar el documento correcto.'
      }
    },
    evidence_links: [],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'Falta el cliente para buscar el documento correcto.'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0]);

  assert.equal(text, '¿De qué cliente?');
  assert.equal(text.includes('{'), false);
  assert.equal(text.includes('parse_mode'), false);
});

test('Telegram renders unsupported clarifications without advertising capabilities from another installation', () => {
  const text = buildTelegramOutboundText({
    request_id: 'telegram:req-unsupported',
    organization_id: 'org-acme',
    principal_id: 'principal-acme',
    correlation_id: 'corr-unsupported',
    installation_id: 'telegram-installation',
    status: 'no_proposal',
    proposal: null,
    validation: null,
    workflow_kind: null,
    workflow_result: null,
    response: {
      response_source: 'workflow_blocked',
      workflow_kind: null,
      status: 'no_proposal',
      message: 'unsupported capability',
      data: {
        kind: 'request_clarification',
        missing: 'unsupported',
        reason: 'unsupported capability'
      }
    },
    evidence_links: [],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: 'unsupported capability'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0]);

  assert.equal(text, 'Esa consulta no está disponible en esta instalación.');
  assert.equal(/Holded|facturas?|presupuestos?/i.test(text), false);
});

test('Telegram adapter surfaces transport failures as error without leaking the token', () => {
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-30T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      organization_id: 'org-acme',
      now: () => new Date('2026-06-30T00:00:00.000Z')
    }),
    orchestrator: createMockOrchestrator({
      now: () => new Date('2026-06-30T00:00:00.000Z')
    }),
    installationCapabilities: {
      'telegram-installation': ['mock.resource.read']
    }
  });
  const transport = {
    getUpdates: () => [],
    sendMessage() {
      throw new Error('send failed');
    }
  };
  const adapter = createTelegramChannelAdapter({
    installation: {
      channel: 'telegram',
      installation_id: 'telegram-installation',
      active: true,
      bot_token: 'telegram-secret-token',
      identity_mappings: [
        {
          channel: 'telegram',
          telegram_user_id: 'user-acme',
          telegram_chat_id: 'chat-acme',
          organization_id: 'org-acme',
          principal_id: 'human-001',
          installation_id: 'telegram-installation',
          principal_type: 'human',
          active: true
        }
      ]
    },
    orchestrationBoundary: boundary,
    transport,
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const result = adapter.handleInboundMessage({
    channel: 'telegram',
    message_id: '401',
    chat_id: 'chat-acme',
    user_id: 'user-acme',
    text: 'presupuesto estimate-123',
    received_at: '2026-06-30T00:00:00.000Z',
    raw: null
  });

  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'send failed');
  assert.equal(JSON.stringify(result).includes('telegram-secret-token'), false);
  assert.equal(boundary.getEvidenceLedger().listByCorrelation(result.correlation_id).some((record) => record.record_type === 'channel_message_send_error'), true);
});

test('Telegram outbound text uses pricing clarifications as a human question', () => {
  const text = buildTelegramOutboundText({
    request_id: 'telegram:req-pricing-clarification',
    organization_id: 'org-granapublic-live-test',
    principal_id: 'principal-gema-granapublic-live-test',
    correlation_id: 'corr-pricing-clarification',
    installation_id: 'telegram-installation',
    status: 'no_proposal',
    proposal: null,
    validation: null,
    workflow_kind: null,
    workflow_result: null,
    response: {
      response_source: 'workflow_blocked',
      workflow_kind: null,
      status: 'no_proposal',
      message: '¿Qué quieres presupuestar?',
      data: {
        kind: 'request_clarification',
        missing: 'pricing',
        reason: '¿Qué quieres presupuestar?'
      }
    },
    evidence_links: [],
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    reason: '¿Qué quieres presupuestar?'
  } as unknown as Parameters<typeof buildTelegramOutboundText>[0]);

  assert.equal(text, '¿Qué quieres presupuestar?');
  assert.equal(text.includes('{'), false);
  assert.equal(text.includes('parse_mode'), false);
});
