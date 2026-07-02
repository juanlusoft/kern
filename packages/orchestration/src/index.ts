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

export interface OrchestrationBoundaryOptions {
  orchestrator?: OrchestratorPort | null;
  workflowRuntime?: InMemoryGovernedWorkflowRuntime;
  installationCapabilities?: Record<string, string[]>;
  now?: () => Date;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

  if (payment_status && resource_type !== 'invoice') {
    return false;
  }

  if (params.year !== undefined && params.year !== null && year === null) {
    return false;
  }

  return Boolean(estimate_id || customer_id || payment_status || year);
}

function resolveWorkflowRequest(
  proposal: OrchestrationProposal,
  request: OrchestrationRequest
): MockReadEstimateWorkflowInput | MockEmailSendWorkflowInput | null {
  if (proposal.capability_key === 'mock.resource.read') {
    const estimate_id = normalizeOptionalString(proposal.params.estimate_id);
    const resource_type = proposal.params.resource_type === 'invoice' ? 'invoice' : 'estimate';
    const year = normalizeYear(proposal.params.year);
    const payment_status = normalizeResourceQuery({
      payment_status: proposal.params.payment_status ?? null
    }).payment_status;
    const customer_id =
      normalizeCustomerLookupParam(proposal.params.customer_id) ??
      normalizeCustomerLookupParam(proposal.params.customer_name) ??
      normalizeCustomerLookupParam(proposal.params.contact_name) ??
      normalizeCustomerLookupParam(proposal.params.contactName) ??
      normalizeCustomerLookupParam(proposal.params.contact);
    if (!estimate_id && !customer_id && !payment_status && !year) {
      return null;
    }
    return {
      kind: 'mock.estimate.read',
      workflow_id: request.request_id,
      organization_hint: request.organization_id,
      principal_hint: request.principal_id ?? request.actor?.principal_id ?? null,
      correlation_id: request.correlation_id,
      resource_type,
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
      approval_decision: 'approved',
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
  private readonly now: () => Date;

  constructor(options: OrchestrationBoundaryOptions = {}) {
    this.orchestrator = options.orchestrator ?? null;
    this.workflowRuntime =
      options.workflowRuntime ??
      new InMemoryGovernedWorkflowRuntime({
        now: options.now
      });
    this.installationCapabilities = options.installationCapabilities ?? {};
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

    if (!this.orchestrator) {
      return this.finishBlockedOutcome({
        request: orchestratorRequest,
        reason: 'orchestrator unavailable',
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id
      });
    }

    let proposalOutcome: OrchestrationOutcome;
    try {
      proposalOutcome = this.orchestrator.propose(orchestratorRequest);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'orchestrator unavailable';
      return this.finishErrorOutcome({
        request: orchestratorRequest,
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
        request: orchestratorRequest,
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
        request: orchestratorRequest,
        reason: proposalOutcome.reason,
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome
      });
    }

    if (proposalOutcome.status === 'error') {
      return this.finishErrorOutcome({
        request: orchestratorRequest,
        reason: proposalOutcome.reason,
        orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
        proposalOutcome
      });
    }

    const proposal = proposalOutcome.proposal;
    if (!proposal) {
      return this.finishBlockedOutcome({
        request: orchestratorRequest,
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
            request: orchestratorRequest,
            reason: validation.reason,
            orchestrationRequestedEvidence: orchestrationRequestedEvidence.evidence_id,
            proposalOutcome,
            validation
          })
        : this.finishBlockedOutcome({
            request: orchestratorRequest,
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
        request: orchestratorRequest,
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

    const workflowRequest = resolveWorkflowRequest(proposal, normalizedRequest);
    if (!workflowRequest) {
      return this.finishBlockedOutcome({
        request: orchestratorRequest,
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
        request: orchestratorRequest,
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
        request: orchestratorRequest,
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
      request: orchestratorRequest,
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


