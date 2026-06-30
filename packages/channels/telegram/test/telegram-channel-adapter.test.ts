import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGovernedWorkflowRuntime } from '../../../workflows/src/index';
import { InMemoryOrchestrationBoundary } from '../../../orchestration/src/index';
import { createMockOrchestrator } from '../../../orchestrators/mock/src/index';
import { createTelegramChannelAdapter, InMemoryTelegramTransport, type TelegramChannelAdapterOptions } from '../src/index';
import type { TelegramChannelUpdate } from '../../../contracts/src/index';

function buildUpdate(overrides: Partial<TelegramChannelUpdate> = {}): TelegramChannelUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 101,
      chat: {
        id: 'chat-acme',
        type: 'private'
      },
      from: {
        id: 'user-acme',
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
        telegram_user_id: 'user-acme',
        telegram_chat_id: 'chat-acme',
        organization_id: 'org-acme',
        principal_id: 'human-001',
        installation_id: 'telegram-installation',
        principal_type: 'human' as const,
        active: true,
        display_name: 'Acme Human'
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
        display_name: 'Secondary Acme Human'
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
          id: 'chat-foreign',
          type: 'private'
        },
        from: {
          id: 'user-foreign',
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
  assert.equal(results[0].organization_id, 'org-acme');
  assert.equal(results[0].principal_id, 'human-001');
  assert.equal(results[1].organization_id, 'org-acme');
  assert.equal(results[1].principal_id, 'human-001');
  assert.equal(results[0].orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(results[0].orchestration_outcome?.response.status, 'completed');
  assert.equal(results[1].orchestration_outcome?.response.status, 'completed');
  assert.equal(results[0].orchestration_outcome?.response.data?.estimate_id, 'estimate-123');
  assert.equal(JSON.stringify(results).includes('invented'), false);
  assert.equal(JSON.stringify(sentMessages).includes('telegram-secret-token'), false);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].text.includes('runtime completed'), true);
  assert.equal(sentMessages[0].text.includes('estimate-123'), true);
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
  assert.equal(sentMessages[0].text.includes('no_proposal'), true);
  assert.equal(JSON.stringify(sentMessages[0]).includes('invented'), false);
  assert.equal(records.some((record) => record.record_type === 'channel_orchestration_requested'), true);
});

test('Telegram adapter surfaces transport failures as error without leaking the token', () => {
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-30T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
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
