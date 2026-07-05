import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createConversationMemoryStore } from '../src/index';

test('Conversation memory store keeps the last six turns (twelve messages) and ignores empty content', () => {
  const store = createConversationMemoryStore({
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });
  const key = {
    installation_id: 'install-a',
    chat_id: 'chat-1'
  };

  store.append(key, [
    { role: 'user', content: 'turn-1' },
    { role: 'assistant', content: 'turn-2' },
    { role: 'user', content: 'turn-3' },
    { role: 'assistant', content: 'turn-4' },
    { role: 'user', content: 'turn-5' },
    { role: 'assistant', content: 'turn-6' },
    { role: 'user', content: 'turn-7' },
    { role: 'assistant', content: 'turn-8' },
    { role: 'user', content: 'turn-9' },
    { role: 'assistant', content: 'turn-10' },
    { role: 'user', content: 'turn-11' },
    { role: 'assistant', content: 'turn-12' },
    { role: 'user', content: 'turn-13' },
    { role: 'assistant', content: 'turn-14' }
  ]);

  assert.deepEqual(
    store.read(key).map((turn) => turn.content),
    ['turn-3', 'turn-4', 'turn-5', 'turn-6', 'turn-7', 'turn-8', 'turn-9', 'turn-10', 'turn-11', 'turn-12', 'turn-13', 'turn-14']
  );
});

test('Conversation memory store expires old turns and keeps installation/chat keys isolated', () => {
  let nowMs = Date.parse('2026-06-30T00:00:00.000Z');
  const store = createConversationMemoryStore({
    now: () => new Date(nowMs),
    ttlMs: 15 * 60 * 1000
  });
  const keyA = {
    installation_id: 'install-a',
    chat_id: 'chat-1'
  };
  const keyB = {
    installation_id: 'install-b',
    chat_id: 'chat-2'
  };

  store.append(keyA, [
    { role: 'user', content: 'turn-1' },
    { role: 'assistant', content: 'turn-2' }
  ]);
  nowMs += 16 * 60 * 1000;
  store.append(keyB, [{ role: 'user', content: 'turn-3' }]);

  assert.deepEqual(store.read(keyA), []);
  assert.deepEqual(store.read(keyB).map((turn) => turn.content), ['turn-3']);
});

test('Conversation memory store persists to JSON when a file path is configured', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-conversation-memory-'));
  const filePath = join(tempDir, 'memory.json');
  try {
    const key = {
      installation_id: 'install-file',
      chat_id: 'chat-file'
    };
    const firstStore = createConversationMemoryStore({
      filePath,
      now: () => new Date('2026-06-30T00:00:00.000Z')
    });

    firstStore.append(key, [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¿Qué quieres presupuestar?' }
    ]);

    assert.equal(readFileSync(filePath, 'utf8').includes('install-file'), true);

    const secondStore = createConversationMemoryStore({
      filePath,
      now: () => new Date('2026-06-30T00:00:00.000Z')
    });

    assert.deepEqual(secondStore.read(key).map((turn) => turn.content), ['hola', '¿Qué quieres presupuestar?']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

