import test from 'node:test';
import assert from 'node:assert/strict';

import { ConversationMemory } from '../src/conversation-memory';

test('conversation memory: recuerda los Ãºltimos turnos de un chat', () => {
  const mem = new ConversationMemory();
  const t = 1_000_000;
  mem.append('inst:chatA', 'user', 'haz un presupuesto para jlu.app', t);
  mem.append('inst:chatA', 'assistant', 'Â¿quÃ© quieres presupuestar?', t + 1);
  const recent = mem.recent('inst:chatA', t + 2);
  assert.equal(recent.length, 2);
  assert.deepEqual(recent[0], { role: 'user', content: 'haz un presupuesto para jlu.app' });
  assert.deepEqual(recent[1], { role: 'assistant', content: 'Â¿quÃ© quieres presupuestar?' });
});

test('conversation memory: nunca cruza chats', () => {
  const mem = new ConversationMemory();
  const t = 1_000_000;
  mem.append('inst:chatA', 'user', 'para jlu.app', t);
  mem.append('inst:chatB', 'user', 'para otra empresa', t);
  assert.deepEqual(
    mem.recent('inst:chatA', t + 1).map((m) => m.content),
    ['para jlu.app']
  );
  assert.deepEqual(
    mem.recent('inst:chatB', t + 1).map((m) => m.content),
    ['para otra empresa']
  );
});

test('conversation memory: acota a la ventana (Ãºltimos N)', () => {
  const mem = new ConversationMemory({ maxTurns: 4 });
  const t = 1_000_000;
  for (let i = 0; i < 10; i += 1) {
    mem.append('inst:chatA', i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`, t + i);
  }
  const recent = mem.recent('inst:chatA', t + 100);
  assert.equal(recent.length, 8);
  assert.deepEqual(recent.map((m) => m.content), ['msg 2', 'msg 3', 'msg 4', 'msg 5', 'msg 6', 'msg 7', 'msg 8', 'msg 9']);
});

test('conversation memory: olvida lo caducado', () => {
  const mem = new ConversationMemory({ ttlMs: 1000 });
  const t = 1_000_000;
  mem.append('inst:chatA', 'user', 'viejo', t);
  // 2 s despuÃ©s â†’ fuera de la ventana de 1 s
  assert.deepEqual(mem.recent('inst:chatA', t + 2000), []);
});

test('conversation memory: ignora contenido vacÃ­o', () => {
  const mem = new ConversationMemory();
  const t = 1_000_000;
  mem.append('inst:chatA', 'user', '   ', t);
  assert.deepEqual(mem.recent('inst:chatA', t + 1), []);
});
