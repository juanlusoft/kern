import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ChannelMessageResult } from '../../contracts/src/index';
import type { RuntimeLearningShadowConfig } from './config';

export interface LearningShadowRecorder {
  record(result: ChannelMessageResult): void;
}

export interface LearningShadowRecord {
  schema: 'kern.learning_shadow.v1';
  trace_id: string;
  created_at: string;
  installation_id: string | null;
  organization_id: string | null;
  channel: 'telegram';
  user_message_hash: string | null;
  user_message_length: number | null;
  user_message_text?: string;
  response_status: string | null;
  response_source: string | null;
  workflow_kind: string | null;
  capability_key: string | null;
  validation_status: string | null;
  validation_reason: string | null;
  model_params?: Record<string, unknown> | null;
  runtime_data_summary: {
    kind: string | null;
    missing: unknown;
    reason: unknown;
    has_defaults_applied: boolean;
    has_options_summary: boolean;
    has_source_evidence: boolean;
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeModelParams(params: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!params) {
    return null;
  }
  const sanitized: Record<string, unknown> = {};
  for (const key of ['article', 'unidades', 'alto', 'ancho', 'options']) {
    if (params[key] !== undefined) {
      sanitized[key] = structuredClone(params[key]);
    }
  }
  if (Array.isArray(params.lines)) {
    sanitized.lines = params.lines.map((line) => {
      if (!isPlainObject(line)) {
        return {};
      }
      const sanitizedLine: Record<string, unknown> = {};
      for (const key of ['text', 'article', 'unidades', 'alto', 'ancho', 'options']) {
        if (line[key] !== undefined) {
          sanitizedLine[key] = structuredClone(line[key]);
        }
      }
      return sanitizedLine;
    });
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function summarizeRuntimeData(data: Record<string, unknown> | null): LearningShadowRecord['runtime_data_summary'] {
  return {
    kind: typeof data?.kind === 'string' ? data.kind : null,
    missing: data?.missing ?? null,
    reason: data?.reason ?? null,
    has_defaults_applied: Array.isArray(data?.defaults_applied) && data.defaults_applied.length > 0,
    has_options_summary: Array.isArray(data?.options_summary) && data.options_summary.length > 0,
    has_source_evidence: Array.isArray(data?.source_evidence) && data.source_evidence.length > 0
  };
}

export function buildLearningShadowRecord(input: {
  result: ChannelMessageResult;
  config: RuntimeLearningShadowConfig;
  now: () => Date;
}): LearningShadowRecord | null {
  const { result, config, now } = input;
  const inbound = result.inbound_message;
  const outcome = result.orchestration_outcome;
  if (!inbound || !outcome) {
    return null;
  }
  const userText = inbound.text;
  const modelParams = config.capture_model_params ? sanitizeModelParams(outcome.validation?.params) : undefined;

  return {
    schema: 'kern.learning_shadow.v1',
    trace_id: randomUUID(),
    created_at: now().toISOString(),
    installation_id: result.installation_id,
    organization_id: result.organization_id,
    channel: 'telegram',
    user_message_hash: userText ? sha256(userText) : null,
    user_message_length: userText ? userText.length : null,
    ...(config.capture_raw_text ? { user_message_text: userText } : {}),
    response_status: outcome.response.status,
    response_source: outcome.response.response_source,
    workflow_kind: outcome.response.workflow_kind,
    capability_key: outcome.validation?.capability_key ?? outcome.proposal?.capability_key ?? null,
    validation_status: outcome.validation?.status ?? null,
    validation_reason: outcome.validation?.reason ?? null,
    ...(config.capture_model_params ? { model_params: modelParams ?? null } : {}),
    runtime_data_summary: summarizeRuntimeData(outcome.response.data)
  };
}

export function createLearningShadowRecorder(input: {
  config: RuntimeLearningShadowConfig | null | undefined;
  now?: () => Date;
}): LearningShadowRecorder | null {
  const config = input.config;
  if (!config?.enabled || !config.file_path) {
    return null;
  }
  const now = input.now ?? (() => new Date());
  return {
    record(result: ChannelMessageResult): void {
      const record = buildLearningShadowRecord({ result, config, now });
      if (!record) {
        return;
      }
      mkdirSync(dirname(config.file_path as string), { recursive: true });
      appendFileSync(config.file_path as string, `${JSON.stringify(record)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      });
    }
  };
}
