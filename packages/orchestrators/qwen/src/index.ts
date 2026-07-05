import { spawnSync } from 'node:child_process';
import {
  createDeterministicId,
  createEvidenceRecord,
  normalizeCorrelationId,
  type EvidenceRecord,
  type OrchestratorPort,
  type OrchestrationOutcome,
  type OrchestrationProposal,
  type OrchestrationRequest,
  type OrchestrationResponse,
  type OrchestrationStatus,
  type OrchestrationValidationResult,
  type ConversationHistoryTurn
} from '../../../contracts/src/index';
import { InMemoryEvidenceLedger } from '../../../evidence/src/index';

export type QwenParameterType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

export interface QwenParameterSchemaProperty {
  type: QwenParameterType;
  description?: string;
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  /** Esquema de los elementos cuando `type` es 'array'. */
  items?: QwenParameterSchema;
  /** Mínimo de elementos cuando `type` es 'array'. */
  minItems?: number;
}

export interface QwenParameterSchema {
  type: 'object';
  description?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, QwenParameterSchemaProperty>;
  anyOf?: Array<{ required?: string[] }>;
  oneOf?: Array<{ required?: string[] }>;
}

export interface QwenToolDefinition {
  capability_key: string;
  description: string;
  parameters_schema: QwenParameterSchema;
}

type QwenClarificationMissing = 'customer' | 'document_id' | 'ambiguous' | 'unsupported' | 'pricing';

interface QwenClarificationResponseData {
  kind: 'request_clarification';
  missing: QwenClarificationMissing;
  reason: string;
}

export interface QwenChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: QwenParameterSchema;
  };
}

export interface QwenChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | null;
  tool_calls?: QwenChatToolCall[] | null;
}

export interface QwenChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: unknown;
  };
}

export interface QwenChatCompletionChoice {
  index: number;
  message: QwenChatMessage;
  finish_reason?: string | null;
}

export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export interface QwenChatCompletionsResponse {
  id?: string | null;
  model?: string | null;
  choices?: QwenChatCompletionChoice[] | null;
  raw?: unknown;
}

export interface QwenChatCompletionsRequest {
  model: string;
  temperature: number;
  messages: [QwenChatMessage, ...QwenChatMessage[]];
  tools: QwenChatTool[];
  tool_choice: 'auto' | 'required' | { type: 'function'; function: { name: string } };
}

export interface QwenChatCompletionsTransport {
  chatCompletions(request: QwenChatCompletionsRequest): QwenChatCompletionsResponse;
}

export interface QwenOrchestratorOptions {
  baseUrl?: string | null;
  model?: string | null;
  apiKey?: string | null;
  temperature?: number;
  toolChoice?: QwenChatCompletionsRequest['tool_choice'] | null;
  toolCatalog?: QwenToolDefinition[];
  chatCompletionsTransport?: QwenChatCompletionsTransport | null;
  now?: () => Date;
  systemPrompt?: string | null;
  requestTimeoutMs?: number;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePaymentStatus(value: unknown): 'pending' | 'paid' | 'overdue' | null {
  const candidate = normalizeOptionalString(value);
  return candidate === 'pending' || candidate === 'paid' || candidate === 'overdue' ? candidate : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneResponse(response: OrchestrationResponse): OrchestrationResponse {
  return {
    ...response,
    data: response.data ? structuredClone(response.data) : null
  };
}

function cloneProposal(proposal: OrchestrationProposal): OrchestrationProposal {
  return {
    ...proposal,
    params: structuredClone(proposal.params)
  };
}

function cloneValidation(validation: OrchestrationValidationResult): OrchestrationValidationResult {
  return {
    ...validation,
    params: validation.params ? structuredClone(validation.params) : null
  };
}

function cloneOutcome(outcome: OrchestrationOutcome): OrchestrationOutcome {
  return {
    ...outcome,
    proposal: outcome.proposal ? cloneProposal(outcome.proposal) : null,
    validation: outcome.validation ? cloneValidation(outcome.validation) : null,
    response: cloneResponse(outcome.response),
    workflow_result: outcome.workflow_result,
    evidence_links: [...outcome.evidence_links]
  };
}

function mergeLists(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    if (!list) {
      continue;
    }
    for (const item of list) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (normalized.length === 0 || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }
  }
  return merged;
}

const MAX_CONVERSATION_HISTORY_TURNS = 6;
const MAX_CONVERSATION_HISTORY_MESSAGES = MAX_CONVERSATION_HISTORY_TURNS * 2;

function normalizeConversationHistory(history: ConversationHistoryTurn[] | null | undefined, currentUserMessage: string): QwenChatMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }
  const current = currentUserMessage.trim();
  const sanitized = history
    .map((turn) => {
      if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
        return null;
      }
      const role = normalizeOptionalString((turn as { role?: unknown }).role);
      const content = normalizeOptionalString((turn as { content?: unknown }).content);
      if ((role !== 'user' && role !== 'assistant') || !content) {
        return null;
      }
      return { role, content } as QwenChatMessage;
    })
    .filter((turn): turn is QwenChatMessage => Boolean(turn));
  const withoutDuplicateCurrentUser = sanitized.filter((turn, index) => !(index === sanitized.length - 1 && turn.role === 'user' && turn.content === current));
  return withoutDuplicateCurrentUser.slice(-MAX_CONVERSATION_HISTORY_MESSAGES);
}

function buildResponse(input: {
  status: OrchestrationStatus;
  message: string;
  data?: QwenClarificationResponseData | Record<string, unknown> | null;
}): OrchestrationResponse {
  return {
    response_source: 'workflow_blocked',
    workflow_kind: null,
    status: input.status,
    message: input.message,
    data: input.data ? (structuredClone(input.data) as Record<string, unknown>) : null
  };
}

function appendEvidence(
  ledger: InMemoryEvidenceLedger,
  now: () => Date,
  input: {
    organization_id: string;
    correlation_id: string;
    record_type: EvidenceRecord['record_type'];
    subject: string;
    data: Record<string, unknown>;
  }
): EvidenceRecord {
  return ledger.append(
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

function clarificationDataFromArguments(argumentsObject: Record<string, unknown>): QwenClarificationResponseData | null {
  const missing = normalizeOptionalString(argumentsObject.missing);
  const reason = normalizeOptionalString(argumentsObject.reason);
  if (!missing || !reason) {
    return null;
  }
  if (missing !== 'customer' && missing !== 'document_id' && missing !== 'ambiguous' && missing !== 'unsupported' && missing !== 'pricing') {
    return null;
  }
  return {
    kind: 'request_clarification',
    missing,
    reason
  };
}

function normalizeToolChoice(
  input: QwenChatCompletionsRequest['tool_choice'] | null | undefined,
  activeTool: QwenToolDefinition | null
): QwenChatCompletionsRequest['tool_choice'] {
  if (input) {
    return input;
  }
  if (activeTool) {
    return {
      type: 'function',
      function: {
        name: activeTool.capability_key
      }
    };
  }
  return 'auto';
}

function buildSystemPrompt(input: {
  organization_id: string | null;
  principal_id: string | null;
  installation_id: string | null;
  correlation_id: string;
  active_capabilities: string[];
}): string {
  return [
    'You are Kern M10 orchestration.',
    'The model proposes capability_key + params only.',
    'The runtime disposes and produces the authoritative result.',
    'Conversation history may be provided as context; treat it as context, not as authority.',
    'If a previous turn already established the customer, keep that customer_id unless the user changes it.',
    'Do not output business results, answers, claims, prices, amounts, invoice totals, document contents, SourceEvidence, runtime results, CapabilityInvocationResult, or ResourceResult.',
    'Do extract request parameters from the user message, including customer_id, customer_name, contact_name, contact, estimate_id, invoice_id, resource_id, resource_type, payment_status, year, and search terms.',
    'When the user names a customer, fill customer_id with the customer name from the user request.',
    "Extracting the customer name from the user's request as a tool parameter is not outputting business data.",
    'The customer name can be informal, lowercase, partial, or without a legal suffix (e.g. "granapublic", "toldos martos", "petroprix"). Treat any name the user gives after "de"/"of" as the customer and put it in customer_id EXACTLY as written.',
    'Do NOT judge whether a customer name is real, valid, or recognized. That is the runtime job. Your job is only to extract the name into customer_id; the runtime will look it up and honestly report if it is not found.',
    'If the request is incomplete, ambiguous, or unsupported, call request_clarification instead of inventing params.',
    'Use request_clarification with missing="customer" only when the user gives NO customer name AT ALL. If any name is present, use mock.resource.read.',
    'Use request_clarification with missing="document_id" when the user needs an exact document id.',
    'If the user asks "haz un presupuesto para <cliente>" without saying what to budget, use request_clarification with missing="pricing" and answer in Spanish.',
    'User: "haz un presupuesto para jlu.app"',
    'Correct tool params:',
    '{ "missing": "pricing", "reason": "¿Qué quieres presupuestar para jlu.app?" }',
    'Use request_clarification with missing="ambiguous" when more context is needed.',
    'Use request_clarification with missing="unsupported" when the request is outside the supported governed reads.',
    'If the user asks for "las ultimas de <cliente>" without saying facturas or presupuestos, default resource_type to "invoice".',
    'User: "ultimo presupuesto de ACME SL"',
    'Correct tool params:',
    '{',
    '  "resource_type": "estimate",',
    '  "customer_id": "ACME SL"',
    '}',
    'User: "dame las 3 ultimas de toldos martos"',
    'Correct tool params:',
    '{ "resource_type": "invoice", "customer_id": "toldos martos", "limit": 3 }',
    "For latest estimate or invoice of a named customer, always provide customer_id with the customer name from the user's request.",
    'If the user asks for the latest N estimates or invoices of a customer, set limit to that positive integer and still provide customer_id.',
    'Use limit only with customer_id.',
    'Do not use limit with payment_status, year, estimate_id, invoice_id, or resource_id.',
    'For invoice payment-status lists, use resource_type="invoice" together with payment_status="pending", "paid", or "overdue".',
    'Examples:',
    '{ "resource_type": "invoice", "payment_status": "overdue" }',
    '{ "resource_type": "invoice", "payment_status": "pending", "customer_id": "Cliente Ejemplo SL" }',
    '{ "resource_type": "invoice", "payment_status": "paid", "customer_id": "Cliente Demo SL" }',
    '{ "resource_type": "invoice", "customer_id": "ACME SL", "limit": 3 }',
    'For year-based document lists, use year with a four-digit string like "2025" and do not compute date ranges or timestamps.',
    '{ "resource_type": "invoice", "year": "2025" }',
    '{ "resource_type": "invoice", "year": "2025", "customer_id": "Cliente Ejemplo SL" }',
    'Do not use payment_status with resource_type="estimate".',
    'Do not invent estimate_id or invoice_id.',
    'For PacoPrint pricing requests like "precio de <articulo> <medidas> <unidades> <opciones>", use pricing.quote_line.',
    'pricing.quote_line carries only intent: article, unidades, alto, ancho, and mentioned options. Do not choose articulo_id or calculate price.',
    'If a PacoPrint pricing request is incomplete, keep the proposal minimal and let the runtime clarify missing details.',
    'User: "precio de lona 100x200 2 unidades con ojales"',
    'Correct tool params:',
    '{',
    '  "article": "lona",',
    '  "unidades": 2,',
    '  "alto": 100,',
    '  "ancho": 200,',
    '  "options": { "ojales": true }',
    '}',
    'User: "precio de lona con ojales"',
    'Correct tool params:',
    '{ "article": "lona", "options": { "ojales": true } }',
    'User: "dame precio de tarjetas 500 unidades"',
    'Correct tool params:',
    '{ "article": "tarjetas", "unidades": 500 }',
    `organization_id=${input.organization_id ?? 'null'}`,
    `principal_id=${input.principal_id ?? 'null'}`,
    `installation_id=${input.installation_id ?? 'null'}`,
    `correlation_id=${input.correlation_id}`,
    `active_capabilities=${JSON.stringify(input.active_capabilities)}`
  ].join('\n');
}

function buildToolArguments(candidate: unknown): Record<string, unknown> | null {
  if (!isPlainObject(candidate)) {
    return null;
  }
  return structuredClone(candidate);
}

function unwrapToolArguments(candidate: unknown, depth = 0): unknown {
  if (depth > 4) {
    return null;
  }
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      return null;
    }
    try {
      return unwrapToolArguments(JSON.parse(trimmed), depth + 1);
    } catch {
      return null;
    }
  }
  if (!isPlainObject(candidate)) {
    return null;
  }

  const current = candidate as Record<string, unknown>;
  if (isPlainObject(current.function) && Object.prototype.hasOwnProperty.call(current.function, 'arguments')) {
    return unwrapToolArguments(current.function.arguments, depth + 1);
  }
  if (Object.prototype.hasOwnProperty.call(current, 'arguments')) {
    return unwrapToolArguments(current.arguments, depth + 1);
  }
  return current;
}

function parseToolArguments(toolCall: QwenChatToolCall): Record<string, unknown> | null {
  const unwrapped = unwrapToolArguments(toolCall.function.arguments);
  if (!unwrapped) {
    return null;
  }
  return buildToolArguments(unwrapped);
}

function measureToolArgumentsLength(value: unknown): number {
  if (typeof value === 'string') {
    return value.length;
  }
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function responseContainsClaimedResult(content: string | null | undefined): boolean {
  if (!content || content.trim().length === 0) {
    return false;
  }
  const lower = content.toLowerCase();
  if (lower.trim().startsWith('{')) {
    return true;
  }
  return [
    'result',
    'answer',
    'output',
    'data',
    'value',
    'price',
    'amount',
    'total',
    'factura',
    'invoice',
    'presupuesto',
    'estimate'
  ].some((token) => lower.includes(token));
}

function validateToolArguments(definition: QwenToolDefinition, params: Record<string, unknown>): boolean {
  const schema = definition.parameters_schema;
  if (schema.type !== 'object') {
    return false;
  }
  if (schema.required) {
    for (const requiredKey of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(params, requiredKey)) {
        return false;
      }
    }
  }
  const conditionalSets = [
    ...(Array.isArray((schema as { anyOf?: Array<{ required?: string[] }> }).anyOf)
      ? ((schema as { anyOf: Array<{ required?: string[] }> }).anyOf ?? []).map((candidate) => candidate.required ?? null)
      : []),
    ...(Array.isArray((schema as { oneOf?: Array<{ required?: string[] }> }).oneOf)
      ? ((schema as { oneOf: Array<{ required?: string[] }> }).oneOf ?? []).map((candidate) => candidate.required ?? null)
      : [])
  ].filter((candidate): candidate is string[] => Array.isArray(candidate) && candidate.length > 0);
  if (conditionalSets.length > 0) {
    const satisfiesAtLeastOne = conditionalSets.some((requiredKeys) =>
      requiredKeys.every((requiredKey) => Object.prototype.hasOwnProperty.call(params, requiredKey))
    );
    if (!satisfiesAtLeastOne) {
      return false;
    }
  }
  if (schema.additionalProperties === false && schema.properties) {
    for (const key of Object.keys(params)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
        return false;
      }
    }
  }
  if (!schema.properties) {
    return true;
  }
  const resourceType = typeof params.resource_type === 'string' ? params.resource_type : null;
  const paymentStatus = normalizePaymentStatus(params.payment_status);
  if (Object.prototype.hasOwnProperty.call(params, 'payment_status')) {
    if (!paymentStatus || resourceType !== 'invoice') {
      return false;
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      continue;
    }
    const value = params[key];
    if (property.type === 'string' && typeof value !== 'string') return false;
    if (property.type === 'number' && typeof value !== 'number') return false;
    if (property.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) return false;
    if (property.type === 'boolean' && typeof value !== 'boolean') return false;
    if (property.type === 'array' && !Array.isArray(value)) return false;
    if (property.type === 'object' && !isPlainObject(value)) return false;
    if (property.enum && typeof value === 'string' && !property.enum.includes(value)) return false;
    if (typeof value === 'number') {
      if (typeof property.minimum === 'number' && value < property.minimum) return false;
      if (typeof property.maximum === 'number' && value > property.maximum) return false;
    }
  }
  return true;
}

function chooseActiveTool(
  activeCapabilities: string[],
  toolCatalog: QwenToolDefinition[],
  force_capability_key: string | null
): QwenToolDefinition | null {
  if (force_capability_key) {
    return toolCatalog.find((tool) => tool.capability_key === force_capability_key && activeCapabilities.includes(tool.capability_key)) ?? null;
  }
  if (toolCatalog.length === 1) {
    return toolCatalog[0];
  }
  return null;
}

function buildProposalOutcome(input: {
  request: OrchestrationRequest;
  proposal: OrchestrationProposal | null;
  status: OrchestrationStatus;
  reason: string;
  evidence_links: string[];
  response_data?: QwenClarificationResponseData | Record<string, unknown> | null;
}): OrchestrationOutcome {
  return cloneOutcome({
    request_id: input.request.request_id,
    organization_id: input.request.organization_id,
    principal_id: input.request.principal_id ?? input.request.actor?.principal_id ?? null,
    correlation_id: input.request.correlation_id,
    installation_id: input.request.installation_id ?? input.request.context?.installation_id ?? null,
    status: input.status,
    proposal: input.proposal,
    validation: input.proposal
      ? {
          valid: input.status === 'proposal',
          status: input.status,
          reason: input.reason,
          capability_key: input.proposal.capability_key,
          params: structuredClone(input.proposal.params),
          capability_active: input.status === 'proposal',
          capability_known: true
        }
      : {
          valid: false,
          status: input.status,
          reason: input.reason,
          capability_key: null,
          params: null,
          capability_active: false,
          capability_known: false
        },
    workflow_kind: null,
    workflow_result: null,
    response: buildResponse({
      status: input.status,
      message: input.reason,
      data: input.response_data ?? null
    }),
    evidence_links: input.evidence_links,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reason: input.reason
  });
}

function defaultTransportFactory(options: { baseUrl: string; apiKey: string | null; requestTimeoutMs: number }): QwenChatCompletionsTransport {
  const completionsUrl = resolveChatCompletionsUrl(options.baseUrl);
  const script = `
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const headers = { 'content-type': 'application/json' };
if (input.apiKey) {
  headers.authorization = \`Bearer \${input.apiKey}\`;
}

const controller = new AbortController();
const timeout = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? setTimeout(() => controller.abort(), input.timeoutMs) : null;

try {
  const response = await fetch(input.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(input.body),
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

  return {
    chatCompletions(request: QwenChatCompletionsRequest): QwenChatCompletionsResponse {
      const child = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        {
          input: JSON.stringify({
            url: completionsUrl,
            apiKey: options.apiKey,
            timeoutMs: options.requestTimeoutMs,
            body: request
          }),
          encoding: 'utf8'
        }
      );
      if (child.error) {
        throw child.error;
      }
      if (child.status !== 0) {
        throw new Error(child.stderr || `qwen transport failed with status ${child.status}`);
      }
      const output = child.stdout ? JSON.parse(child.stdout) as {
        ok: boolean;
        status: number;
        statusText: string;
        json: unknown;
        text: string;
      } : null;
      if (!output) {
        throw new Error('qwen transport returned no output');
      }
      if (!output.ok) {
        throw new Error(`qwen transport failed with status ${output.status}: ${output.statusText}`);
      }
      return {
        raw: output.json ?? output.text,
        ...(isPlainObject(output.json) ? output.json : {})
      } as QwenChatCompletionsResponse;
    }
  };
}

export class QwenOrchestrator implements OrchestratorPort {
  private readonly now: () => Date;
  private readonly model: string;
  private readonly baseUrl: string | null;
  private readonly apiKey: string | null;
  private readonly temperature: number;
  private readonly toolChoice: QwenChatCompletionsRequest['tool_choice'] | null;
  private readonly toolCatalog: QwenToolDefinition[];
  private readonly transport: QwenChatCompletionsTransport;
  private readonly systemPrompt: string | null;
  private readonly evidenceLedger = new InMemoryEvidenceLedger();
  private readonly requestTimeoutMs: number;

  constructor(options: QwenOrchestratorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.model = normalizeOptionalString(options.model) ?? 'kern-vl';
    this.baseUrl = normalizeOptionalString(options.baseUrl ?? null);
    this.apiKey = normalizeOptionalString(options.apiKey ?? null);
    this.temperature = typeof options.temperature === 'number' ? options.temperature : 0.1;
    this.toolChoice = options.toolChoice ?? null;
    this.toolCatalog = options.toolCatalog ? options.toolCatalog.map((tool) => ({ ...tool, parameters_schema: structuredClone(tool.parameters_schema) })) : [];
    this.transport =
      options.chatCompletionsTransport ??
      (this.baseUrl
        ? defaultTransportFactory({
            baseUrl: this.baseUrl,
            apiKey: this.apiKey,
            requestTimeoutMs: options.requestTimeoutMs ?? 30_000
          })
        : {
            chatCompletions(): QwenChatCompletionsResponse {
              throw new Error('qwen transport unavailable');
            }
          });
    this.systemPrompt = options.systemPrompt ?? null;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  getEvidenceLedger(): InMemoryEvidenceLedger {
    return this.evidenceLedger;
  }

  propose(request: OrchestrationRequest): OrchestrationOutcome {
    const now = this.now;
    const correlation_id = normalizeCorrelationId({
      request_id: request.request_id,
      correlation_id: request.correlation_id
    });
    const request_id = request.request_id.trim();
    const organization_id = normalizeOptionalString(request.organization_id);
    const principal_id = normalizeOptionalString(request.principal_id ?? request.actor?.principal_id ?? null);
    const installation_id = normalizeOptionalString(request.installation_id ?? request.context?.installation_id ?? null);
    const user_message = request.user_message.trim();
    const active_capabilities = mergeLists(request.context?.active_capabilities ?? []);
    const conversationHistory = normalizeConversationHistory(request.conversation_history ?? null, user_message);

    const requestedEvidence = appendEvidence(this.evidenceLedger, now, {
      organization_id: organization_id ?? 'unknown',
      correlation_id,
      record_type: 'model_orchestration_requested',
      subject: this.model,
      data: {
        request_id,
        model: this.model,
        base_url: this.baseUrl,
        installation_id,
        active_capabilities,
        temperature: this.temperature,
        tool_choice: this.toolChoice ?? 'auto'
      }
    });

    if (!organization_id || !principal_id || user_message.length === 0) {
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'blocked',
        reason: !organization_id ? 'organization required for orchestration' : !principal_id ? 'principal required for orchestration' : 'user message required for orchestration',
        evidence_links: [requestedEvidence.evidence_id]
      });
    }

    const availableTools = this.toolCatalog.filter(
      (tool) => tool.capability_key === 'request_clarification' || active_capabilities.includes(tool.capability_key)
    );
    const forcedCapabilityKey = normalizeOptionalString(request.context?.force_capability_key ?? null);
    const forcedTool = chooseActiveTool(active_capabilities, this.toolCatalog, forcedCapabilityKey);
    if (forcedCapabilityKey && !forcedTool) {
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'denied',
        reason: 'forced capability unavailable',
        evidence_links: [requestedEvidence.evidence_id]
      });
    }

    const toolChoice = normalizeToolChoice(
      forcedTool ? null : this.toolChoice,
      forcedTool ?? (availableTools.length === 1 ? availableTools[0] : null)
    );
    const tools = (forcedTool ? [forcedTool] : availableTools).map<QwenChatTool>((tool) => ({
      type: 'function',
      function: {
        name: tool.capability_key,
        description: tool.description,
        parameters: structuredClone(tool.parameters_schema)
      }
    }));

    let completion: QwenChatCompletionsResponse;
    try {
      completion = this.transport.chatCompletions({
        model: this.model,
        temperature: this.temperature,
        tool_choice: toolChoice,
        tools,
        messages: [
          {
            role: 'system',
            content:
              this.systemPrompt ??
              buildSystemPrompt({
                organization_id,
                principal_id,
                installation_id,
                correlation_id,
                active_capabilities
              })
          },
          ...conversationHistory,
          {
            role: 'user',
            content: user_message
          }
        ]
      });
    } catch (error) {
      appendEvidence(this.evidenceLedger, now, {
        organization_id: organization_id ?? 'unknown',
        correlation_id,
        record_type: 'model_orchestration_error',
        subject: this.model,
        data: {
          request_id,
          model: this.model,
          error: error instanceof Error ? error.message : 'qwen transport failed'
        }
      });
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'error',
        reason: error instanceof Error ? error.message : 'qwen transport failed',
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    const choice = completion.choices?.[0] ?? null;
    if (!choice) {
      appendEvidence(this.evidenceLedger, now, {
        organization_id: organization_id ?? 'unknown',
        correlation_id,
        record_type: 'model_orchestration_error',
        subject: this.model,
        data: {
          request_id,
          model: this.model,
          error: 'completion missing choices'
        }
      });
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'error',
        reason: 'completion missing choices',
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls ?? [];
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      appendEvidence(this.evidenceLedger, now, {
        organization_id: organization_id ?? 'unknown',
        correlation_id,
        record_type: 'model_no_tool_call',
        subject: this.model,
        data: {
          request_id,
          model: this.model,
          content: assistantMessage.content ?? null
        }
      });
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'no_proposal',
        reason: 'no tool call',
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    const toolCall = toolCalls.find((candidate) => candidate.type === 'function' && normalizeOptionalString(candidate.function?.name ?? null));
    if (!toolCall) {
      appendEvidence(this.evidenceLedger, now, {
        organization_id: organization_id ?? 'unknown',
        correlation_id,
        record_type: 'model_orchestration_error',
        subject: this.model,
        data: {
          request_id,
          model: this.model,
          error: 'tool call missing function name'
        }
      });
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'blocked',
        reason: 'tool call missing function name',
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    appendEvidence(this.evidenceLedger, now, {
      organization_id: organization_id ?? 'unknown',
      correlation_id,
      record_type: 'model_tool_call_received',
      subject: toolCall.function.name,
      data: {
        request_id,
        model: this.model,
        tool_call_id: toolCall.id,
        capability_key: toolCall.function.name,
        arguments_length: measureToolArgumentsLength(toolCall.function.arguments)
      }
    });

    const matchingTool = availableTools.find((tool) => tool.capability_key === toolCall.function.name);
    if (!matchingTool) {
      return buildProposalOutcome({
        request,
        proposal: null,
        status: active_capabilities.includes(toolCall.function.name) ? 'blocked' : 'denied',
        reason: active_capabilities.includes(toolCall.function.name) ? 'capability definition unavailable' : 'capability unknown or inactive',
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    const parsedArguments = parseToolArguments(toolCall);
    if (!parsedArguments || !validateToolArguments(matchingTool, parsedArguments)) {
      appendEvidence(this.evidenceLedger, now, {
        organization_id: organization_id ?? 'unknown',
        correlation_id,
        record_type: 'model_orchestration_error',
        subject: this.model,
        data: {
          request_id,
          model: this.model,
          capability_key: matchingTool.capability_key,
          error: 'tool arguments invalid'
        }
      });
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'blocked',
        reason: 'tool arguments invalid',
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    if (matchingTool.capability_key === 'request_clarification') {
      const clarification = clarificationDataFromArguments(parsedArguments);
      if (!clarification) {
        appendEvidence(this.evidenceLedger, now, {
          organization_id: organization_id ?? 'unknown',
          correlation_id,
          record_type: 'model_orchestration_error',
          subject: this.model,
          data: {
            request_id,
            model: this.model,
            capability_key: matchingTool.capability_key,
            error: 'clarification arguments invalid'
          }
        });
        return buildProposalOutcome({
          request,
          proposal: null,
          status: 'blocked',
          reason: 'clarification arguments invalid',
          evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
        });
      }
      return buildProposalOutcome({
        request,
        proposal: null,
        status: 'no_proposal',
        reason: clarification.reason,
        response_data: clarification,
        evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
      });
    }

    if (responseContainsClaimedResult(assistantMessage.content)) {
      appendEvidence(this.evidenceLedger, now, {
        organization_id: organization_id ?? 'unknown',
        correlation_id,
        record_type: 'model_claimed_result_ignored',
        subject: this.model,
        data: {
          request_id,
          model: this.model,
          capability_key: matchingTool.capability_key
        }
      });
    }

    const proposal: OrchestrationProposal = {
      proposal_id: createDeterministicId('qwen-orchestration-proposal', {
        request_id,
        correlation_id,
        capability_key: matchingTool.capability_key,
        params: parsedArguments
      }),
      capability_key: matchingTool.capability_key,
      params: parsedArguments,
      confidence: null,
      reason: 'model tool call selected',
      evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
    };

    return buildProposalOutcome({
      request,
      proposal,
      status: 'proposal',
      reason: 'model tool call selected',
      evidence_links: this.evidenceLedger.listByCorrelation(correlation_id).map((record) => record.evidence_id)
    });
  }
}

export function createNodeFetchChatCompletionsTransport(options: {
  baseUrl: string;
  apiKey?: string | null;
  timeoutMs?: number;
}): QwenChatCompletionsTransport {
  const completionsUrl = resolveChatCompletionsUrl(options.baseUrl);
  return {
    chatCompletions(request: QwenChatCompletionsRequest): QwenChatCompletionsResponse {
      const script = `
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const headers = { 'content-type': 'application/json' };
if (input.apiKey) {
  headers.authorization = \`Bearer \${input.apiKey}\`;
}

const controller = new AbortController();
const timeout = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? setTimeout(() => controller.abort(), input.timeoutMs) : null;

try {
  const response = await fetch(input.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(input.request),
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
    body: json ?? text
  }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  if (timeout) clearTimeout(timeout);
}
`;
      const child = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        {
          input: JSON.stringify({
            url: completionsUrl,
            apiKey: normalizeOptionalString(options.apiKey ?? null),
            timeoutMs: options.timeoutMs ?? 30_000,
            request
          }),
          encoding: 'utf8'
        }
      );
      if (child.error) {
        throw child.error;
      }
      if (child.status !== 0) {
        throw new Error(child.stderr || `qwen transport failed with status ${child.status}`);
      }
      const output = child.stdout ? (JSON.parse(child.stdout) as { ok: boolean; status: number; statusText: string; body: unknown }) : null;
      if (!output) {
        throw new Error('qwen transport returned no output');
      }
      if (!output.ok) {
        throw new Error(`qwen transport failed with status ${output.status}: ${output.statusText}`);
      }
      return {
        raw: output.body,
        ...(isPlainObject(output.body) ? output.body : {})
      } as QwenChatCompletionsResponse;
    }
  };
}

export function createQwenOrchestrator(options: QwenOrchestratorOptions = {}): QwenOrchestrator {
  return new QwenOrchestrator(options);
}
