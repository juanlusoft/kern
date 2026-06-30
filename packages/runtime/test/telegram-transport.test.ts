import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTelegramUpdate } from '../src/index';

test('Telegram transport normalizes numeric Telegram ids into internal strings', () => {
  const update = normalizeTelegramUpdate({
    update_id: 123,
    message: {
      message_id: 2149,
      from: {
        id: 146574793,
        username: 'telegram-user',
        first_name: 'Telegram',
        last_name: 'User'
      },
      chat: {
        id: 146574793,
        type: 'private'
      },
      text: 'Necesito el presupuesto estimate-123',
      date: 1_751_472_000
    }
  });

  assert.ok(update);
  assert.equal(update?.update_id, 123);
  assert.equal(update?.message?.message_id, '2149');
  assert.equal(update?.message?.chat.id, '146574793');
  assert.equal(update?.message?.from?.id, '146574793');
  assert.equal(update?.message?.text, 'Necesito el presupuesto estimate-123');
});

test('Telegram transport preserves incomplete updates as blocked candidates', () => {
  const update = normalizeTelegramUpdate({
    update_id: 124,
    message: {
      message_id: 2150,
      chat: {
        id: 146574793,
        type: 'private'
      },
      text: 'Necesito el presupuesto estimate-123'
    }
  });

  assert.ok(update);
  assert.equal(update?.message, null);
});
