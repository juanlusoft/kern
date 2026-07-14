import {
  createEvidenceRecord,
  normalizeCorrelationId,
  normalizeResourceQuery,
  type GovernedWorkflowKind,
  type GovernedWorkflowRequest,
  type GovernedWorkflowResponse,
  type GovernedWorkflowResult,
  type MockEmailSendWorkflowInput,
  type MockReadEstimateWorkflowInput,
  type NumaHrReadWorkflowInput,
  type PricingQuoteLineWorkflowInput,
  type PricingQuoteDraftWorkflowInput,
  type PricingQuoteDraftLineInput,
  type OrchestratorPort,
  type OrchestrationOutcome,
  type OrchestrationProposal,
  type OrchestrationRequest,
  type OrchestrationResponse,
  type OrchestrationStatus,
  type OrchestrationValidationResult,
  type WorkflowExecutionStatus
} from '../../contracts/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import { deriveHoldedReadRoutingOverride } from './holded-read';
import {
  buildNumaHrTimeTypeLabelById,
  deriveNumaHrRoutingOverride,
  normalizeNumaHrTimeTypeLabels,
  resolveNumaHrTimeTypeIds,
  type NumaHrToolMappingConfig
} from './numa-hr';

export interface OrchestrationBoundaryOptions {
  orchestrator?: OrchestratorPort | null;
  workflowRuntime?: InMemoryGovernedWorkflowRuntime;
  installationCapabilities?: Record<string, string[]>;
  numaHrConfig?: NumaHrToolMappingConfig | null;
  now?: () => Date;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOptions(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value as Record<string, unknown>) : null;
}

function cloneResponse(response: OrchestrationResponse): OrchestrationResponse {
  return {
    ...response,
    data: response.data ? structuredClone(response.data) : null
  };
}

function cloneOutcome(outcome: OrchestrationOutcome): OrchestrationOutcome {
  return {
    ...outcome,
    proposal: outcome.proposal
      ? {
          ...outcome.proposal,
          params: structuredClone(outcome.proposal.params),
          evidence_links: outcome.proposal.evidence_links ? [...outcome.proposal.evidence_links] : undefined
        }
      : null,
    validation: outcome.validation
      ? {
          ...outcome.validation,
          params: outcome.validation.params ? structuredClone(outcome.validation.params) : null
        }
      : null,
    response: cloneResponse(outcome.response),
    workflow_result: outcome.workflow_result
      ? {
          ...outcome.workflow_result,
          response: {
            ...outcome.workflow_result.response,
            data: outcome.workflow_result.response.data ? structuredClone(outcome.workflow_result.response.data) : null
          },
          capability_result: outcome.workflow_result.capability_result
            ? {
                ...outcome.workflow_result.capability_result,
                output: outcome.workflow_result.capability_result.output
                  ? {
                      ...outcome.workflow_result.capability_result.output,
                      result: structuredClone(outcome.workflow_result.capability_result.output.result)
                    }
                  : null,
                evidence_links: [...outcome.workflow_result.capability_result.evidence_links]
              }
            : null,
          evidence_links: [...outcome.workflow_result.evidence_links],
          steps: outcome.workflow_result.steps.map((step) => ({ ...step, details: structuredClone(step.details) })),
          evidence_trace: {
            evidence_ids: [...outcome.workflow_result.evidence_trace.evidence_ids],
            record_types: [...outcome.workflow_result.evidence_trace.record_types]
          }
        }
      : null,
    evidence_links: [...outcome.evidence_links]
  };
}

function createResponse(input: {
  workflow_kind: GovernedWorkflowKind | null;
  status: OrchestrationStatus | WorkflowExecutionStatus;
  message: string;
  data: Record<string, unknown> | null;
  response_source: 'runtime_result' | 'workflow_blocked';
}): OrchestrationResponse {
  return {
    response_source: input.response_source,
    workflow_kind: input.workflow_kind,
    status: input.status,
    message: input.message,
    data: input.data ? structuredClone(input.data) : null
  };
}

function appendEvidence(
  ledger: InMemoryEvidenceLedger,
  now: () => Date,
  input: {
    organization_id: string;
    correlation_id: string;
    record_type:
      | 'orchestration_requested'
      | 'orchestration_proposal_created'
      | 'orchestration_no_proposal'
      | 'orchestration_proposal_denied'
      | 'orchestration_proposal_blocked'
      | 'orchestration_proposal_validated'
      | 'orchestration_claimed_result_ignored'
      | 'workflow_invocation_requested'
      | 'workflow_response_created';
    subject: string;
    data: Record<string, unknown>;
  }
) {
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

function hasUnsafeClaimFields(value: Record<string, unknown>): string[] {
  const knownFields = [
    'result',
    'answer',
    'data',
    'value',
    'output',
    'business_data',
    'claimed_result',
    'model_claimed_result',
    'caller_result',
    'assistant_result',
    'claimed_output'
  ];
  return knownFields.filter((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function normalizeInstallationCapabilities(
  installationCapabilities: Record<string, string[]> | undefined,
  installation_id: string | null
): string[] {
  if (!installation_id) {
    return [];
  }
  const capabilities = installationCapabilities?.[installation_id];
  return Array.isArray(capabilities) ? capabilities.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
}

function capabilityKnown(workflowRuntime: InMemoryGovernedWorkflowRuntime, capability_key: string): boolean {
  return Boolean(workflowRuntime.getCapabilityRuntime().getCapability(capability_key));
}

function normalizeCapabilityParams(input: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(input);
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

function sanitizeProposal(proposal: OrchestrationProposal): OrchestrationProposal {
  return {
    proposal_id: proposal.proposal_id,
    capability_key: proposal.capability_key,
    params: structuredClone(proposal.params),
    confidence: proposal.confidence,
    reason: proposal.reason
  };
}

function normalizeCustomerLookupParam(value: unknown): string | null {
  return normalizeOptionalString(value);
}

function normalizeYear(value: unknown): string | null {
  const candidate = normalizeOptionalString(value);
  return candidate && /^\d{4}$/.test(candidate) ? candidate : null;
}

function normalizeForRelativeMatching(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveRelativeCalendarYear(value: unknown, now: Date): string | null {
  const candidate = normalizeOptionalString(value);
  if (!candidate) {
    return null;
  }
  const normalized = normalizeForRelativeMatching(candidate);
  const currentYear = now.getUTCFullYear();
  if (/\b(?:el\s+)?ano\s+pasado\b/.test(normalized)) {
    return String(currentYear - 1);
  }
  if (/\b(?:este|actual)\s+ano\b/.test(normalized) || /\bano\s+actual\b/.test(normalized)) {
    return String(currentYear);
  }
  return null;
}

function isRelativeCalendarYearExpression(value: unknown): boolean {
  const candidate = normalizeOptionalString(value);
  if (!candidate) {
    return false;
  }
  const normalized = normalizeForRelativeMatching(candidate);
  return /\b(?:el\s+)?ano\s+pasado\b/.test(normalized) || /\b(?:este|actual)\s+ano\b/.test(normalized) || /\bano\s+actual\b/.test(normalized);
}

function resolveCalendarYear(value: unknown, message: string, now: Date): string | null {
  return resolveRelativeCalendarYear(message, now) ?? resolveRelativeCalendarYear(value, now) ?? normalizeYear(value);
}

function yearDateRange(year: string): { date_from: string; date_to: string } {
  return {
    date_from: `${year}-01-01`,
    date_to: `${year}-12-31`
  };
}

function normalizeLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function isValidPricingQuoteLineProposal(params: Record<string, unknown>): boolean {
  const article = normalizeOptionalString(params.article);
  if (!article) {
    return false;
  }
  const unidades = params.unidades === undefined || params.unidades === null ? null : normalizeLimit(params.unidades);
  const alto = params.alto === undefined || params.alto === null ? null : normalizeOptionalNumber(params.alto);
  const ancho = params.ancho === undefined || params.ancho === null ? null : normalizeOptionalNumber(params.ancho);
  const options = params.options === undefined || params.options === null ? null : normalizeOptions(params.options);
  if (params.unidades !== undefined && params.unidades !== null && unidades === null) {
    return false;
  }
  if (params.alto !== undefined && params.alto !== null && alto === null) {
    return false;
  }
  if (params.ancho !== undefined && params.ancho !== null && ancho === null) {
    return false;
  }
  if (params.options !== undefined && params.options !== null && options === null) {
    return false;
  }
  return true;
}

function isValidNumaHrProposal(capability_key: string, params: Record<string, unknown>): boolean {
  const forbiddenFields = [
    'organization_id',
    'correlation_id',
    'employee_id',
    'time_type_id',
    'time_type_ids',
    'annual_quota_by_time_type',
    'group_id',
    'limit',
    'offset',
    'include_pending',
    'theoretical_workday_minutes'
  ];
  if (forbiddenFields.some((field) => Object.prototype.hasOwnProperty.call(params, field))) {
    return false;
  }
  const employee_name = normalizeOptionalString(params.employee_name);
  if (isCollectiveEmployeePhrase(employee_name)) {
    return false;
  }
  if (capability_key === 'presence.current-workers') {
    return true;
  }
  if (capability_key === 'punch.day') {
    return Boolean(employee_name && normalizeOptionalString(params.date));
  }
  if (capability_key === 'punch.day-workers') {
    return Boolean(normalizeOptionalString(params.date));
  }
  if (capability_key === 'punch.range') {
    return Boolean(employee_name && normalizeOptionalString(params.date_from) && normalizeOptionalString(params.date_to));
  }
  if (capability_key === 'leave.days' || capability_key === 'leave.balance') {
    const year = normalizeYear(params.year) ?? (isRelativeCalendarYearExpression(params.year) ? 'relative-year' : null);
    const time_type_labels = normalizeNumaHrTimeTypeLabels(params.time_type_labels);
    return Boolean(year && employee_name && time_type_labels && time_type_labels.length > 0);
  }
  if (capability_key === 'leave.detail') {
    const time_type_labels = normalizeNumaHrTimeTypeLabels(params.time_type_labels);
    return Boolean(employee_name && normalizeOptionalString(params.date_from) && normalizeOptionalString(params.date_to) && time_type_labels && time_type_labels.length > 0);
  }
  if (capability_key === 'worktime.summary') {
    return Boolean(employee_name && normalizeOptionalString(params.date_from) && normalizeOptionalString(params.date_to));
  }
  if (capability_key === 'report.month-by-group') {
    const year = normalizeYear(params.year);
    const month = normalizeLimit(params.month);
    const group_name = normalizeOptionalString(params.group_name);
    return Boolean(year && month && group_name);
  }
  return false;
}

function normalizeDraftLine(value: unknown): PricingQuoteDraftLineInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    text: normalizeOptionalString(record.text),
    article: normalizeOptionalString(record.article) ?? '',
    unidades: record.unidades === undefined || record.unidades === null ? null : normalizeLimit(record.unidades),
    alto: record.alto === undefined || record.alto === null ? null : normalizeOptionalNumber(record.alto),
    ancho: record.ancho === undefined || record.ancho === null ? null : normalizeOptionalNumber(record.ancho),
    options: record.options === undefined || record.options === null ? null : normalizeOptions(record.options)
  };
}

function isCollectiveEmployeePhrase(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return [
    'todos los trabajadores',
    'todos trabajadores',
    'todos los empleados',
    'todos empleados',
    'todas las personas',
    'todo el personal',
    'all workers',
    'all employees',
    'everyone'
  ].includes(normalized);
}

function isNumaHrCapabilityKey(capability_key: string): boolean {
  return (
    capability_key === 'presence.current-workers' ||
    capability_key === 'punch.day' ||
    capability_key === 'punch.day-workers' ||
    capability_key === 'punch.range' ||
    capability_key === 'leave.days' ||
    capability_key === 'leave.balance' ||
    capability_key === 'leave.detail' ||
    capability_key === 'worktime.summary' ||
    capability_key === 'report.month-by-group'
  );
}

function normalizeDraftLines(value: unknown): PricingQuoteDraftLineInput[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const lines: PricingQuoteDraftLineInput[] = [];
  for (const item of value) {
    const line = normalizeDraftLine(item);
    if (line) {
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines : null;
}

function isValidPricingQuoteDraftProposal(params: Record<string, unknown>): boolean {
  return normalizeDraftLines(params.lines) !== null;
}

function shouldUseConversationHistoryForPricingRawMessage(message: string): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (normalized.length > 90) {
    return false;
  }
  return !/\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?/.test(normalized);
}

function buildPricingRawMessage(request: OrchestrationRequest): string | null {
  const current = normalizeOptionalString(request.user_message);
  if (!current) {
    return null;
  }
  if (!shouldUseConversationHistoryForPricingRawMessage(current)) {
    return current;
  }
  const previousUserMessages = (request.conversation_history ?? [])
    .filter((turn) => turn.role === 'user')
    .map((turn) => normalizeOptionalString(turn.content))
    .filter((turn): turn is string => turn !== null)
    .slice(-3);
  return [...previousUserMessages, current].join('\n');
}

function isValidMockResourceReadProposal(params: Record<string, unknown>): boolean {
  const estimate_id = normalizeOptionalString(params.estimate_id);
  const year = normalizeYear(params.year);
  const customer_id =
    normalizeCustomerLookupParam(params.customer_id) ??
    normalizeCustomerLookupParam(params.customer_name) ??
    normalizeCustomerLookupParam(params.contact_name) ??
    normalizeCustomerLookupParam(params.contactName) ??
    normalizeCustomerLookupParam(params.contact);
  const resource_type = params.resource_type === 'invoice' ? 'invoice' : 'estimate';
  const payment_status = normalizeResourceQuery({
    payment_status: params.payment_status ?? null
  }).payment_status;
  const limit = normalizeLimit(params.limit);
  const hasCustomerLookup = customer_id !== null;

  if (payment_status && resource_type !== 'invoice') {
    return false;
  }

  if (params.year !== undefined && params.year !== null && year === null) {
    return false;
  }

  if (params.limit !== undefined && params.limit !== null) {
    if (limit === null || !hasCustomerLookup || payment_status !== null || year !== null || estimate_id !== null) {
      return false;
    }
  }

  return Boolean(estimate_id || customer_id || payment_status || year || limit);
}

function resolveWorkflowRequest(
  proposal: OrchestrationProposal,
  request: OrchestrationRequest,
  numaHrConfig: NumaHrToolMappingConfig | null | undefined,
  now: Date
):
  | MockReadEstimateWorkflowInput
  | MockEmailSendWorkflowInput
  | NumaHrReadWorkflowInput
  | PricingQuoteLineWorkflowInput
  | PricingQuoteDraftWorkflowInput
  | null {
  if (proposal.capability_key === 'mock.resource.read') {
    const estimate_id = normalizeOptionalString(proposal.params.estimate_id);
    const resource_type = proposal.params.resource_type === 'invoice' ? 'invoice' : 'estimate';
    const year = normalizeYear(proposal.params.year);
    const payment_status = normalizeResourceQuery({
      payment_status: proposal.params.payment_status ?? null
    }).payment_status;
    const limit = normalizeLimit(proposal.params.limit);
    const customer_id =
      normalizeCustomerLookupParam(proposal.params.customer_id) ??
      normalizeCustomerLookupParam(proposal.params.customer_name) ??
      normalizeCustomerLookupParam(proposal.params.contact_name) ??
      normalizeCustomerLookupParam(proposal.params.contactName) ??
      normalizeCustomerLookupParam(proposal.params.contact);
    if (proposal.params.limit !== undefined && proposal.params.limit !== null) {
      if (limit === null || !customer_id || payment_status || year || estimate_id) {
        return null;
      }
    }
    if (!estimate_id && !customer_id && !payment_status && !year && limit === null) {
      return null;
    }
    return {
      kind: 'mock.estimate.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      resource_type,
      limit,
      payment_status,
      year,
      estimate_id,
      customer_id,
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'presence.current-workers') {
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        limit: 100
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'punch.day') {
    const employee_name = normalizeOptionalString(proposal.params.employee_name);
    const date = normalizeOptionalString(proposal.params.date);
    if (!employee_name || !date) {
      return null;
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        employee_name,
        date
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'punch.day-workers') {
    const date = normalizeOptionalString(proposal.params.date);
    if (!date) {
      return null;
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        date,
        limit: 100
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'punch.range') {
    const employee_name = normalizeOptionalString(proposal.params.employee_name);
    const date_from = normalizeOptionalString(proposal.params.date_from);
    const date_to = normalizeOptionalString(proposal.params.date_to);
    if (!employee_name || !date_from || !date_to) {
      return null;
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        employee_name,
        date_from,
        date_to,
        limit: 250
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'leave.days' || proposal.capability_key === 'leave.balance') {
    const employee_name = normalizeOptionalString(proposal.params.employee_name);
    const year = resolveCalendarYear(proposal.params.year, request.user_message, now);
    const time_type_labels = normalizeNumaHrTimeTypeLabels(proposal.params.time_type_labels);
    const time_type_ids = resolveNumaHrTimeTypeIds(time_type_labels, numaHrConfig?.time_type_by_label);
    const time_type_label_by_id = buildNumaHrTimeTypeLabelById(time_type_labels, numaHrConfig?.time_type_by_label);
    if (!employee_name || !year || !time_type_ids || time_type_ids.length === 0 || !time_type_label_by_id) {
      return null;
    }
    const params: Record<string, unknown> = {
      employee_name,
      year,
      time_type_ids,
      time_type_label_by_id
    };
    if (proposal.capability_key === 'leave.balance') {
      if (!numaHrConfig) {
        return null;
      }
      params.annual_quota_by_time_type = { ...numaHrConfig.annual_quota_by_time_type };
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams(params),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'leave.detail') {
    const employee_name = normalizeOptionalString(proposal.params.employee_name);
    const relativeYear = resolveRelativeCalendarYear(request.user_message, now) ?? resolveRelativeCalendarYear(proposal.params.date_from, now) ?? resolveRelativeCalendarYear(proposal.params.date_to, now);
    const relativeRange = relativeYear ? yearDateRange(relativeYear) : null;
    const date_from = relativeRange?.date_from ?? normalizeOptionalString(proposal.params.date_from);
    const date_to = relativeRange?.date_to ?? normalizeOptionalString(proposal.params.date_to);
    const time_type_labels = normalizeNumaHrTimeTypeLabels(proposal.params.time_type_labels);
    const time_type_ids = resolveNumaHrTimeTypeIds(time_type_labels, numaHrConfig?.time_type_by_label);
    const time_type_label_by_id = buildNumaHrTimeTypeLabelById(time_type_labels, numaHrConfig?.time_type_by_label);
    if (!employee_name || !date_from || !date_to || !time_type_ids || time_type_ids.length === 0 || !time_type_label_by_id) {
      return null;
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        employee_name,
        date_from,
        date_to,
        time_type_ids,
        time_type_label_by_id,
        limit: 100
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'worktime.summary') {
    const employee_name = normalizeOptionalString(proposal.params.employee_name);
    const date_from = normalizeOptionalString(proposal.params.date_from);
    const date_to = normalizeOptionalString(proposal.params.date_to);
    if (!employee_name || !date_from || !date_to) {
      return null;
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        employee_name,
        date_from,
        date_to
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'report.month-by-group') {
    const group_name = normalizeOptionalString(proposal.params.group_name);
    const year = normalizeYear(proposal.params.year);
    const month = normalizeLimit(proposal.params.month);
    if (!group_name || !year || !month) {
      return null;
    }
    return {
      kind: 'numa.hr.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      capability_id: proposal.capability_key as NumaHrReadWorkflowInput['capability_id'],
      params: normalizeCapabilityParams({
        group_name,
        year,
        month,
        limit: 25,
        offset: 0
      }),
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'pricing.quote_line') {
    const article = normalizeOptionalString(proposal.params.article);
    const unidades = proposal.params.unidades === undefined || proposal.params.unidades === null ? null : normalizeLimit(proposal.params.unidades);
    const alto = proposal.params.alto === undefined || proposal.params.alto === null ? null : normalizeOptionalNumber(proposal.params.alto);
    const ancho = proposal.params.ancho === undefined || proposal.params.ancho === null ? null : normalizeOptionalNumber(proposal.params.ancho);
    const options = proposal.params.options === undefined || proposal.params.options === null ? null : normalizeOptions(proposal.params.options);
    if (!article) {
      return null;
    }
    if (proposal.params.unidades !== undefined && proposal.params.unidades !== null && unidades === null) {
      return null;
    }
    if (proposal.params.alto !== undefined && proposal.params.alto !== null && alto === null) {
      return null;
    }
    if (proposal.params.ancho !== undefined && proposal.params.ancho !== null && ancho === null) {
      return null;
    }
    if (proposal.params.options !== undefined && proposal.params.options !== null && options === null) {
      return null;
    }
    return {
      kind: 'pricing.quote_line',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      article,
      unidades,
      alto,
      ancho,
      options,
      raw_message: buildPricingRawMessage(request),
      capability_id: proposal.capability_key,
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'pricing.quote_draft') {
    const lines = normalizeDraftLines(proposal.params.lines);
    if (!lines) {
      return null;
    }
    return {
      kind: 'pricing.quote_draft',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      lines,
      customer: normalizeOptionalString(proposal.params.customer),
      raw_message: buildPricingRawMessage(request),
      capability_id: proposal.capability_key,
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  if (proposal.capability_key === 'mock.email.send') {
    const to = normalizeOptionalString(proposal.params.to);
    const subject = normalizeOptionalString(proposal.params.subject);
    const body = normalizeOptionalString(proposal.params.body);
    if (!to || !subject || !body) {
      return null;
    }
    return {
      kind: 'mock.email.send',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      to,
      subject,
      body,
      approval_decision: null,
      capability_id: proposal.capability_key,
      claimed_result: request.claimed_result ?? null,
      claimed_output: request.claimed_output ?? null,
      caller_result: request.caller_result ?? null,
      assistant_result: request.assistant_result ?? null,
      model_claimed_result: request.model_claimed_result ?? null
    };
  }

  return null;
}

export class InMemoryOrchestrationBoundary {
  private readonly orchestrator: OrchestratorPort | null;
  private readonly workflowRuntime: InMemoryGovernedWorkflowRuntime;
  private readonly installationCapabilities: Record<string, string[]>;
  private readonly numaHrConfig: NumaHrToolMappingConfig | null;
  private readonly now: () => Date;

  constructor(options: OrchestrationBoundaryOptions = {}) {
    this.orchestrator = options.orchestrator ?? null;
    this.workflowRuntime =
      options.workflowRuntime ??
      new InMemoryGovernedWorkflowRuntime({
        now: options.now
      });
    this.installationCapabilities = options.installationCapabilities ?? {};
    this.numaHrConfig = options.numaHrConfig ?? null;
    this.now = options.now ?? (() => new Date());
  }

  getWorkflowRuntime(): InMemoryGovernedWorkflowRuntime {
    return this.workflowRuntime;
  }

  getEvidenceLedger(): InMemoryEvidenceLedger {
    return this.workflowRuntime.getEvidenceLedger();
  }

  execute(request: OrchestrationRequest): OrchestrationOutcome {
    const normalizedRequest = this.normalizeRequest(request);
    const evidenceLedger = this.workflowRuntime.getEvidenceLedger();
    const orchestrationRequestedEvidence = appendEvidence(evidenceLedger, this.now, {
      organization_id: normalizedRequest.organization_id ?? 'unknown',
      correlation_id: normalizedRequest.correlation_id,
      record_type: 'orchestration_requested',
      subject: normalizedRequest.user_message,
      data: {
        request_id: normalizedRequest.request_id,
        user_message: normalizedRequest.user_message,
        installation_id: normalizedRequest.installation_id,
        organization_id: normalizedRequest.organization_id,
        principal_id: normalizedRequest.principal_id
      }
    });

    const baseError = this.failClosed(normalizedRequest, orchestrationRequestedEvidence.evidence_id);
    if (baseError) {
      return baseError;
    }

    const normalizedInstallationId = normalizeOptionalString(
      normalizedRequest.installation_id ?? normalizedRequest.context?.installation_id ?? null
    );
    const activeCapabilitiesForOrchestrator = normalizeInstallationCapabilities(
      this.installationCapabilities,
      normalizedInstallationId
    );
    const orchestratorRequest = this.enrichRequestWithActiveCapabilities(
      normalizedRequest,
      activeCapabilitiesForOrchestrator
    );
    const routingOverride =
      deriveNumaHrRoutingOverride(orchestratorRequest.user_message, this.now()) ??
      deriveHoldedReadRoutingOverride(orchestratorRequest.user_message);
    const requestForOrchestrator =
      routingOverride &&
      activeCapabilitiesForOrchestrator.includes(routingOverride.force_capability_key) &&
      !normalizeOptionalString(orchestratorRequest.context?.force_capability_key ?? null)
        ? {
            ...orchestratorRequest,
            context: {
              ...(orchestratorRequest.context ?? {
                installation_id: normalizeOptionalString(orchestratorRequest.installation_id ?? null),
                active_capabilities: activeCapabilitiesForOrchestrator,
                metadata: {}
              }),
              force_capability_key: routingOverride.force_capability_key,
              force_params: routingOverride.force_params
            }
          }
        : orchestratorRequest;

    if (!this.orchestrator) {
      return this.finishBlockedOutcome({
        request: requestForOrchestrator,
        reason: 'orchestrator unavailable',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id
      });
    }

    let proposalOutcome: OrchestrationOutcome;
    try {
      proposalOutcome = this.orchestrator.propose(requestForOrchestrator);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'orchestrator unavailable';
      return this.finishErrorOutcome({
        request: requestForOrchestrator,
        reason,
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id
      });
    }

    if (proposalOutcome.status === 'no_proposal') {
      appendEvidence(evidenceLedger, this.now, {
        organization_id: normalizedRequest.organization_id ?? 'unknown',
        correlation_id: normalizedRequest.correlation_id,
        record_type: 'orchestration_no_proposal',
        subject: normalizedRequest.user_message,
        data: {
          request_id: normalizedRequest.request_id,
          user_message: normalizedRequest.user_message
        }
      });
      return cloneOutcome(proposalOutcome);
    }

    if (proposalOutcome.status === 'denied') {
      appendEvidence(evidenceLedger, this.now, {
        organization_id: normalizedRequest.organization_id ?? 'unknown',
        correlation_id: normalizedRequest.correlation_id,
        record_type: 'orchestration_proposal_denied',
        subject: proposalOutcome.proposal?.capability_key ?? 'unknown',
        data: {
          request_id: normalizedRequest.request_id,
          capability_key: proposalOutcome.proposal?.capability_key ?? null,
          reason: proposalOutcome.reason
        }
      });
      return this.finishDeniedOutcome({
        request: requestForOrchestrator,
        reason: proposalOutcome.reason,
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome
      });
    }

    if (proposalOutcome.status === 'blocked') {
      appendEvidence(evidenceLedger, this.now, {
        organization_id: normalizedRequest.organization_id ?? 'unknown',
        correlation_id: normalizedRequest.correlation_id,
        record_type: 'orchestration_proposal_blocked',
        subject: proposalOutcome.proposal?.capability_key ?? 'unknown',
        data: {
          request_id: normalizedRequest.request_id,
          capability_key: proposalOutcome.proposal?.capability_key ?? null,
          reason: proposalOutcome.reason
        }
      });
      return this.finishBlockedOutcome({
        request: requestForOrchestrator,
        reason: proposalOutcome.reason,
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome
      });
    }

    if (proposalOutcome.status === 'error') {
      return this.finishErrorOutcome({
        request: requestForOrchestrator,
        reason: proposalOutcome.reason,
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome
      });
    }

    const proposal = proposalOutcome.proposal;
    if (!proposal) {
      return this.finishBlockedOutcome({
        request: requestForOrchestrator,
        reason: 'proposal missing',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id
      });
    }

    appendEvidence(evidenceLedger, this.now, {
      organization_id: normalizedRequest.organization_id ?? 'unknown',
      correlation_id: normalizedRequest.correlation_id,
      record_type: 'orchestration_proposal_created',
      subject: proposal.capability_key,
      data: {
        proposal_id: proposal.proposal_id,
        capability_key: proposal.capability_key,
        params: proposal.params,
        confidence: proposal.confidence,
        reason: proposal.reason
      }
    });

    const unsafeProposal = proposalOutcome.proposal as OrchestrationProposal & Record<string, unknown>;
    const ignoredFields = hasUnsafeClaimFields(unsafeProposal);
    const ignoredRequestFields = hasUnsafeClaimFields(normalizedRequest as unknown as Record<string, unknown>);
    const ignoredFieldsToRecord = [...new Set([...ignoredFields, ...ignoredRequestFields])];
    if (ignoredFieldsToRecord.length > 0) {
      appendEvidence(evidenceLedger, this.now, {
        organization_id: normalizedRequest.organization_id ?? 'unknown',
        correlation_id: normalizedRequest.correlation_id,
        record_type: 'orchestration_claimed_result_ignored',
        subject: proposal.capability_key,
        data: {
          proposal_id: proposal.proposal_id,
          ignored_fields: ignoredFieldsToRecord
        }
      });
    }

    const validation = this.validateProposal(normalizedRequest, proposal);
    if (!validation.valid) {
      appendEvidence(evidenceLedger, this.now, {
        organization_id: normalizedRequest.organization_id ?? 'unknown',
        correlation_id: normalizedRequest.correlation_id,
        record_type: validation.status === 'denied' ? 'orchestration_proposal_denied' : 'orchestration_proposal_blocked',
        subject: proposal.capability_key,
        data: {
          proposal_id: proposal.proposal_id,
          capability_key: proposal.capability_key,
          params: proposal.params,
          reason: validation.reason
        }
      });
      return validation.status === 'denied'
        ? this.finishDeniedOutcome({
            request: requestForOrchestrator,
            reason: validation.reason,
            orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
            proposalOutcome,
            validation
          })
        : this.finishBlockedOutcome({
            request: requestForOrchestrator,
            reason: validation.reason,
            orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
            proposalOutcome,
            validation
          });
    }

    appendEvidence(evidenceLedger, this.now, {
      organization_id: normalizedRequest.organization_id ?? 'unknown',
      correlation_id: normalizedRequest.correlation_id,
      record_type: 'orchestration_proposal_validated',
      subject: proposal.capability_key,
      data: {
        proposal_id: proposal.proposal_id,
        capability_key: proposal.capability_key,
        params: proposal.params
      }
    });

    const workflowKind = this.resolveWorkflowKind(proposal.capability_key);
    if (!workflowKind) {
      return this.finishDeniedOutcome({
        request: requestForOrchestrator,
        reason: 'capability unknown',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome,
        validation: {
          ...validation,
          valid: false,
          status: 'denied',
          reason: 'capability unknown',
          capability_known: false
        }
      });
    }

    const workflowRequest = resolveWorkflowRequest(proposal, normalizedRequest, this.numaHrConfig, this.now());
    if (!workflowRequest) {
      return this.finishBlockedOutcome({
        request: requestForOrchestrator,
        reason: 'proposal params invalid',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome,
        validation: {
          ...validation,
          valid: false,
          status: 'blocked',
          reason: 'proposal params invalid'
        }
      });
    }

    const activeCapabilities = normalizeInstallationCapabilities(this.installationCapabilities, normalizedInstallationId);
    if (activeCapabilities.length === 0) {
      return this.finishDeniedOutcome({
        request: requestForOrchestrator,
        reason: 'capability not active in installation',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome,
        validation: {
          ...validation,
          valid: false,
          status: 'denied',
          reason: 'capability not active in installation',
          capability_active: false
        }
      });
    }
    if (!activeCapabilities.includes(proposal.capability_key)) {
      return this.finishDeniedOutcome({
        request: requestForOrchestrator,
        reason: 'capability not active in installation',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome,
        validation: {
          ...validation,
          valid: false,
          status: 'denied',
          reason: 'capability not active in installation',
          capability_active: false
        }
      });
    }

    appendEvidence(evidenceLedger, this.now, {
      organization_id: normalizedRequest.organization_id ?? 'unknown',
      correlation_id: normalizedRequest.correlation_id,
      record_type: 'workflow_invocation_requested',
      subject: workflowKind,
      data: {
        request_id: normalizedRequest.request_id,
        capability_key: proposal.capability_key,
        workflow_kind: workflowKind,
        params: proposal.params,
        installation_id: normalizedRequest.installation_id
      }
    });

    const workflow_result = this.workflowRuntime.executeWorkflow(workflowRequest);
    const finalResponse = cloneResponse(workflow_result.response);
    const finalOutcome = this.finishProposalOutcome({
      request: requestForOrchestrator,
      proposal,
      validation,
      workflow_kind: workflowKind,
      workflow_result,
      response: finalResponse,
      orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id
    });
    return finalOutcome;
  }

  private failClosed(request: OrchestrationRequest, orchestrationRequestedEvidence: string): OrchestrationOutcome | null {
    if (!request.organization_id) {
      return this.finishBlockedOutcome({
        request,
        reason: 'organization required for orchestration',
        orchestrationRequestedEvidence
      });
    }
    if (!request.principal_id && !request.actor?.principal_id) {
      return this.finishBlockedOutcome({
        request,
        reason: 'principal required for orchestration',
        orchestrationRequestedEvidence
      });
    }
    if (request.user_message.trim().length === 0) {
      return this.finishBlockedOutcome({
        request,
        reason: 'user message required for orchestration',
        orchestrationRequestedEvidence
      });
    }
    return null;
  }

  private normalizeRequest(request: OrchestrationRequest): OrchestrationRequest {
    return {
      ...request,
      request_id: request.request_id.trim(),
      user_message: request.user_message.trim(),
      organization_id: normalizeOptionalString(request.organization_id),
      principal_id: normalizeOptionalString(request.principal_id),
      actor: request.actor
        ? {
            ...request.actor,
            principal_id: request.actor.principal_id.trim(),
            delegated_identity: request.actor.delegated_identity ? request.actor.delegated_identity.trim() : null
          }
        : null,
      correlation_id: normalizeCorrelationId({
        request_id: request.request_id,
        correlation_id: request.correlation_id
      }),
      installation_id: normalizeOptionalString(request.installation_id ?? request.context?.installation_id ?? null),
      context: request.context
        ? {
            installation_id: normalizeOptionalString(request.context.installation_id),
            active_capabilities: Array.isArray(request.context.active_capabilities) ? [...request.context.active_capabilities] : [],
            metadata: structuredClone(request.context.metadata ?? {}),
            force_capability_key: normalizeOptionalString(request.context.force_capability_key ?? null),
            force_params: request.context.force_params ? structuredClone(request.context.force_params) : null
          }
        : null
    };
  }

  private enrichRequestWithActiveCapabilities(request: OrchestrationRequest, activeCapabilities: string[]): OrchestrationRequest {
    const context = request.context ?? null;
    const active_capabilities = mergeLists(context?.active_capabilities ?? [], activeCapabilities);
    if (!context) {
      return {
        ...request,
        context: {
          installation_id: normalizeOptionalString(request.installation_id ?? null),
          active_capabilities,
          metadata: {},
          force_capability_key: null,
          force_params: null
        }
      };
    }
    return {
      ...request,
      context: {
        ...context,
        active_capabilities
      }
    };
  }

  private validateProposal(request: OrchestrationRequest, proposal: OrchestrationProposal): OrchestrationValidationResult {
    const known = capabilityKnown(this.workflowRuntime, proposal.capability_key);
    if (!known) {
      return {
        valid: false,
        status: 'denied',
        reason: 'capability unknown',
        capability_key: proposal.capability_key,
        params: proposal.params,
        capability_active: false,
        capability_known: false
      };
    }

    const activeCapabilities = normalizeInstallationCapabilities(
      this.installationCapabilities,
      normalizeOptionalString(request.installation_id ?? request.context?.installation_id ?? null)
    );
    const active = activeCapabilities.includes(proposal.capability_key);
    if (!active) {
      return {
        valid: false,
        status: 'denied',
        reason: 'capability not active in installation',
        capability_key: proposal.capability_key,
        params: proposal.params,
        capability_active: false,
        capability_known: true
      };
    }

    if (proposal.capability_key === 'mock.resource.read') {
      if (!isValidMockResourceReadProposal(proposal.params)) {
        return {
          valid: false,
          status: 'blocked',
          reason: 'proposal params invalid',
          capability_key: proposal.capability_key,
          params: proposal.params,
          capability_active: true,
          capability_known: true
        };
      }
      return {
        valid: true,
        status: 'proposal',
        reason: 'proposal validated',
        capability_key: proposal.capability_key,
        params: normalizeCapabilityParams({
          ...proposal.params,
          customer_id: normalizeCustomerLookupParam(proposal.params.customer_id) ??
            normalizeCustomerLookupParam(proposal.params.customer_name) ??
            normalizeCustomerLookupParam(proposal.params.contact_name) ??
            normalizeCustomerLookupParam(proposal.params.contactName) ??
            normalizeCustomerLookupParam(proposal.params.contact) ??
            proposal.params.customer_id ??
            null,
          year: normalizeYear(proposal.params.year) ?? proposal.params.year ?? null
        }),
        capability_active: true,
        capability_known: true
      };
    }

    if (isNumaHrCapabilityKey(proposal.capability_key)) {
      if (!isValidNumaHrProposal(proposal.capability_key, proposal.params)) {
        return {
          valid: false,
          status: 'blocked',
          reason: 'proposal params invalid',
          capability_key: proposal.capability_key,
          params: proposal.params,
          capability_active: true,
          capability_known: true
        };
      }
      return {
        valid: true,
        status: 'proposal',
        reason: 'proposal validated',
        capability_key: proposal.capability_key,
        params: normalizeCapabilityParams(proposal.params),
        capability_active: true,
        capability_known: true
      };
    }

    if (proposal.capability_key === 'pricing.quote_line') {
      if (!isValidPricingQuoteLineProposal(proposal.params)) {
        return {
          valid: false,
          status: 'blocked',
          reason: 'proposal params invalid',
          capability_key: proposal.capability_key,
          params: proposal.params,
          capability_active: true,
          capability_known: true
        };
      }
      return {
        valid: true,
        status: 'proposal',
        reason: 'proposal validated',
        capability_key: proposal.capability_key,
        params: normalizeCapabilityParams({
          ...proposal.params,
          article: normalizeOptionalString(proposal.params.article) ?? proposal.params.article ?? null,
          unidades: normalizeLimit(proposal.params.unidades) ?? proposal.params.unidades ?? null,
          alto: normalizeOptionalNumber(proposal.params.alto) ?? proposal.params.alto ?? null,
          ancho: normalizeOptionalNumber(proposal.params.ancho) ?? proposal.params.ancho ?? null,
          options: normalizeOptions(proposal.params.options) ?? proposal.params.options ?? null
        }),
        capability_active: true,
        capability_known: true
      };
    }

    if (proposal.capability_key === 'pricing.quote_draft') {
      const lines = normalizeDraftLines(proposal.params.lines);
      if (!lines) {
        return {
          valid: false,
          status: 'blocked',
          reason: 'proposal params invalid',
          capability_key: proposal.capability_key,
          params: proposal.params,
          capability_active: true,
          capability_known: true
        };
      }
      return {
        valid: true,
        status: 'proposal',
        reason: 'proposal validated',
        capability_key: proposal.capability_key,
        params: normalizeCapabilityParams({
          ...proposal.params,
          lines: lines as unknown as unknown[],
          customer: normalizeOptionalString(proposal.params.customer) ?? proposal.params.customer ?? null
        }),
        capability_active: true,
        capability_known: true
      };
    }

    if (proposal.capability_key === 'mock.email.send') {
      const to = normalizeOptionalString(proposal.params.to);
      const subject = normalizeOptionalString(proposal.params.subject);
      const body = normalizeOptionalString(proposal.params.body);
      if (!to || !subject || !body) {
        return {
          valid: false,
          status: 'blocked',
          reason: 'proposal params invalid',
          capability_key: proposal.capability_key,
          params: proposal.params,
          capability_active: true,
          capability_known: true
        };
      }
      return {
        valid: true,
        status: 'proposal',
        reason: 'proposal validated',
        capability_key: proposal.capability_key,
        params: normalizeCapabilityParams(proposal.params),
        capability_active: true,
        capability_known: true
      };
    }

    return {
      valid: false,
      status: 'denied',
      reason: 'capability unknown',
      capability_key: proposal.capability_key,
      params: proposal.params,
      capability_active: false,
      capability_known: false
    };
  }

  private resolveWorkflowKind(capability_key: string): GovernedWorkflowKind | null {
    if (capability_key === 'mock.resource.read') {
      return 'mock.estimate.read';
    }
    if (capability_key === 'mock.email.send') {
      return 'mock.email.send';
    }
    if (capability_key === 'pricing.quote_line') {
      return 'pricing.quote_line';
    }
    if (capability_key === 'pricing.quote_draft') {
      return 'pricing.quote_draft';
    }
    if (isNumaHrCapabilityKey(capability_key)) {
      return 'numa.hr.read';
    }
    return null;
  }

  private finishProposalOutcome(input: {
    request: OrchestrationRequest;
    proposal: OrchestrationProposal;
    validation: OrchestrationValidationResult;
    workflow_kind: GovernedWorkflowKind;
    workflow_result: GovernedWorkflowResult;
    response: OrchestrationResponse;
    orchestrationRequestedEvidence: string;
  }): OrchestrationOutcome {
    const now = this.now().toISOString();
    const evidenceLinks = mergeLists(
      input.proposal.evidence_links,
      this.workflowRuntime.getEvidenceLedger().listByCorrelation(input.request.correlation_id).map((record) => record.evidence_id)
    );
    const outcome: OrchestrationOutcome = {
      request_id: input.request.request_id,
      organization_id: input.request.organization_id,
      principal_id: input.request.principal_id ?? input.request.actor?.principal_id ?? null,
      correlation_id: input.request.correlation_id,
      installation_id: input.request.installation_id ?? input.request.context?.installation_id ?? null,
      status: 'proposal',
      proposal: sanitizeProposal(input.proposal),
      validation: {
        ...input.validation,
        params: input.validation.params ? structuredClone(input.validation.params) : null
      },
      workflow_kind: input.workflow_kind,
      workflow_result: input.workflow_result,
      response: cloneResponse(input.response),
      evidence_links: evidenceLinks,
      created_at: now,
      updated_at: input.workflow_result.updated_at,
      reason: input.workflow_result.response.message
    };
    return cloneOutcome(outcome);
  }

  private finishDeniedOutcome(input: {
    request: OrchestrationRequest;
    reason: string;
    orchestrationRequestedEvidence: string;
    proposalOutcome?: OrchestrationOutcome | null;
    validation?: OrchestrationValidationResult | null;
  }): OrchestrationOutcome {
    const evidenceLedger = this.workflowRuntime.getEvidenceLedger();
    const responseEvidence = appendEvidence(evidenceLedger, this.now, {
      organization_id: input.request.organization_id ?? 'unknown',
      correlation_id: input.request.correlation_id,
      record_type: 'workflow_response_created',
      subject: input.request.request_id,
      data: {
        request_id: input.request.request_id,
        status: 'denied',
        response_source: 'workflow_blocked',
        reason: input.reason
      }
    });
    const outcome: OrchestrationOutcome = {
      request_id: input.request.request_id,
      organization_id: input.request.organization_id,
      principal_id: input.request.principal_id ?? input.request.actor?.principal_id ?? null,
      correlation_id: input.request.correlation_id,
      installation_id: input.request.installation_id ?? input.request.context?.installation_id ?? null,
      status: 'denied',
      proposal: input.proposalOutcome?.proposal ? sanitizeProposal(input.proposalOutcome.proposal) : null,
      validation: input.validation
        ? {
            ...input.validation,
            params: input.validation.params ? structuredClone(input.validation.params) : null
          }
        : input.proposalOutcome?.validation
          ? {
              ...input.proposalOutcome.validation,
              params: input.proposalOutcome.validation.params ? structuredClone(input.proposalOutcome.validation.params) : null
            }
          : null,
      workflow_kind: null,
      workflow_result: null,
      response: createResponse({
        workflow_kind: null,
        status: 'denied',
        message: input.reason,
        data: null,
        response_source: 'workflow_blocked'
      }),
      evidence_links: mergeLists(
        input.proposalOutcome?.evidence_links,
        evidenceLedger.listByCorrelation(input.request.correlation_id).map((record) => record.evidence_id)
      ),
      created_at: this.now().toISOString(),
      updated_at: responseEvidence.created_at,
      reason: input.reason
    };
    return cloneOutcome(outcome);
  }

  private finishBlockedOutcome(input: {
    request: OrchestrationRequest;
    reason: string;
    orchestrationRequestedEvidence: string;
    proposalOutcome?: OrchestrationOutcome | null;
    validation?: OrchestrationValidationResult | null;
  }): OrchestrationOutcome {
    const evidenceLedger = this.workflowRuntime.getEvidenceLedger();
    const responseEvidence = appendEvidence(evidenceLedger, this.now, {
      organization_id: input.request.organization_id ?? 'unknown',
      correlation_id: input.request.correlation_id,
      record_type: 'workflow_response_created',
      subject: input.request.request_id,
      data: {
        request_id: input.request.request_id,
        status: 'blocked',
        response_source: 'workflow_blocked',
        reason: input.reason
      }
    });
    const outcome: OrchestrationOutcome = {
      request_id: input.request.request_id,
      organization_id: input.request.organization_id,
      principal_id: input.request.principal_id ?? input.request.actor?.principal_id ?? null,
      correlation_id: input.request.correlation_id,
      installation_id: input.request.installation_id ?? input.request.context?.installation_id ?? null,
      status: 'blocked',
      proposal: input.proposalOutcome?.proposal ? sanitizeProposal(input.proposalOutcome.proposal) : null,
      validation: input.validation
        ? {
            ...input.validation,
            params: input.validation.params ? structuredClone(input.validation.params) : null
          }
        : input.proposalOutcome?.validation
          ? {
              ...input.proposalOutcome.validation,
              params: input.proposalOutcome.validation.params ? structuredClone(input.proposalOutcome.validation.params) : null
            }
          : null,
      workflow_kind: null,
      workflow_result: null,
      response: createResponse({
        workflow_kind: null,
        status: 'blocked',
        message: input.reason,
        data: null,
        response_source: 'workflow_blocked'
      }),
      evidence_links: mergeLists(
        input.proposalOutcome?.evidence_links,
        evidenceLedger.listByCorrelation(input.request.correlation_id).map((record) => record.evidence_id)
      ),
      created_at: this.now().toISOString(),
      updated_at: responseEvidence.created_at,
      reason: input.reason
    };
    return cloneOutcome(outcome);
  }

  private finishErrorOutcome(input: {
    request: OrchestrationRequest;
    reason: string;
    orchestrationRequestedEvidence: string;
    proposalOutcome?: OrchestrationOutcome | null;
  }): OrchestrationOutcome {
    const evidenceLedger = this.workflowRuntime.getEvidenceLedger();
    const responseEvidence = appendEvidence(evidenceLedger, this.now, {
      organization_id: input.request.organization_id ?? 'unknown',
      correlation_id: input.request.correlation_id,
      record_type: 'workflow_response_created',
      subject: input.request.request_id,
      data: {
        request_id: input.request.request_id,
        status: 'error',
        response_source: 'workflow_blocked',
        reason: input.reason
      }
    });
    const outcome: OrchestrationOutcome = {
      request_id: input.request.request_id,
      organization_id: input.request.organization_id,
      principal_id: input.request.principal_id ?? input.request.actor?.principal_id ?? null,
      correlation_id: input.request.correlation_id,
      installation_id: input.request.installation_id ?? input.request.context?.installation_id ?? null,
      status: 'error',
      proposal: input.proposalOutcome?.proposal ? sanitizeProposal(input.proposalOutcome.proposal) : null,
      validation: input.proposalOutcome?.validation
        ? {
            ...input.proposalOutcome.validation,
            params: input.proposalOutcome.validation.params ? structuredClone(input.proposalOutcome.validation.params) : null
          }
        : null,
      workflow_kind: null,
      workflow_result: null,
      response: createResponse({
        workflow_kind: null,
        status: 'error',
        message: input.reason,
        data: null,
        response_source: 'workflow_blocked'
      }),
      evidence_links: mergeLists(
        input.proposalOutcome?.evidence_links,
        evidenceLedger.listByCorrelation(input.request.correlation_id).map((record) => record.evidence_id)
      ),
      created_at: this.now().toISOString(),
      updated_at: responseEvidence.created_at,
      reason: input.reason
    };
    return cloneOutcome(outcome);
  }
}

export function createMockOrchestrationBoundary(options: OrchestrationBoundaryOptions = {}): InMemoryOrchestrationBoundary {
  return new InMemoryOrchestrationBoundary({
    ...options,
    orchestrator: options.orchestrator ?? null
  });
}
