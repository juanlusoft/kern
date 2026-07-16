import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildLearningShadowRecord,
  createLearningShadowRecorder,
  type RuntimeLearningShadowConfig
} from '../src/index';
import type { ChannelMessageResult } from '../../contracts/src/index';

function buildChannelResult(): ChannelMessageResult {
  return {
    channel: 'telegram',
    status: 'sent',
    reason: 'completed',
    correlation_id: 'telegram:install-pacoprint:chat-1:msg-1',
    inbound_message: {
      channel: 'telegram',
      message_id: 'msg-1',
      chat_id: 'chat-1',
      user_id: 'user-1',
      text: 'Necesito precio de dibond 70x50 sin laminado',
      received_at: '2026-07-16T09:00:00.000Z'
    },
    outbound_message: {
      channel: 'telegram',
      chat_id: 'chat-1',
      text: 'Me falta Laminado',
      reply_to_message_id: 'msg-1',
      correlation_id: 'telegram:install-pacoprint:chat-1:msg-1'
    },
    organization_id: 'org-pacoprint',
    principal_id: 'principal-juan',
    installation_id: 'install-pacoprint',
    orchestration_outcome: {
      request_id: 'telegram:install-pacoprint:chat-1:msg-1',
      organization_id: 'org-pacoprint',
      principal_id: 'principal-juan',
      correlation_id: 'telegram:install-pacoprint:chat-1:msg-1',
      installation_id: 'install-pacoprint',
      status: 'blocked',
      proposal: {
        proposal_id: 'proposal-1',
        capability_key: 'pricing.quote_line',
        params: {
          article: 'dibond',
          alto: 50,
          ancho: 70
        },
        confidence: null,
        reason: null
      },
      validation: {
        valid: true,
        status: 'proposal',
        reason: 'proposal validated',
        capability_key: 'pricing.quote_line',
        params: {
          article: 'dibond',
          alto: 50,
          ancho: 70
        },
        capability_active: true,
        capability_known: true
      },
      workflow_kind: 'pricing.quote_line',
      workflow_result: null,
      response: {
        response_source: 'workflow_blocked',
        workflow_kind: 'pricing.quote_line',
        status: 'blocked',
        message: 'Me falta Laminado',
        data: {
          kind: 'request_clarification',
          missing: 'Laminado',
          reason: 'missing required field'
        }
      },
      evidence_links: ['evidence-1'],
      created_at: '2026-07-16T09:00:00.000Z',
      updated_at: '2026-07-16T09:00:00.000Z',
      reason: 'missing required field'
    },
    evidence_links: ['evidence-1']
  };
}

function buildConfig(overrides: Partial<RuntimeLearningShadowConfig> = {}): RuntimeLearningShadowConfig {
  return {
    enabled: true,
    file_path: '/tmp/kern-learning-shadow-test.jsonl',
    capture_raw_text: false,
    capture_model_params: false,
    ...overrides
  };
}

test('learning shadow record omits raw text and model params by default', () => {
  const record = buildLearningShadowRecord({
    result: buildChannelResult(),
    config: buildConfig(),
    now: () => new Date('2026-07-16T09:01:00.000Z')
  });

  assert.notEqual(record, null);
  assert.equal(record?.schema, 'kern.learning_shadow.v1');
  assert.equal(typeof record?.trace_id, 'string');
  assert.equal(record?.organization_id, 'org-pacoprint');
  assert.equal(record?.workflow_kind, 'pricing.quote_line');
  assert.equal(record?.capability_key, 'pricing.quote_line');
  assert.equal(record?.runtime_data_summary.missing, 'Laminado');
  assert.equal(record?.user_message_length, 44);
  assert.equal(typeof record?.user_message_hash, 'string');
  assert.equal('user_message_text' in (record ?? {}), false);
  assert.equal('model_params' in (record ?? {}), false);
  assert.equal('principal_id' in (record ?? {}), false);
  assert.equal('correlation_id' in (record ?? {}), false);
  assert.equal('chat_id' in (record ?? {}), false);
  assert.equal('user_id_hash' in (record ?? {}), false);
  assert.equal('outbound_text_hash' in (record ?? {}), false);
  assert.equal('outbound_text_length' in (record ?? {}), false);
});

test('learning shadow can explicitly include raw text and model params', () => {
  const record = buildLearningShadowRecord({
    result: buildChannelResult(),
    config: buildConfig({
      capture_raw_text: true,
      capture_model_params: true
    }),
    now: () => new Date('2026-07-16T09:01:00.000Z')
  });

  assert.equal(record?.user_message_text, 'Necesito precio de dibond 70x50 sin laminado');
  assert.deepEqual(record?.model_params, {
    article: 'dibond',
    alto: 50,
    ancho: 70
  });
});

test('learning shadow recorder appends one jsonl record locally', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-learning-shadow-'));
  try {
    const filePath = join(tempDir, 'learning-shadow.jsonl');
    const recorder = createLearningShadowRecorder({
      config: buildConfig({
        file_path: filePath
      }),
      now: () => new Date('2026-07-16T09:01:00.000Z')
    });

    recorder?.record(buildChannelResult());
    const lines = readFileSync(filePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    assert.equal(parsed.schema, 'kern.learning_shadow.v1');
    assert.equal(parsed.organization_id, 'org-pacoprint');
    assert.equal('user_message_text' in parsed, false);
    assert.equal('chat_id' in parsed, false);
    assert.equal('principal_id' in parsed, false);
    assert.equal('correlation_id' in parsed, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
