/**
 * Memoria de conversación a CORTO PLAZO, por chat.
 *
 * Guarda los últimos turnos (usuario/asistente) de cada conversación para que el
 * modelo pueda continuar un hilo (p. ej. "¿qué presupuestas?" → "3 lonas…"),
 * acotada por ventana + caducidad, así que nunca arrastra contexto viejo. Nunca
 * cruza chats: la clave incluye instalación + chat.
 *
 * Persistencia: el daemon corre un PROCESO NUEVO por cada sondeo (cada ~5s), así
 * que la memoria en RAM se perdería entre mensajes. Por eso, si se da `filePath`,
 * se respalda en un JSON en disco (sobrevive entre procesos y reinicios). Sin
 * `filePath` es puramente en memoria (para tests).
 *
 * Es solo CONTEXTO para el modelo; la gobernanza no cambia (el runtime valida
 * cada propuesta y el modelo sigue sin inventar).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ConversationTurn } from '../../../contracts/src/index';

interface StoredTurn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

type Store = Record<string, StoredTurn[]>;

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min sin hablar → se olvida
const DEFAULT_MAX_TURNS = 6; // ~6 turnos conversacionales (~12 mensajes)

function isStoredTurn(value: unknown): value is StoredTurn {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    ((value as StoredTurn).role === 'user' || (value as StoredTurn).role === 'assistant') &&
    typeof (value as StoredTurn).content === 'string' &&
    typeof (value as StoredTurn).at === 'number'
  );
}

export class ConversationMemory {
  private readonly ttlMs: number;
  private readonly maxTurns: number;
  private readonly filePath: string | null;
  private readonly memory: Store;

  constructor(options: { ttlMs?: number; maxTurns?: number; filePath?: string | null } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    this.filePath = options.filePath ?? null;
    this.memory = {};
  }

  private load(): Store {
    if (!this.filePath) {
      return this.memory;
    }
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Store;
        }
      }
    } catch {
      // Fichero corrupto/ausente → empezar en limpio (best-effort, nunca peta).
    }
    return {};
  }

  private save(store: Store): void {
    if (!this.filePath) {
      // Mutación en sitio del almacén en memoria.
      for (const key of Object.keys(this.memory)) {
        delete this.memory[key];
      }
      Object.assign(this.memory, store);
      return;
    }
    try {
      writeFileSync(this.filePath, JSON.stringify(store));
    } catch {
      // Best-effort: si no se puede escribir, la conversación no se recuerda,
      // pero nunca rompe el procesamiento del mensaje.
    }
  }

  /** Poda turnos caducados en TODAS las conversaciones y las vacías. */
  private prune(store: Store, nowMs: number): Store {
    const pruned: Store = {};
    for (const [key, turns] of Object.entries(store)) {
      if (!Array.isArray(turns)) {
        continue;
      }
      const fresh = turns.filter((turn) => isStoredTurn(turn) && nowMs - turn.at <= this.ttlMs);
      if (fresh.length > 0) {
        pruned[key] = fresh;
      }
    }
    return pruned;
  }

  /** Últimos turnos vigentes de esta conversación (dentro de ventana + caducidad). */
  recent(key: string, nowMs: number): ConversationTurn[] {
    const store = this.prune(this.load(), nowMs);
    this.save(store);
    const turns = store[key] ?? [];
    return turns.slice(-2 * this.maxTurns).map((turn) => ({ role: turn.role, content: turn.content }));
  }

  /** Añade un turno; poda caducados y acota el almacenamiento. */
  append(key: string, role: 'user' | 'assistant', content: string, nowMs: number): void {
    const text = typeof content === 'string' ? content.trim() : '';
    if (text.length === 0) {
      return;
    }
    const store = this.prune(this.load(), nowMs);
    const turns = store[key] ?? [];
    turns.push({ role, content: text, at: nowMs });
    // Se conserva algo más que la ventana visible para no perder contexto por bordes.
    store[key] = turns.slice(-2 * this.maxTurns);
    this.save(store);
  }

  /** Olvida la conversación (p. ej. al cancelar). */
  clear(key: string, nowMs: number): void {
    const store = this.prune(this.load(), nowMs);
    delete store[key];
    this.save(store);
  }
}

