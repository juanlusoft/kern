import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ConversationHistoryTurn, ConversationMemoryKey, ConversationMemoryStore } from '../../contracts/src/index';

const DEFAULT_CONVERSATION_WINDOW_TURNS = 6;
const DEFAULT_CONVERSATION_TTL_MS = 15 * 60 * 1000;

type StoredConversationTurn = ConversationHistoryTurn & { created_at: string };

interface ConversationMemorySnapshot {
  version: 1;
  conversations: Record<string, StoredConversationTurn[]>;
}

export interface ConversationMemoryStoreOptions {
  filePath?: string | null;
  windowTurns?: number;
  ttlMs?: number;
  now?: () => Date;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeConversationKey(key: ConversationMemoryKey): string | null {
  const installation_id = normalizeString(key.installation_id);
  const chat_id = normalizeString(key.chat_id);
  if (!installation_id || !chat_id) {
    return null;
  }
  return JSON.stringify({ installation_id, chat_id });
}

function normalizeConversationTurn(turn: unknown): ConversationHistoryTurn | null {
  if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
    return null;
  }
  const role = normalizeString((turn as { role?: unknown }).role);
  const content = normalizeString((turn as { content?: unknown }).content);
  if ((role !== 'user' && role !== 'assistant') || !content) {
    return null;
  }
  return { role, content };
}

function normalizeStoredTurn(turn: unknown): StoredConversationTurn | null {
  if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
    return null;
  }
  const normalized = normalizeConversationTurn(turn);
  const created_at = normalizeString((turn as { created_at?: unknown }).created_at);
  if (!normalized || !created_at) {
    return null;
  }
  return { ...normalized, created_at };
}

function pruneTurns(turns: StoredConversationTurn[], nowMs: number, windowTurns: number, ttlMs: number): StoredConversationTurn[] {
  const cutoff = nowMs - ttlMs;
  return turns
    .filter((turn) => {
      const createdAt = Date.parse(turn.created_at);
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .slice(-windowTurns * 2)
    .map((turn) => ({ ...turn }));
}

function snapshotFromJSON(value: unknown): ConversationMemorySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { version: 1, conversations: {} };
  }
  const rawConversations = (value as { conversations?: unknown }).conversations;
  const conversations: Record<string, StoredConversationTurn[]> = {};
  if (rawConversations && typeof rawConversations === 'object' && !Array.isArray(rawConversations)) {
    for (const [key, turns] of Object.entries(rawConversations as Record<string, unknown>)) {
      if (!Array.isArray(turns)) {
        continue;
      }
      const normalizedTurns = turns
        .map((turn) => normalizeStoredTurn(turn))
        .filter((turn): turn is StoredConversationTurn => Boolean(turn));
      if (normalizedTurns.length > 0) {
        conversations[key] = normalizedTurns;
      }
    }
  }
  return { version: 1, conversations };
}

function loadSnapshot(filePath: string): ConversationMemorySnapshot {
  try {
    return snapshotFromJSON(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return { version: 1, conversations: {} };
  }
}

function saveSnapshot(filePath: string, snapshot: ConversationMemorySnapshot): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
}

class InMemoryConversationMemoryStore implements ConversationMemoryStore {
  private readonly conversations = new Map<string, StoredConversationTurn[]>();
  private readonly windowTurns: number;
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(options: ConversationMemoryStoreOptions = {}) {
    this.windowTurns = options.windowTurns ?? DEFAULT_CONVERSATION_WINDOW_TURNS;
    this.ttlMs = options.ttlMs ?? DEFAULT_CONVERSATION_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  read(key: ConversationMemoryKey): ConversationHistoryTurn[] {
    const normalizedKey = normalizeConversationKey(key);
    if (!normalizedKey) {
      return [];
    }
    const turns = this.conversations.get(normalizedKey) ?? [];
    const pruned = pruneTurns(turns, this.now().getTime(), this.windowTurns, this.ttlMs);
    this.conversations.set(normalizedKey, pruned);
    return pruned.map(({ role, content }) => ({ role, content }));
  }

  append(key: ConversationMemoryKey, turns: ConversationHistoryTurn[]): void {
    const normalizedKey = normalizeConversationKey(key);
    if (!normalizedKey) {
      return;
    }
    const sanitizedTurns = turns
      .map((turn) => normalizeConversationTurn(turn))
      .filter((turn): turn is ConversationHistoryTurn => Boolean(turn));
    if (sanitizedTurns.length === 0) {
      return;
    }
    const nowIso = this.now().toISOString();
    const existing = this.conversations.get(normalizedKey) ?? [];
    const stored = [...existing, ...sanitizedTurns.map((turn) => ({ ...turn, created_at: nowIso }))];
    this.conversations.set(normalizedKey, pruneTurns(stored, this.now().getTime(), this.windowTurns, this.ttlMs));
  }
}

class JsonFileConversationMemoryStore implements ConversationMemoryStore {
  private readonly filePath: string;
  private readonly windowTurns: number;
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(options: ConversationMemoryStoreOptions & { filePath: string; }) {
    this.filePath = options.filePath;
    this.windowTurns = options.windowTurns ?? DEFAULT_CONVERSATION_WINDOW_TURNS;
    this.ttlMs = options.ttlMs ?? DEFAULT_CONVERSATION_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  read(key: ConversationMemoryKey): ConversationHistoryTurn[] {
    const normalizedKey = normalizeConversationKey(key);
    if (!normalizedKey) {
      return [];
    }
    const snapshot = loadSnapshot(this.filePath);
    const turns = snapshot.conversations[normalizedKey] ?? [];
    const pruned = pruneTurns(turns, this.now().getTime(), this.windowTurns, this.ttlMs);
    if (pruned.length !== turns.length) {
      snapshot.conversations[normalizedKey] = pruned;
      saveSnapshot(this.filePath, snapshot);
    }
    return pruned.map(({ role, content }) => ({ role, content }));
  }

  append(key: ConversationMemoryKey, turns: ConversationHistoryTurn[]): void {
    const normalizedKey = normalizeConversationKey(key);
    if (!normalizedKey) {
      return;
    }
    const sanitizedTurns = turns
      .map((turn) => normalizeConversationTurn(turn))
      .filter((turn): turn is ConversationHistoryTurn => Boolean(turn));
    if (sanitizedTurns.length === 0) {
      return;
    }
    const snapshot = loadSnapshot(this.filePath);
    const existing = snapshot.conversations[normalizedKey] ?? [];
    const nowIso = this.now().toISOString();
    const stored = [...existing, ...sanitizedTurns.map((turn) => ({ ...turn, created_at: nowIso }))];
    snapshot.conversations[normalizedKey] = pruneTurns(stored, this.now().getTime(), this.windowTurns, this.ttlMs);
    saveSnapshot(this.filePath, snapshot);
  }
}

export function createConversationMemoryStore(options: ConversationMemoryStoreOptions = {}): ConversationMemoryStore {
  const filePath = normalizeString(options.filePath ?? null);
  if (filePath) {
    return new JsonFileConversationMemoryStore({
      filePath,
      windowTurns: options.windowTurns,
      ttlMs: options.ttlMs,
      now: options.now
    });
  }
  return new InMemoryConversationMemoryStore(options);
}