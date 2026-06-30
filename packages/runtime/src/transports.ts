import { spawnSync } from 'node:child_process';
import {
  type HoldedFetch,
  type HoldedFetchResponse
} from '../../adapters/holded/src/index';
import {
  type TelegramChannelUpdate,
  type TelegramOutboundMessage
} from '../../contracts/src/index';
import {
  type QwenChatCompletionsRequest,
  type QwenChatCompletionsResponse,
  type QwenChatCompletionsTransport,
  createNodeFetchChatCompletionsTransport
} from '../../orchestrators/qwen/src/index';
import type { TelegramTransport } from '../../channels/telegram/src/index';

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTelegramId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value.trim() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeTelegramNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTelegramUpdateMessage(message: unknown): TelegramChannelUpdate['message'] {
  if (!isPlainObject(message)) {
    return null;
  }
  const chat = isPlainObject(message.chat) ? message.chat : null;
  const from = isPlainObject(message.from) ? message.from : null;
  const messageId = normalizeTelegramId(message.message_id);
  const chatId = normalizeTelegramId(chat?.id);
  const chatType = normalizeOptionalString(chat?.type ?? null);
  const userId = normalizeTelegramId(from?.id ?? null);
  const text = normalizeOptionalString(message.text ?? null);
  if (!messageId || !chatId || !chatType || !userId || !text) {
    return null;
  }
  return {
    message_id: messageId,
    chat: {
      id: chatId,
      type: chatType
    },
    from: {
      id: userId,
      username: normalizeOptionalString(from?.username ?? null),
      first_name: normalizeOptionalString(from?.first_name ?? null),
      last_name: normalizeOptionalString(from?.last_name ?? null)
    },
    text,
    date: normalizeTelegramNumber(message.date),
    raw: structuredClone(message)
  };
}

export function normalizeTelegramUpdate(update: unknown): TelegramChannelUpdate | null {
  if (!isPlainObject(update)) {
    return null;
  }
  const updateId = normalizeTelegramNumber(update.update_id);
  if (updateId === null) {
    return null;
  }
  return {
    update_id: updateId,
    message: update.message == null ? null : normalizeTelegramUpdateMessage(update.message),
    raw: structuredClone(update)
  };
}

function createSyncJsonTransport(script: string): (input: Record<string, unknown>) => Record<string, unknown> {
  return (input: Record<string, unknown>) => {
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      input: JSON.stringify(input),
      encoding: 'utf8'
    });
    if (child.error) {
      throw child.error;
    }
    if (child.status !== 0) {
      throw new Error(child.stderr || 'transport failed');
    }
    const output = child.stdout ? (JSON.parse(child.stdout) as Record<string, unknown>) : null;
    if (!output) {
      throw new Error('transport returned no output');
    }
    return output;
  };
}

export function createNodeFetchHoldedTransport(options: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): HoldedFetch {
  const script = `
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const headers = { 'content-type': 'application/json' };
if (input.apiKey) {
  headers.key = input.apiKey;
}

const controller = new AbortController();
const timeout = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? setTimeout(() => controller.abort(), input.timeoutMs) : null;

try {
  const response = await fetch(input.url, {
    method: input.method ?? 'GET',
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: controller.signal
  });
  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  process.stdout.write(JSON.stringify({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json,
    text
  }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  if (timeout) clearTimeout(timeout);
}
`;
  const execute = createSyncJsonTransport(script);
  return (url: string, init?: RequestInit): HoldedFetchResponse => {
    const output = execute({
      url,
      apiKey: options.apiKey,
      timeoutMs: options.timeoutMs ?? 30_000,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : null
    }) as {
      ok: boolean;
      status: number;
      statusText: string;
      json: unknown;
      text: string;
    };
    return {
      ok: output.ok,
      status: output.status,
      statusText: output.statusText,
      text: () => output.text,
      json: () => (output.json ?? (output.text ? JSON.parse(output.text) : null)),
      headers: { get: () => null }
    };
  };
}

export function createNodeFetchTelegramTransport(options: {
  baseUrl?: string | null;
  botToken: string;
  timeoutMs?: number;
}): TelegramTransport {
  const baseUrl = normalizeOptionalString(options.baseUrl) ?? 'https://api.telegram.org';
  const script = `
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const controller = new AbortController();
const timeout = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? setTimeout(() => controller.abort(), input.timeoutMs) : null;
const headers = { 'content-type': 'application/json' };

try {
  const response = await fetch(input.url, {
    method: input.method ?? 'GET',
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: controller.signal
  });
  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  process.stdout.write(JSON.stringify({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json,
    text
  }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  if (timeout) clearTimeout(timeout);
}
`;
  const execute = createSyncJsonTransport(script);
  return {
    getUpdates({ offset = null, limit = null } = {}): TelegramChannelUpdate[] {
      const search = new URLSearchParams();
      if (offset !== null) {
        search.set('offset', String(offset));
      }
      if (limit !== null) {
        search.set('limit', String(limit));
      }
      const url = `${baseUrl.replace(/\/+$/, '')}/bot${options.botToken}/getUpdates${search.toString() ? `?${search.toString()}` : ''}`;
      const output = execute({
        url,
        timeoutMs: options.timeoutMs ?? 30_000
      }) as {
        ok: boolean;
        status: number;
        statusText: string;
        json: unknown;
        text: string;
      };
      if (!output.ok) {
        throw new Error(`telegram transport failed with status ${output.status}: ${output.statusText}`);
      }
      const payload = output.json;
      const updates = isPlainObject(payload) && Array.isArray(payload.result) ? payload.result : Array.isArray(payload) ? payload : [];
      return updates.map(normalizeTelegramUpdate).filter((update): update is TelegramChannelUpdate => Boolean(update));
    },
    sendMessage(message: TelegramOutboundMessage): TelegramOutboundMessage {
      const url = `${baseUrl.replace(/\/+$/, '')}/bot${options.botToken}/sendMessage`;
      const body = {
        chat_id: message.chat_id,
        text: message.text,
        reply_to_message_id: message.reply_to_message_id ?? undefined,
        parse_mode: message.parse_mode ?? undefined
      };
      const output = execute({
        url,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs ?? 30_000
      }) as {
        ok: boolean;
        status: number;
        statusText: string;
        json: unknown;
        text: string;
      };
      if (!output.ok) {
        throw new Error(`telegram transport failed with status ${output.status}: ${output.statusText}`);
      }
      return {
        ...message,
        raw: output.json ?? output.text
      };
    }
  };
}

export function createQwenNodeFetchTransport(options: {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs?: number;
}): QwenChatCompletionsTransport {
  return createNodeFetchChatCompletionsTransport({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs ?? 30_000
  });
}
