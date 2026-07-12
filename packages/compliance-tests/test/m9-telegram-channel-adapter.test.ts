import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import { InMemoryOrchestrationBoundary } from '../../orchestration/src/index';
import { createMockOrchestrator } from '../../orchestrators/mock/src/index';
import { createTelegramChannelAdapter, InMemoryTelegramTransport } from '../../channels/telegram/src/index';

function buildAdapter() {
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
        invented: true
      }
    }),
    installationCapabilities: {
      'telegram-installation': ['mock.resource.read']
    }
  });
  const transport = new InMemoryTelegramTransport();
  const adapter = createTelegramChannelAdapter({
    installation: {
      channel: 'telegram',
      installation_id: 'telegram-installation',
      active: true,
      bot_token: 'telegram-secret-token',
      identity_mappings: [
        {
          channel: 'telegram',
          telegram_user_id: '146574793',
          telegram_chat_id: '146574793',
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

  return { adapter, boundary, transport };
}

test('M9 keeps Telegram out of Core and remains offline/deterministic', () => {
  const coreSource = readFileSync('packages/core/src/index.ts', 'utf8');
  assert.equal(coreSource.includes('Telegram'), false);
  assert.equal(coreSource.includes('KERN_TELEGRAM_BOT_TOKEN'), false);

  const { adapter, boundary, transport } = buildAdapter();
  transport.seedUpdates([
    {
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
      raw: null
    }
  ]);

  const [result] = adapter.pollUpdates();
  const sentMessages = transport.listSentMessages();
  const records = boundary.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'sent');
  assert.equal(result.orchestration_outcome?.response.response_source, 'runtime_result');
  assert.equal(result.orchestration_outcome?.response.status, 'completed');
  assert.equal(result.inbound_message?.message_id, '101');
  assert.equal(result.inbound_message?.chat_id, '146574793');
  assert.equal(result.inbound_message?.user_id, '146574793');
  assert.equal(result.orchestration_outcome?.response.data?.estimate_id, 'estimate-123');
  assert.equal(JSON.stringify(result).includes('invented'), false);
  assert.equal(JSON.stringify(result).includes('telegram-secret-token'), false);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].parse_mode, undefined);
  assert.equal(sentMessages[0].text.includes('estimate-123'), true);
  assert.equal(sentMessages[0].text.includes('{'), false);
  assert.equal(sentMessages[0].text.length <= 3900, true);
  assert.equal(records.some((record) => record.record_type === 'channel_message_received'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_identity_resolved'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_orchestration_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_response_prepared'), true);
  assert.equal(records.some((record) => record.record_type === 'channel_message_sent'), true);
});
