import {
  createDeterministicId,
  normalizeCorrelationId,
  type OrchestratorPort,
  type OrchestrationContext,
  type OrchestrationOutcome,
  type OrchestrationProposal,
  type OrchestrationRequest,
  type OrchestrationResponse,
  type OrchestrationStatus,
  type OrchestrationValidationResult
} from '../../../contracts/src/index';

export interface MockOrchestrationRoute {
  keywords: string[];
  capability_key: string;
  reason: string;
  confidence: number;
  buildParams(request: OrchestrationRequest): Record<string, unknown>;
}

export interface MockOrchestratorOptions {
  now?: () => Date;
  routes?: MockOrchestrationRoute[];
  unsafe_claimed_result?: unknown;
  unsafe_claimed_output?: unknown;
  unsafe_caller_result?: unknown;
  unsafe_assistant_result?: unknown;
  unsafe_model_claimed_result?: unknown;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractToken(message: string, labels: string[]): string | null {
  for (const label of labels) {
    const explicit = message.match(new RegExp(`${label}[-\\s_:]*([a-z0-9][a-z0-9-]*)`, 'i'));
    if (explicit?.[1]) {
      return explicit[1].trim();
    }
  }
  return null;
}

function extractEstimateId(message: string): string | null {
  const explicit = message.match(/estimate-[a-z0-9-]+/i);
  if (explicit) {
    return explicit[0].toLowerCase();
  }
  const token = extractToken(message, ['estimate', 'presupuesto']);
  return token ? `estimate-${token.toLowerCase()}` : null;
}

function extractCustomerId(message: string): string | null {
  const explicit = message.match(/customer-[a-z0-9-]+/i);
  if (explicit) {
    return explicit[0].toLowerCase();
  }
  const token = extractToken(message, ['customer', 'cliente']);
  return token ? `customer-${token.toLowerCase()}` : null;
}

function extractEmailAddress(message: string): string | null {
  const match = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function buildResponse(input: {
  workflow_kind: OrchestrationOutcome['workflow_kind'];
  status: OrchestrationResponse['status'];
  message: string;
  data: Record<string, unknown> | null;
  response_source: OrchestrationResponse['response_source'];
}): OrchestrationResponse {
  return {
    response_source: input.response_source,
    workflow_kind: input.workflow_kind,
    status: input.status,
    message: input.message,
    data: input.data ? structuredClone(input.data) : null
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
    response: buildResponse({
      workflow_kind: outcome.response.workflow_kind,
      status: outcome.response.status,
      message: outcome.response.message,
      data: outcome.response.data,
      response_source: outcome.response.response_source
    }),
    workflow_result: outcome.workflow_result
      ? {
          ...outcome.workflow_result,
          evidence_links: [...outcome.workflow_result.evidence_links],
          response: {
            ...outcome.workflow_result.response,
            data: outcome.workflow_result.response.data ? structuredClone(outcome.workflow_result.response.data) : null
          },
          capability_result: outcome.workflow_result.capability_result
            ? {
                ...outcome.workflow_result.capability_result,
                evidence_links: [...outcome.workflow_result.capability_result.evidence_links],
                output: outcome.workflow_result.capability_result.output
                  ? {
                      ...outcome.workflow_result.capability_result.output,
                      result: structuredClone(outcome.workflow_result.capability_result.output.result)
                    }
                  : null
              }
            : null,
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

function defaultRoutes(): MockOrchestrationRoute[] {
  return [
    {
      keywords: ['presupuesto', 'estimate', 'cliente', 'customer'],
      capability_key: 'mock.resource.read',
      reason: 'read route selected from message keywords',
      confidence: 0.88,
      buildParams(request: OrchestrationRequest): Record<string, unknown> {
        const message = request.user_message;
        return {
          estimate_id: extractEstimateId(message),
          customer_id: extractCustomerId(message),
          resource_type: 'estimate'
        };
      }
    },
    {
      keywords: ['correo', 'email', 'mail', 'enviar'],
      capability_key: 'mock.email.send',
      reason: 'email route selected from message keywords',
      confidence: 0.72,
      buildParams(request: OrchestrationRequest): Record<string, unknown> {
        return {
          to: extractEmailAddress(request.user_message),
          subject: 'M8 orchestrated email',
          body: request.user_message
        };
      }
    }
  ];
}

function routeMatches(message: string, route: MockOrchestrationRoute): boolean {
  const normalized = normalizeText(message);
  return route.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function attachUnsafeFields<T extends OrchestrationProposal>(proposal: T, options: MockOrchestratorOptions): T {
  const unsafe: Record<string, unknown> = {};
  if (options.unsafe_claimed_result !== undefined) unsafe.claimed_result = options.unsafe_claimed_result;
  if (options.unsafe_claimed_output !== undefined) unsafe.claimed_output = options.unsafe_claimed_output;
  if (options.unsafe_caller_result !== undefined) unsafe.caller_result = options.unsafe_caller_result;
  if (options.unsafe_assistant_result !== undefined) unsafe.assistant_result = options.unsafe_assistant_result;
  if (options.unsafe_model_claimed_result !== undefined) unsafe.model_claimed_result = options.unsafe_model_claimed_result;
  return { ...proposal, ...unsafe } as T;
}

export class MockOrchestrator implements OrchestratorPort {
  private readonly now: () => Date;
  private readonly routes: MockOrchestrationRoute[];
  private readonly options: MockOrchestratorOptions;

  constructor(options: MockOrchestratorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.routes = options.routes && options.routes.length > 0 ? options.routes : defaultRoutes();
    this.options = options;
  }

  propose(request: OrchestrationRequest): OrchestrationOutcome {
    const correlation_id = normalizeCorrelationId({
      request_id: request.request_id,
      correlation_id: request.correlation_id
    });
    const requestId = request.request_id.trim();
    const organization_id = normalizeOptionalString(request.organization_id);
    const principal_id = normalizeOptionalString(request.principal_id ?? request.actor?.principal_id ?? null);
    const user_message = request.user_message.trim();
    const installation_id = normalizeOptionalString(request.installation_id ?? request.context?.installation_id ?? null);
    const created_at = this.now().toISOString();

    if (!organization_id || !principal_id || user_message.length === 0) {
      const reason = !organization_id
        ? 'organization required for orchestration'
        : !principal_id
          ? 'principal required for orchestration'
          : 'user message required for orchestration';
      return cloneOutcome({
        request_id: requestId,
        organization_id,
        principal_id,
        correlation_id,
        installation_id,
        status: 'blocked',
        proposal: null,
        validation: {
          valid: false,
          status: 'blocked',
          reason,
          capability_key: null,
          params: null,
          capability_active: false,
          capability_known: false
        },
        workflow_kind: null,
        workflow_result: null,
        response: buildResponse({
          workflow_kind: null,
          status: 'blocked',
          message: reason,
          data: null,
          response_source: 'workflow_blocked'
        }),
        evidence_links: [],
        created_at,
        updated_at: created_at,
        reason
      });
    }

    const context = request.context ?? null;
    const forcedCapabilityKey = normalizeOptionalString(context?.force_capability_key ?? null);
    const forcedParams = context?.force_params && typeof context.force_params === 'object' ? structuredClone(context.force_params) : null;
    const selectedRoute =
      forcedCapabilityKey && forcedParams
        ? null
        : forcedCapabilityKey
          ? this.routes.find((route) => route.capability_key === forcedCapabilityKey) ?? null
          : this.routes.find((route) => routeMatches(user_message, route)) ?? null;

    if (!forcedCapabilityKey && !selectedRoute) {
      const reason = 'no proposal';
      return cloneOutcome({
        request_id: requestId,
        organization_id,
        principal_id,
        correlation_id,
        installation_id,
        status: 'no_proposal',
        proposal: null,
        validation: {
          valid: false,
          status: 'no_proposal',
          reason,
          capability_key: null,
          params: null,
          capability_active: false,
          capability_known: false
        },
        workflow_kind: null,
        workflow_result: null,
        response: buildResponse({
          workflow_kind: null,
          status: 'no_proposal',
          message: 'no puedo determinar qué hacer',
          data: null,
          response_source: 'workflow_blocked'
        }),
        evidence_links: [],
        created_at,
        updated_at: created_at,
        reason
      });
    }

    const route = selectedRoute ?? this.routes.find((candidate) => candidate.capability_key === forcedCapabilityKey) ?? null;
    if (!route && forcedCapabilityKey) {
      const proposal = attachUnsafeFields(
        {
          proposal_id: createDeterministicId('orchestration-proposal', {
            request_id: requestId,
            correlation_id,
            capability_key: forcedCapabilityKey,
            user_message
          }),
          capability_key: forcedCapabilityKey,
          params: forcedParams ?? {},
          confidence: 0.99,
          reason: 'forced routing'
        },
        this.options
      );
      const reason = 'proposal denied: capability route unknown';
      return cloneOutcome({
        request_id: requestId,
        organization_id,
        principal_id,
        correlation_id,
        installation_id,
        status: 'denied',
        proposal,
        validation: {
          valid: false,
          status: 'denied',
          reason,
          capability_key: proposal.capability_key,
          params: proposal.params,
          capability_active: false,
          capability_known: false
        },
        workflow_kind: null,
        workflow_result: null,
        response: buildResponse({
          workflow_kind: null,
          status: 'denied',
          message: reason,
          data: null,
          response_source: 'workflow_blocked'
        }),
        evidence_links: [],
        created_at,
        updated_at: created_at,
        reason
      });
    }

    if (!route) {
      const reason = 'no proposal';
      return cloneOutcome({
        request_id: requestId,
        organization_id,
        principal_id,
        correlation_id,
        installation_id,
        status: 'no_proposal',
        proposal: null,
        validation: {
          valid: false,
          status: 'no_proposal',
          reason,
          capability_key: null,
          params: null,
          capability_active: false,
          capability_known: false
        },
        workflow_kind: null,
        workflow_result: null,
        response: buildResponse({
          workflow_kind: null,
          status: 'no_proposal',
          message: 'no puedo determinar qué hacer',
          data: null,
          response_source: 'workflow_blocked'
        }),
        evidence_links: [],
        created_at,
        updated_at: created_at,
        reason
      });
    }

    const params = forcedParams ?? route.buildParams(request);
    const proposal = attachUnsafeFields(
      {
        proposal_id: createDeterministicId('orchestration-proposal', {
          request_id: requestId,
          correlation_id,
          capability_key: route.capability_key,
          user_message
        }),
        capability_key: route.capability_key,
        params,
        confidence: route.confidence,
        reason: route.reason
      },
      this.options
    );
    return cloneOutcome({
      request_id: requestId,
      organization_id,
      principal_id,
      correlation_id,
      installation_id,
      status: 'proposal',
      proposal,
      validation: {
        valid: true,
        status: 'proposal',
        reason: route.reason,
        capability_key: proposal.capability_key,
        params: proposal.params,
        capability_active: true,
        capability_known: true
      },
      workflow_kind: null,
      workflow_result: null,
      response: buildResponse({
        workflow_kind: null,
        status: 'proposal',
        message: route.reason,
        data: null,
        response_source: 'workflow_blocked'
      }),
      evidence_links: [],
      created_at,
      updated_at: created_at,
      reason: route.reason
    });
  }
}

export function createMockOrchestrator(options: MockOrchestratorOptions = {}): MockOrchestrator {
  return new MockOrchestrator(options);
}
