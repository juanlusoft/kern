import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  createEvidenceRecord,
  type ConversationHistoryTurn,
  type InboundMessage,
  type OrchestrationOutcome,
  type OrchestrationRequest,
  type SourceEvidence
} from '../../../contracts/src/index';
import { InMemoryOrchestrationBoundary } from '../../../orchestration/src/index';

export interface OpenWebUIIdentityMapping {
  openwebui_user_id: string;
  organization_id: string;
  principal_id: string;
  active: boolean;
  display_name?: string | null;
}

export interface OpenWebUIInstallationConfig {
  channel: 'openwebui';
  installation_id: string;
  active: boolean;
  host: string;
  port: number;
  request_body_limit_bytes: number;
  identity_mappings: OpenWebUIIdentityMapping[];
}

export interface OpenWebUIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | null;
}

export interface OpenWebUIChatCompletionsRequest {
  model?: string | null;
  messages: OpenWebUIChatMessage[];
  user?: string | number | null;
  stream?: boolean | null;
  id?: string | null;
  conversation_id?: string | null;
  correlation_id?: string | null;
  kern?: {
    correlation_id?: string | null;
  } | null;
  raw?: unknown;
}

export interface OpenWebUIResponseKernel {
  channel: 'openwebui';
  correlation_id: string;
  organization_id: string | null;
  principal_id: string | null;
  installation_id: string | null;
  request_id: string;
  status: OrchestrationOutcome['status'] | 'invalid_request';
  response_source: OrchestrationOutcome['response']['response_source'] | 'request_error';
  sources: string[];
  source_evidence?: SourceEvidence[] | null;
}

export interface OpenWebUIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: [
    {
      index: 0;
      message: {
        role: 'assistant';
        content: string;
      };
      finish_reason: 'stop';
    }
  ];
  kern: OpenWebUIResponseKernel;
}

export interface OpenWebUIErrorResponse {
  error: {
    message: string;
    type: 'invalid_request_error' | 'authentication_error' | 'permission_denied' | 'server_error';
    code: string | null;
  };
  kern: OpenWebUIResponseKernel;
}

export interface OpenWebUIChannelResult {
  channel: 'openwebui';
  http_status: number;
  status: 'sent' | 'denied' | 'blocked' | 'error';
  correlation_id: string;
  organization_id: string | null;
  principal_id: string | null;
  installation_id: string | null;
  request_id: string;
  orchestration_outcome: OrchestrationOutcome | null;
  body: OpenWebUIChatCompletionResponse | OpenWebUIErrorResponse;
  evidence_links: string[];
}

export interface OpenWebUIChannelAdapterOptions {
  installation: OpenWebUIInstallationConfig;
  orchestrationBoundary: InMemoryOrchestrationBoundary;
  now?: () => Date;
}

export interface OpenWebUIChannelServerHandle {
  readonly server: Server;
  readonly ready: Promise<number>;
  readonly port: number | null;
  close(): Promise<void>;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value.trim() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneSourceEvidence(value: unknown): SourceEvidence[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const records = value.filter((entry): entry is SourceEvidence => {
    if (!isPlainObject(entry)) {
      return false;
    }
    return (
      typeof entry.source_id === 'string' &&
      typeof entry.source_type === 'string' &&
      typeof entry.source_system === 'string' &&
      typeof entry.resource_id === 'string' &&
      typeof entry.record_id === 'string' &&
      typeof entry.field_path === 'string' &&
      typeof entry.observed_at === 'string' &&
      typeof entry.correlation_id === 'string'
    );
  });
  return records.length > 0 ? records.map((record) => ({ ...record })) : null;
}

function extractSourceEvidence(outcome: OrchestrationOutcome): SourceEvidence[] | null {
  const result = outcome.workflow_result?.capability_result?.output?.result;
  if (isPlainObject(result) && 'source_evidence' in result) {
    const evidence = cloneSourceEvidence((result as Record<string, unknown>).source_evidence);
    if (evidence) {
      return evidence;
    }
  }
  if (isPlainObject(outcome.response.data) && 'source_evidence' in outcome.response.data) {
    const evidence = cloneSourceEvidence((outcome.response.data as Record<string, unknown>).source_evidence);
    if (evidence) {
      return evidence;
    }
  }
  return null;
}

function buildCorrelationId(options: {
  installation_id: string;
  request_id: string;
  providedCorrelationId: string | null;
}): string {
  return options.providedCorrelationId ?? 'openwebui:' + options.installation_id + ':' + options.request_id;
}

function buildRequestId(options: { installation_id: string; request: OpenWebUIChatCompletionsRequest }): string {
  return (
    normalizeOptionalString(options.request.id) ??
    normalizeOptionalString(options.request.conversation_id) ??
    'openwebui:' + options.installation_id + ':' + randomUUID()
  );
}
function extractConversationHistory(messages: OpenWebUIChatMessage[], lastUserMessageIndex: number): ConversationHistoryTurn[] | null {
  if (lastUserMessageIndex <= 0) {
    return null;
  }
  const history = messages
    .slice(0, lastUserMessageIndex)
    .map((message) => {
      const content = normalizeOptionalString(message.content);
      if ((message.role !== 'user' && message.role !== 'assistant') || !content) {
        return null;
      }
      return {
        role: message.role,
        content
      } as ConversationHistoryTurn;
    })
    .filter((turn): turn is ConversationHistoryTurn => Boolean(turn));
  return history.length > 0 ? history : null;
}

function buildInboundMessage(input: {
  request: OpenWebUIChatCompletionsRequest;
  request_id: string;
  user_id: string;
  user_message: string;
}): InboundMessage {
  return {
    channel: 'openwebui',
    message_id: input.request_id,
    chat_id: normalizeOptionalString(input.request.conversation_id) ?? input.request_id,
    user_id: input.user_id,
    text: input.user_message,
    received_at: new Date().toISOString(),
    raw: structuredClone(input.request.raw ?? input.request)
  };
}

function buildOrchestrationRequest(input: {
  request: OpenWebUIChatCompletionsRequest;
  installation_id: string;
  organization_id: string;
  principal_id: string;
  request_id: string;
  correlation_id: string;
  user_id: string;
  user_message: string;
  conversation_history: ConversationHistoryTurn[] | null;
}): OrchestrationRequest {
  return {
    request_id: input.request_id,
    user_message: input.user_message,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    actor: {
      principal_id: input.principal_id,
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: input.correlation_id,
    installation_id: input.installation_id,
    conversation_history: input.conversation_history,
    context: {
      installation_id: input.installation_id,
      active_capabilities: [],
      metadata: {
        channel: 'openwebui',
        user_id: input.user_id,
        conversation_id: normalizeOptionalString(input.request.conversation_id),
        model: normalizeOptionalString(input.request.model)
      },
      force_capability_key: null,
      force_params: null
    }
  };
}

function appendEvidence(
  boundary: InMemoryOrchestrationBoundary,
  now: () => Date,
  input: {
    organization_id: string;
    correlation_id: string;
    record_type:
      | 'channel_message_received'
      | 'channel_identity_resolved'
      | 'channel_identity_denied'
      | 'channel_message_denied'
      | 'channel_message_blocked'
      | 'channel_orchestration_requested'
      | 'channel_response_prepared'
      | 'channel_message_sent'
      | 'channel_message_send_error';
    subject: string;
    data: Record<string, unknown>;
  }
) {
  return boundary.getEvidenceLedger().append(
    createEvidenceRecord({
      organization_id: input.organization_id,
      correlation_id: input.correlation_id,
      record_type: input.record_type,
      subject: input.subject,
      data: input.data,
      created_at: now().toISOString()
    })
  );
}

function summarizeOutcomeSources(outcome: OrchestrationOutcome): { sources: string[]; source_evidence: SourceEvidence[] | null } {
  const sourceEvidence = extractSourceEvidence(outcome);
  return {
    sources: sourceEvidence ? sourceEvidence.map((record) => record.source_id) : [...outcome.evidence_links],
    source_evidence: sourceEvidence
  };
}

function buildSuccessResponse(input: {
  request: OpenWebUIChatCompletionsRequest;
  request_id: string;
  correlation_id: string;
  organization_id: string;
  principal_id: string;
  installation_id: string;
  outcome: OrchestrationOutcome;
  now: () => Date;
}): OpenWebUIChatCompletionResponse {
  const responseText = normalizeOptionalString(input.outcome.response.message) ?? 'Respuesta generada por Kern.';
  const sources = summarizeOutcomeSources(input.outcome);
  return {
    id: 'chatcmpl-' + input.request_id,
    object: 'chat.completion',
    created: Math.floor(input.now().getTime() / 1000),
    model: normalizeOptionalString(input.request.model) ?? 'kern-numa',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: responseText
        },
        finish_reason: 'stop'
      }
    ],
    kern: {
      channel: 'openwebui',
      correlation_id: input.correlation_id,
      organization_id: input.organization_id,
      principal_id: input.principal_id,
      installation_id: input.installation_id,
      request_id: input.request_id,
      status: input.outcome.status,
      response_source: input.outcome.response.response_source,
      sources: sources.sources,
      source_evidence: sources.source_evidence
    }
  };
}

function buildErrorBody(input: {
  request_id: string;
  correlation_id: string;
  message: string;
  type: OpenWebUIErrorResponse['error']['type'];
  code: string | null;
}): OpenWebUIErrorResponse {
  return {
    error: {
      message: input.message,
      type: input.type,
      code: input.code
    },
    kern: {
      channel: 'openwebui',
      correlation_id: input.correlation_id,
      organization_id: null,
      principal_id: null,
      installation_id: null,
      request_id: input.request_id,
      status: 'invalid_request',
      response_source: 'request_error',
      sources: []
    }
  };
}

function buildValidatedRequest(input: {
  installation: OpenWebUIInstallationConfig;
  request: OpenWebUIChatCompletionsRequest;
}):
  | {
      request_id: string;
      correlation_id: string;
      user_id: string;
      user_message: string;
      conversation_history: ConversationHistoryTurn[] | null;
      mapping: OpenWebUIIdentityMapping;
    }
  | null {
  if (input.request.stream === true) {
    return null;
  }
  const externalUserId = normalizeIdentifier(input.request.user);
  if (!externalUserId) {
    return null;
  }
  const messages = Array.isArray(input.request.messages) ? input.request.messages : null;
  if (!messages || messages.length === 0) {
    return null;
  }
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'user' && normalizeOptionalString(message.content)) {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    return null;
  }
  const user_message = normalizeOptionalString(messages[lastUserIndex]?.content);
  if (!user_message) {
    return null;
  }
  const mapping = input.installation.identity_mappings.find(
    (candidate) => candidate.active && candidate.openwebui_user_id === externalUserId
  );
  if (!mapping) {
    return null;
  }
  const request_id = buildRequestId({ installation_id: input.installation.installation_id, request: input.request });
  const correlation_id = buildCorrelationId({
    installation_id: input.installation.installation_id,
    request_id,
    providedCorrelationId:
      normalizeOptionalString(input.request.correlation_id) ?? normalizeOptionalString(input.request.kern?.correlation_id) ?? null
  });
  return {
    request_id,
    correlation_id,
    user_id: externalUserId,
    user_message,
    conversation_history: extractConversationHistory(messages, lastUserIndex),
    mapping
  };
}
export class OpenWebUIChannelAdapter {
  private readonly installation: OpenWebUIInstallationConfig;
  private readonly orchestrationBoundary: InMemoryOrchestrationBoundary;
  private readonly now: () => Date;

  constructor(options: OpenWebUIChannelAdapterOptions) {
    this.installation = {
      ...options.installation,
      identity_mappings: options.installation.identity_mappings.map((mapping) => ({ ...mapping }))
    };
    this.orchestrationBoundary = options.orchestrationBoundary;
    this.now = options.now ?? (() => new Date());
  }

  handleChatCompletionRequest(request: unknown): OpenWebUIChannelResult {
    const normalizedRequest = isPlainObject(request) ? (request as unknown as OpenWebUIChatCompletionsRequest) : null;
    if (!normalizedRequest) {
      const request_id = 'openwebui:' + this.installation.installation_id + ':' + randomUUID();
      const correlation_id = 'openwebui:' + this.installation.installation_id + ':' + randomUUID();
      return {
        channel: 'openwebui',
        http_status: 400,
        status: 'error',
        correlation_id,
        organization_id: null,
        principal_id: null,
        installation_id: this.installation.installation_id,
        request_id,
        orchestration_outcome: null,
        evidence_links: [],
        body: buildErrorBody({
          request_id,
          correlation_id,
          message: 'request body must be a JSON object',
          type: 'invalid_request_error',
          code: 'invalid_json'
        })
      };
    }

    const request_id = buildRequestId({ installation_id: this.installation.installation_id, request: normalizedRequest });
    const baseCorrelationId =
      normalizeOptionalString(normalizedRequest.correlation_id) ?? normalizeOptionalString(normalizedRequest.kern?.correlation_id) ?? null;

    appendEvidence(this.orchestrationBoundary, this.now, {
      organization_id: this.installation.identity_mappings[0]?.organization_id ?? 'unknown',
      correlation_id: baseCorrelationId ?? 'openwebui:' + this.installation.installation_id + ':' + request_id,
      record_type: 'channel_message_received',
      subject: request_id,
      data: {
        channel: 'openwebui',
        request_id,
        model: normalizeOptionalString(normalizedRequest.model),
        has_user: Boolean(normalizedRequest.user),
        message_count: Array.isArray(normalizedRequest.messages) ? normalizedRequest.messages.length : 0
      }
    });

    const validated = buildValidatedRequest({
      installation: this.installation,
      request: normalizedRequest
    });
    if (!validated) {
      const correlation_id = baseCorrelationId ?? 'openwebui:' + this.installation.installation_id + ':' + request_id;
      const response = buildErrorBody({
        request_id,
        correlation_id,
        message: 'request denied: missing or unmapped Open WebUI user',
        type: 'authentication_error',
        code: 'permission_denied'
      });
      appendEvidence(this.orchestrationBoundary, this.now, {
        organization_id: this.installation.identity_mappings[0]?.organization_id ?? 'unknown',
        correlation_id,
        record_type: 'channel_identity_denied',
        subject: request_id,
        data: {
          channel: 'openwebui',
          request_id,
          reason: response.error.message
        }
      });
      return {
        channel: 'openwebui',
        http_status: 403,
        status: 'denied',
        correlation_id,
        organization_id: null,
        principal_id: null,
        installation_id: this.installation.installation_id,
        request_id,
        orchestration_outcome: null,
        body: response,
        evidence_links: []
      };
    }

    const mapping = validated.mapping;
    appendEvidence(this.orchestrationBoundary, this.now, {
      organization_id: mapping.organization_id,
      correlation_id: validated.correlation_id,
      record_type: 'channel_identity_resolved',
      subject: request_id,
      data: {
        channel: 'openwebui',
        request_id,
        external_user_id: validated.user_id,
        organization_id: mapping.organization_id,
        principal_id: mapping.principal_id,
        display_name: mapping.display_name ?? null
      }
    });

    const inboundMessage = buildInboundMessage({
      request: normalizedRequest,
      request_id,
      user_id: validated.user_id,
      user_message: validated.user_message
    });
    const orchestrationRequest = buildOrchestrationRequest({
      request: normalizedRequest,
      installation_id: this.installation.installation_id,
      organization_id: mapping.organization_id,
      principal_id: mapping.principal_id,
      request_id,
      correlation_id: validated.correlation_id,
      user_id: validated.user_id,
      user_message: validated.user_message,
      conversation_history: validated.conversation_history
    });

    appendEvidence(this.orchestrationBoundary, this.now, {
      organization_id: mapping.organization_id,
      correlation_id: validated.correlation_id,
      record_type: 'channel_orchestration_requested',
      subject: request_id,
      data: {
        channel: 'openwebui',
        request_id,
        inbound_message: inboundMessage,
        organization_id: mapping.organization_id,
        principal_id: mapping.principal_id
      }
    });

    try {
      const outcome = this.orchestrationBoundary.execute(orchestrationRequest);
      const body = buildSuccessResponse({
        request: normalizedRequest,
        request_id,
        correlation_id: validated.correlation_id,
        organization_id: mapping.organization_id,
        principal_id: mapping.principal_id,
        installation_id: this.installation.installation_id,
        outcome,
        now: this.now
      });
      appendEvidence(this.orchestrationBoundary, this.now, {
        organization_id: mapping.organization_id,
        correlation_id: validated.correlation_id,
        record_type: 'channel_response_prepared',
        subject: request_id,
        data: {
          channel: 'openwebui',
          request_id,
          status: outcome.status,
          response_source: outcome.response.response_source,
          sources: body.kern.sources
        }
      });
      appendEvidence(this.orchestrationBoundary, this.now, {
        organization_id: mapping.organization_id,
        correlation_id: validated.correlation_id,
        record_type: 'channel_message_sent',
        subject: request_id,
        data: {
          channel: 'openwebui',
          request_id,
          http_status: 200
        }
      });
      return {
        channel: 'openwebui',
        http_status: 200,
        status: 'sent',
        correlation_id: validated.correlation_id,
        organization_id: mapping.organization_id,
        principal_id: mapping.principal_id,
        installation_id: this.installation.installation_id,
        request_id,
        orchestration_outcome: outcome,
        body,
        evidence_links: outcome.evidence_links
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'openwebui orchestration failed';
      appendEvidence(this.orchestrationBoundary, this.now, {
        organization_id: mapping.organization_id,
        correlation_id: validated.correlation_id,
        record_type: 'channel_message_send_error',
        subject: request_id,
        data: {
          channel: 'openwebui',
          request_id,
          error: message
        }
      });
      return {
        channel: 'openwebui',
        http_status: 500,
        status: 'error',
        correlation_id: validated.correlation_id,
        organization_id: mapping.organization_id,
        principal_id: mapping.principal_id,
        installation_id: this.installation.installation_id,
        request_id,
        orchestration_outcome: null,
        body: {
          error: {
            message: 'openwebui orchestration failed',
            type: 'server_error',
            code: 'internal_error'
          },
          kern: {
            channel: 'openwebui',
            correlation_id: validated.correlation_id,
            organization_id: mapping.organization_id,
            principal_id: mapping.principal_id,
            installation_id: this.installation.installation_id,
            request_id,
            status: 'invalid_request',
            response_source: 'request_error',
            sources: []
          }
        },
        evidence_links: []
      };
    }
  }
}

async function readRequestBody(request: IncomingMessage, limitBytes: number): Promise<{ ok: true; body: string } | { ok: false; status: number; message: string; code: string }> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > limitBytes) {
      return { ok: false, status: 413, message: 'request body too large', code: 'payload_too_large' };
    }
    chunks.push(buffer);
  }
  return { ok: true, body: Buffer.concat(chunks).toString('utf8') };
}

function writeJson(response: ServerResponse, statusCode: number, body: OpenWebUIChatCompletionResponse | OpenWebUIErrorResponse): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

export function createOpenWebUIChannelAdapter(options: OpenWebUIChannelAdapterOptions): OpenWebUIChannelAdapter {
  return new OpenWebUIChannelAdapter(options);
}

export function createOpenWebUIChannelServer(options: {
  installation: OpenWebUIInstallationConfig;
  orchestrationBoundary: InMemoryOrchestrationBoundary;
  now?: () => Date;
}): OpenWebUIChannelServerHandle {
  const adapter = createOpenWebUIChannelAdapter({
    installation: options.installation,
    orchestrationBoundary: options.orchestrationBoundary,
    now: options.now
  });
  let listeningPort: number | null = null;
  const server = createServer(async (request, response) => {
    const method = request.method?.toUpperCase() ?? 'GET';
    const url = request.url ? new URL(request.url, 'http://127.0.0.1') : null;
    if (!url) {
      const request_id = 'openwebui:' + options.installation.installation_id + ':' + randomUUID();
      writeJson(
        response,
        404,
        buildErrorBody({
          request_id,
          correlation_id: request_id,
          message: 'route not found',
          type: 'invalid_request_error',
          code: 'not_found'
        })
      );
      return;
    }
    if (url.pathname !== '/v1/chat/completions') {
      const request_id = 'openwebui:' + options.installation.installation_id + ':' + randomUUID();
      writeJson(
        response,
        404,
        buildErrorBody({
          request_id,
          correlation_id: request_id,
          message: 'route not found',
          type: 'invalid_request_error',
          code: 'not_found'
        })
      );
      return;
    }
    if (method !== 'POST') {
      const request_id = 'openwebui:' + options.installation.installation_id + ':' + randomUUID();
      response.statusCode = 405;
      response.setHeader('allow', 'POST');
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify(
          buildErrorBody({
            request_id,
            correlation_id: request_id,
            message: 'method not allowed',
            type: 'invalid_request_error',
            code: 'method_not_allowed'
          })
        )
      );
      return;
    }

    const body = await readRequestBody(request, options.installation.request_body_limit_bytes);
    if (!body.ok) {
      const request_id = 'openwebui:' + options.installation.installation_id + ':' + randomUUID();
      writeJson(
        response,
        body.status,
        buildErrorBody({
          request_id,
          correlation_id: request_id,
          message: body.message,
          type: 'invalid_request_error',
          code: body.code
        })
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = body.body.length > 0 ? JSON.parse(body.body) : null;
    } catch {
      const request_id = 'openwebui:' + options.installation.installation_id + ':' + randomUUID();
      writeJson(
        response,
        400,
        buildErrorBody({
          request_id,
          correlation_id: request_id,
          message: 'invalid JSON body',
          type: 'invalid_request_error',
          code: 'invalid_json'
        })
      );
      return;
    }

    const result = adapter.handleChatCompletionRequest(parsed);
    writeJson(response, result.http_status, result.body);
  });

  const ready = new Promise<number>((resolve, reject) => {
    server.once('listening', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        listeningPort = address.port;
        resolve(address.port);
      } else {
        listeningPort = options.installation.port;
        resolve(options.installation.port);
      }
    });
    server.once('error', reject);
  });

  server.listen(options.installation.port, options.installation.host);

  return {
    server,
    ready,
    get port() {
      return listeningPort;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
