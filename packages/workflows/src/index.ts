import {
  createDeterministicId,
  createEvidenceRecord,
  fingerprintCapabilityInput,
  fingerprintCapabilityInvocation,
  fingerprintCoreRequest,
  normalizeCorrelationId,
  normalizeResourceQuery,
  type CapabilityDefinition,
  type CapabilityInvocationRequest,
  type CapabilityInvocationResult,
  type CoreRequest,
  type ExternalReadAdapter,
  type GovernedWorkflowRequest,
  type GovernedWorkflowResult,
  type GovernedWorkflowResponse,
  type GovernedWorkflowKind,
  type MockEmailSendWorkflowInput,
  type MockReadEstimateWorkflowInput,
  type PrincipalType,
  type ResourceQuery,
  type ResourceResult,
  type WorkflowEvidenceTrace,
  type WorkflowExecutionStatus,
  type WorkflowStep
} from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryCapabilityRuntime, createMockResourceReadCapability } from '../../capabilities/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import { evaluatePolicy } from '../../policy/src/index';
import { InMemoryTurnRuntime } from '../../turns/src/index';
import { createMockExternalReadAdapter } from '../../external-read-adapters/src/index';

const WORKFLOW_FLAGS = {
  force_policy_deny: false,
  force_policy_defer: false,
  missing_critical_attribute: false,
  obligation_incomplete: false,
  attempt_human_impersonation: false,
  delegated_identity_exceeds_principal: false,
  agent_selected_organization: false
} as const;

function normalizeResourceType(value: unknown): 'estimate' | 'invoice' {
  return value === 'invoice' ? 'invoice' : 'estimate';
}

function cloneWorkflowStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    details: structuredClone(step.details)
  };
}

function buildWorkflowStep(input: {
  step_kind: WorkflowStep['step_kind'];
  status: WorkflowExecutionStatus;
  evidence_reference: string | null;
  details?: Record<string, unknown>;
}): WorkflowStep {
  return {
    step_id: createDeterministicId('workflow-step', {
      step_kind: input.step_kind,
      status: input.status,
      evidence_reference: input.evidence_reference,
      details: input.details ?? {}
    }),
    step_kind: input.step_kind,
    status: input.status,
    evidence_reference: input.evidence_reference,
    details: input.details ?? {}
  };
}

function cloneWorkflowResult(result: GovernedWorkflowResult): GovernedWorkflowResult {
  return {
    ...result,
    response: {
      ...result.response,
      data: result.response.data ? structuredClone(result.response.data) : null
    },
    capability_result: result.capability_result
      ? {
          ...result.capability_result,
          output: result.capability_result.output
            ? {
                ...result.capability_result.output,
                result: structuredClone(result.capability_result.output.result)
              }
            : null,
          evidence_links: [...result.capability_result.evidence_links]
        }
      : null,
    evidence_links: [...result.evidence_links],
    steps: result.steps.map((step) => cloneWorkflowStep(step)),
    evidence_trace: {
      evidence_ids: [...result.evidence_trace.evidence_ids],
      record_types: [...result.evidence_trace.record_types]
    }
  };
}

function createWorkflowEvidence(
  input: {
    organization_id: string;
    correlation_id: string;
    record_type:
      | 'preview_created'
      | 'binding_created'
      | 'binding_validated'
      | 'approval_requested'
      | 'effect_blocked'
      | 'workflow_response_created';
    subject: string;
    data: Record<string, unknown>;
  },
  now: () => Date,
  evidenceLedger: InMemoryEvidenceLedger
) {
  return evidenceLedger.append(
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

function createWorkflowCoreRequest(input: {
  workflow_id: string;
  correlation_id: string;
  organization_hint: string | null | undefined;
  principal_hint: string | null | undefined;
  action: string;
  purpose: string;
  payload: Record<string, unknown>;
  requires_binding: boolean;
}): CoreRequest {
  const rawRequestedScope = input.payload.requested_scope;
  const requested_scope =
    typeof rawRequestedScope === 'string' || Array.isArray(rawRequestedScope)
      ? rawRequestedScope
      : input.requires_binding
        ? 'request:governed'
        : 'read:knowledge';
  const rawResource = input.payload.resource;
  const resource = typeof rawResource === 'string' && rawResource.trim().length > 0 ? rawResource : input.action;
  const rawOperation = input.payload.operation;
  const operation = typeof rawOperation === 'string' && rawOperation.trim().length > 0 ? rawOperation : 'read';
  const rawClassification = input.payload.classification;
  const classification = typeof rawClassification === 'string' ? rawClassification : 'internal';
  const rawDestination = input.payload.destination;
  const destination = typeof rawDestination === 'string' ? rawDestination : 'core';
  const rawAmount = input.payload.amount;
  const amount = typeof rawAmount === 'number' ? rawAmount : 1;
  const rawFlags = input.payload.flags;
  const flags = rawFlags && typeof rawFlags === 'object' ? rawFlags : {};
  return {
    request_id: input.workflow_id,
    organization_hint: input.organization_hint ?? null,
    principal_hint: input.principal_hint ?? null,
    action: input.action,
    purpose: input.purpose,
    payload: {
      resource,
      operation,
      requested_scope,
      classification,
      destination,
      amount,
      flags: { ...WORKFLOW_FLAGS, ...flags }
    },
    requires_binding: input.requires_binding,
    correlation_id: input.correlation_id
  };
}

function createRuntimeResponse(input: {
  kind: GovernedWorkflowKind;
  status: WorkflowExecutionStatus;
  message: string;
  data: Record<string, unknown> | null;
  runtimeDriven: boolean;
}): GovernedWorkflowResponse {
  return {
    response_source: input.runtimeDriven ? 'runtime_result' : 'workflow_blocked',
    workflow_kind: input.kind,
    status: input.status,
    message: input.message,
    data: input.data ? structuredClone(input.data) : null
  };
}

function createDeniedCapabilityResult(input: {
  capability_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  reason: string;
  evidence_reference: string;
}): CapabilityInvocationResult {
  return {
    invocation_id: createDeterministicId('capability-invocation', {
      capability_id: input.capability_id,
      organization_id: input.organization_id,
      principal_id: input.principal_id,
      correlation_id: input.correlation_id,
      reason: input.reason
    }),
    capability_id: input.capability_id,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    correlation_id: input.correlation_id,
    status: 'denied',
    runtime_decision: 'denied',
    binding_id: null,
    decision_binding_id: null,
    policy_decision_id: null,
    executed_by_runtime: true,
    output: null,
    error: input.reason,
    evidence_links: [input.evidence_reference],
    created_at: new Date().toISOString(),
    evidence_reference: input.evidence_reference,
    reason: input.reason
  };
}

function workflowEvidenceTrace(records: { evidence_id: string; record_type: string }[]): WorkflowEvidenceTrace {
  return {
    evidence_ids: records.map((record) => record.evidence_id),
    record_types: records.map((record) => record.record_type as WorkflowEvidenceTrace['record_types'][number])
  };
}

function buildWorkflowResult(input: {
  workflow_id: string;
  workflow_kind: GovernedWorkflowKind;
  organization_id: string | null;
  correlation_id: string;
  turn_id: string | null;
  status: WorkflowExecutionStatus;
  response: GovernedWorkflowResponse;
  capability_result: CapabilityInvocationResult | null;
  evidence_links: string[];
  created_at: string;
  updated_at: string;
  steps: WorkflowStep[];
  evidence_trace: WorkflowEvidenceTrace;
}): GovernedWorkflowResult {
  return cloneWorkflowResult({
    workflow_id: input.workflow_id,
    workflow_kind: input.workflow_kind,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    turn_id: input.turn_id,
    status: input.status,
    response: input.response,
    capability_result: input.capability_result,
    evidence_links: [...input.evidence_links],
    created_at: input.created_at,
    updated_at: input.updated_at,
    steps: input.steps.map((step) => cloneWorkflowStep(step)),
    evidence_trace: {
      evidence_ids: [...input.evidence_trace.evidence_ids],
      record_types: [...input.evidence_trace.record_types]
    }
  });
}

function createMockEstimatePayload(input: MockReadEstimateWorkflowInput): Record<string, unknown> {
  return {
    resource_type: input.resource_type ?? 'estimate',
    estimate_id: input.estimate_id ?? null,
    customer_id: input.customer_id ?? null
  };
}

function createMockResourceQuery(input: {
  workflow_id: string;
  correlation_id: string;
  organization_id: string;
  principal_id: string;
  principal_type: PrincipalType | null;
  delegated_identity: string | null;
  resource_type?: 'estimate' | 'invoice';
  estimate_id?: string | null;
  customer_id?: string | null;
  claimed_result?: unknown;
  caller_result?: unknown;
  assistant_result?: unknown;
  model_claimed_result?: unknown;
}): ResourceQuery {
  return normalizeResourceQuery({
    query_id: input.workflow_id,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    actor: {
      principal_id: input.principal_id,
    principal_type: input.principal_type,
    delegated_identity: input.delegated_identity
    },
    resource_type: input.resource_type ?? 'estimate',
    resource_id: input.estimate_id ?? null,
    filters: input.customer_id ? { customer_id: input.customer_id } : null,
    requested_fields:
      input.resource_type === 'invoice'
        ? ['invoice_id', 'customer_name', 'description', 'base_amount', 'tax_amount', 'total_amount', 'currency', 'source']
        : ['estimate_id', 'customer_name', 'description', 'base_amount', 'tax_amount', 'total_amount', 'currency', 'source'],
    claimed_result: input.claimed_result ?? null,
    model_claimed_result: input.model_claimed_result ?? null,
    caller_result: input.caller_result ?? null,
    assistant_result: input.assistant_result ?? null
  });
}

function createMockEmailPayload(input: MockEmailSendWorkflowInput): Record<string, unknown> {
  return {
    to: input.to,
    subject: input.subject,
    body: input.body,
    preview_note: input.preview_note ?? null
  };
}

export function createMockEstimateReadCapability(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    capability_id: 'mock.estimate.read',
    organization_id: 'org-acme',
    title: 'Mock estimate read',
    description: 'Read an estimate from the governed mock runtime.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: {
      required: false,
      reason: 'read only',
      binding_required: false
    },
    mock: {
      invoke(input) {
        const estimate_id = String(input.input.payload.estimate_id ?? '');
        if (estimate_id === 'estimate-missing') {
          return { status: 'not_found', output: null, error: 'estimate missing' };
        }
        if (estimate_id === 'estimate-offline') {
          return { status: 'unavailable', output: null, error: 'estimate service unavailable' };
        }
        if (estimate_id === 'estimate-error') {
          return { status: 'error', output: null, error: 'estimate service error' };
        }
        return {
          status: 'executed',
          output: {
            capability_id: input.capability_id,
            status: 'executed',
            result: {
              estimate_id,
              customer_name: input.input.payload.customer_id ? 'Acme Customer' : 'Acme Customer',
              description: 'Quarterly estimate mock',
              base_amount: 1000,
              tax_amount: 210,
              total_amount: 1210,
              currency: 'EUR',
              source: 'mock_runtime'
            },
            processed_at: '2026-06-29T00:00:00.000Z'
          },
          error: null
        };
      }
    },
    ...overrides
  };
}

export function createMockEmailPreviewCapability(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    capability_id: 'mock.email.preview',
    organization_id: 'org-acme',
    title: 'Mock email preview',
    description: 'Preview an email without sending it.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: {
      required: false,
      reason: 'preview only',
      binding_required: false
    },
    mock: {
      invoke(input) {
        const body = String(input.input.payload.body ?? '');
        return {
          status: 'executed',
          output: {
            capability_id: input.capability_id,
            status: 'executed',
            result: {
              to: String(input.input.payload.to ?? ''),
              subject: String(input.input.payload.subject ?? ''),
              body_fingerprint: fingerprintCapabilityInput(input.input),
              preview_fingerprint: fingerprintCapabilityInvocation(input),
              source: 'mock_runtime'
            },
            processed_at: '2026-06-29T00:00:00.000Z'
          },
          error: null
        };
      }
    },
    ...overrides
  };
}

export function createMockEmailSendCapability(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    capability_id: 'mock.email.send',
    organization_id: 'org-acme',
    title: 'Mock email send',
    description: 'Send a governed email through the mock runtime.',
    kind: 'effectful',
    version: '1.0.0',
    enabled: true,
    approval_requirement: {
      required: true,
      reason: 'binding required',
      binding_required: true
    },
    mock: {
      invoke(input) {
        return {
          status: 'executed',
          output: {
            capability_id: input.capability_id,
            status: 'executed',
            result: {
              mock_message_id: createDeterministicId('mock-message', {
                to: input.input.payload.to,
                subject: input.input.payload.subject,
                body_fingerprint: fingerprintCapabilityInput(input.input),
                binding_id: input.decision_binding_id ?? input.binding_id ?? null
              }),
              to: String(input.input.payload.to ?? ''),
              subject: String(input.input.payload.subject ?? ''),
              body_fingerprint: fingerprintCapabilityInput(input.input),
              sent: true,
              source: 'mock_runtime'
            },
            processed_at: '2026-06-29T00:00:00.000Z'
          },
          error: null
        };
      }
    },
    ...overrides
  };
}

export interface GovernedWorkflowRuntimeOptions {
  evidenceLedger?: InMemoryEvidenceLedger;
  bindingStore?: InMemoryDecisionBindingStore;
  capabilityRuntime?: InMemoryCapabilityRuntime;
  turnRuntime?: InMemoryTurnRuntime;
  externalReadAdapter?: ExternalReadAdapter;
  resolveOrganizationContext?: typeof resolveOrganizationContext;
  resolveIdentityContext?: typeof resolveIdentityContext;
  now?: () => Date;
}

export class InMemoryGovernedWorkflowRuntime {
  private readonly evidenceLedger: InMemoryEvidenceLedger;
  private readonly bindingStore: InMemoryDecisionBindingStore;
  private readonly capabilityRuntime: InMemoryCapabilityRuntime;
  private readonly turnRuntime: InMemoryTurnRuntime;
  private readonly externalReadAdapter: ExternalReadAdapter;
  private readonly resolveOrganizationContext: typeof resolveOrganizationContext;
  private readonly resolveIdentityContext: typeof resolveIdentityContext;
  private readonly now: () => Date;
  private readonly workflowRecords = new Map<string, GovernedWorkflowResult>();

  constructor(options: GovernedWorkflowRuntimeOptions = {}) {
    this.evidenceLedger = options.evidenceLedger ?? new InMemoryEvidenceLedger();
    this.bindingStore = options.bindingStore ?? new InMemoryDecisionBindingStore();
    this.externalReadAdapter = options.externalReadAdapter ?? createMockExternalReadAdapter({ now: options.now });
    this.resolveOrganizationContext = options.resolveOrganizationContext ?? resolveOrganizationContext;
    this.resolveIdentityContext = options.resolveIdentityContext ?? resolveIdentityContext;
    this.capabilityRuntime =
      options.capabilityRuntime ?? new InMemoryCapabilityRuntime({ evidenceLedger: this.evidenceLedger, bindingStore: this.bindingStore, now: options.now });
    this.turnRuntime = options.turnRuntime ?? new InMemoryTurnRuntime({ evidenceLedger: this.evidenceLedger, now: options.now });
    this.now = options.now ?? (() => new Date());

    if (!options.capabilityRuntime) {
      this.registerCapability(createMockResourceReadCapability(this.externalReadAdapter));
      this.registerCapability(createMockEstimateReadCapability());
      this.registerCapability(createMockEmailPreviewCapability());
      this.registerCapability(createMockEmailSendCapability());
    }
  }

  registerCapability(capability: CapabilityDefinition): CapabilityDefinition {
    return this.capabilityRuntime.registerCapability(capability);
  }

  getEvidenceLedger(): InMemoryEvidenceLedger {
    return this.evidenceLedger;
  }

  getBindingStore(): InMemoryDecisionBindingStore {
    return this.bindingStore;
  }

  getCapabilityRuntime(): InMemoryCapabilityRuntime {
    return this.capabilityRuntime;
  }

  getTurnRuntime(): InMemoryTurnRuntime {
    return this.turnRuntime;
  }

  getWorkflow(workflow_id: string): GovernedWorkflowResult | undefined {
    const result = this.workflowRecords.get(workflow_id);
    return result ? buildWorkflowResult(result) : undefined;
  }

  executeWorkflow(input: GovernedWorkflowRequest): GovernedWorkflowResult {
    return input.kind === 'mock.estimate.read'
      ? this.executeMockEstimateReadWorkflow(input)
      : this.executeMockEmailSendWorkflow(input);
  }

  private executeMockEstimateReadWorkflow(input: MockReadEstimateWorkflowInput): GovernedWorkflowResult {
    const correlation_id = normalizeCorrelationId({
      request_id: input.workflow_id,
      correlation_id: input.correlation_id ?? null
    });
    const requested_at = input.requested_at?.trim() || this.now().toISOString();
    const capabilityId = input.capability_id ?? 'mock.resource.read';
    const resource_type = normalizeResourceType(input.resource_type);
    const estimate_id = input.estimate_id?.trim() || null;
    const customer_id = input.customer_id?.trim() || null;
    const coreRequest = createWorkflowCoreRequest({
      workflow_id: input.workflow_id,
      correlation_id,
      organization_hint: input.organization_hint,
      principal_hint: input.principal_hint,
      action: 'workflow.mock.estimate.read',
      purpose:
        resource_type === 'invoice'
          ? customer_id
            ? `Read latest invoice for ${customer_id}`
            : `Read invoice ${estimate_id ?? 'unknown'}`
          : customer_id
            ? `Read latest estimate for ${customer_id}`
            : `Read estimate ${estimate_id ?? 'unknown'}`,
      payload: {
        resource: customer_id ? `${resource_type}/customer/${customer_id}` : `${resource_type}/${estimate_id ?? 'unknown'}`,
        operation: 'read',
        requested_scope: 'read:knowledge',
        classification: 'internal',
        destination: 'core',
        amount: 1
      },
      requires_binding: false
    });
    const workflowKind: GovernedWorkflowKind = 'mock.estimate.read';
    const created_at = requested_at;
    const steps: WorkflowStep[] = [];
    const evidenceRecords = [] as { evidence_id: string; record_type: string }[];

    const intentEvidence = createEvidenceRecord({
      organization_id: input.organization_hint?.trim() || 'unknown',
      correlation_id,
      record_type: 'intent',
      subject: coreRequest.action,
      data: {
        workflow_id: input.workflow_id,
        kind: input.kind,
        estimate_id,
        customer_id,
        claimed_result: input.claimed_result ?? null,
        claimed_output: input.claimed_output ?? null,
        caller_result: input.caller_result ?? null,
        assistant_result: input.assistant_result ?? null,
        model_claimed_result: input.model_claimed_result ?? null
      },
      created_at
    });
    this.evidenceLedger.append(intentEvidence);
    evidenceRecords.push(intentEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'intent',
      status: 'completed',
      evidence_reference: intentEvidence.evidence_id,
      details: { resource_type, estimate_id, customer_id }
    }));

    const organizationContext = this.resolveOrganizationContext(coreRequest);
    if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
      const deniedEvidence = this.appendWorkflowEvidence({
        organization_id: input.organization_hint?.trim() || 'unknown',
        correlation_id,
        record_type: 'capability_invocation_denied',
        subject: capabilityId,
        data: {
          workflow_id: input.workflow_id,
          capability_id: capabilityId,
          reason: 'organization could not be resolved'
        }
      });
      evidenceRecords.push(deniedEvidence);
      const capability_result = createDeniedCapabilityResult({
        capability_id: capabilityId,
        organization_id: input.organization_hint?.trim() || 'unknown',
        principal_id: input.principal_hint?.trim() || 'unknown',
        correlation_id,
        reason: 'organization could not be resolved',
        evidence_reference: deniedEvidence.evidence_id
      });
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: 'organization could not be resolved',
        data: null,
        runtimeDriven: false
      });
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: null,
        correlation_id,
        turn_id: null,
        status: 'denied',
        response,
        capability_result,
        evidenceRecords,
        steps,
        created_at,
        updated_at: this.now().toISOString()
      });
    }

    const identityContext = this.resolveIdentityContext(coreRequest, organizationContext);
    const governedResourceQuery = createMockResourceQuery({
      workflow_id: input.workflow_id,
      correlation_id,
      organization_id: organizationContext.organization_id ?? 'unknown',
      principal_id: identityContext.principal_id ?? 'unknown',
      principal_type: identityContext.principal_type,
      delegated_identity: identityContext.delegated_identity,
      resource_type,
      estimate_id,
      customer_id,
      claimed_result: input.claimed_result ?? null,
      caller_result: input.caller_result ?? null,
      assistant_result: input.assistant_result ?? null,
      model_claimed_result: input.model_claimed_result ?? null
    });
    if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
      const deniedEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'capability_invocation_denied',
        subject: capabilityId,
        data: {
          workflow_id: input.workflow_id,
          capability_id: capabilityId,
          reason: 'principal could not be resolved'
        }
      });
      evidenceRecords.push(deniedEvidence);
      const capability_result = createDeniedCapabilityResult({
        capability_id: capabilityId,
        organization_id: organizationContext.organization_id,
        principal_id: input.principal_hint?.trim() || 'unknown',
        correlation_id,
        reason: 'principal could not be resolved',
        evidence_reference: deniedEvidence.evidence_id
      });
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: 'principal could not be resolved',
        data: null,
        runtimeDriven: false
      });
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        turn_id: null,
        status: 'denied',
        response,
        capability_result,
        evidenceRecords,
        steps,
        created_at,
        updated_at: this.now().toISOString()
      });
    }

    const policyDecision = evaluatePolicy({ request: coreRequest, organizationContext, identityContext });
    const policyEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'policy_decision',
      subject: policyDecision.outcome,
      data: {
        decision_id: policyDecision.decision_id,
        decision_reason: policyDecision.decision_reason,
        outcome: policyDecision.outcome,
        obligations: policyDecision.obligations
      }
    });
    evidenceRecords.push(policyEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'policy',
      status: policyDecision.allow ? 'completed' : 'denied',
      evidence_reference: policyEvidence.evidence_id,
      details: {
        decision_id: policyDecision.decision_id,
        outcome: policyDecision.outcome
      }
    }));

    if (policyDecision.deny || policyDecision.failed_closed || policyDecision.defer) {
      const blockedStatus: WorkflowExecutionStatus = policyDecision.defer ? 'blocked' : 'denied';
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: blockedStatus,
        message: policyDecision.decision_reason,
        data: null,
        runtimeDriven: false
      });
      const workflowResponseEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'workflow_response_created',
        subject: input.workflow_id,
        data: {
          workflow_id: input.workflow_id,
          status: blockedStatus,
          response_source: response.response_source,
          response
        }
      });
      evidenceRecords.push(workflowResponseEvidence);
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        turn_id: null,
        status: blockedStatus,
        response,
        capability_result: null,
        evidenceRecords,
        steps,
        created_at,
        updated_at: workflowResponseEvidence.created_at,
        extraEvidence: workflowResponseEvidence
      });
    }

    const turn = this.turnRuntime.createTurn({
      organization_id: organizationContext.organization_id,
      correlation_id,
      actor: {
        principal_id: identityContext.principal_id,
        principal_type: identityContext.principal_type,
        delegated_identity: identityContext.delegated_identity
      },
      execution_context: {
        request_id: coreRequest.request_id,
        request_fingerprint: fingerprintCoreRequest({
          request: coreRequest,
          organization_id: organizationContext.organization_id,
          principal_id: identityContext.principal_id
        }),
        policy_decision_id: policyDecision.decision_id,
        binding_id: null,
        requires_binding: false
      },
      now: this.now
    });
    steps.push(buildWorkflowStep({
      step_kind: 'turn',
      status: 'completed',
      evidence_reference: turn.evidence_links[0] ?? null,
      details: { turn_id: turn.turn_id, state: turn.state }
    }));

    this.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'evaluating',
      reason: resource_type === 'invoice' ? 'mock invoice workflow evaluating' : 'mock estimate workflow evaluating',
      now: this.now
    });
    this.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'executing',
      reason: resource_type === 'invoice' ? 'mock invoice workflow executing' : 'mock estimate workflow executing',
      now: this.now
    });

    const capabilityInvocation: CapabilityInvocationRequest = {
      capability_id: capabilityId,
      organization_id: organizationContext.organization_id,
      principal_id: identityContext.principal_id,
      correlation_id,
      input: {
        purpose:
          resource_type === 'invoice'
            ? customer_id
              ? `Read latest invoice for ${customer_id}`
              : `Read invoice ${estimate_id ?? 'unknown'}`
            : customer_id
              ? `Read latest estimate for ${customer_id}`
              : `Read estimate ${estimate_id ?? 'unknown'}`,
        requested_scope: ['read:knowledge'],
        payload: governedResourceQuery as unknown as Record<string, unknown>
      },
      decision_binding_id: null,
      binding_id: null,
      policy_decision_id: policyDecision.decision_id,
      approval_requirement: {
        required: false,
        reason: 'read only',
        binding_required: false
      },
      requested_at
    };
    const capabilityInvocationEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'capability_invocation_requested',
      subject: capabilityId,
      data: {
        workflow_id: input.workflow_id,
        capability_invocation: capabilityInvocation,
        capability_id: capabilityId
      }
    });
    evidenceRecords.push(capabilityInvocationEvidence);
    evidenceRecords.push(
      this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'external_read_requested',
        subject: capabilityId,
        data: {
          workflow_id: input.workflow_id,
          resource_query: governedResourceQuery
        }
      })
    );

    const capability_result = this.capabilityRuntime.invokeCapability(capabilityInvocation);
    const resourceResult = capability_result.output?.result as unknown as ResourceResult | null;
    steps.push(buildWorkflowStep({
      step_kind: 'capability',
      status: capability_result.status === 'executed' ? 'completed' : capability_result.status,
      evidence_reference: capability_result.evidence_reference,
      details: {
        capability_id: capability_result.capability_id,
        status: capability_result.status,
        executed_by_runtime: capability_result.executed_by_runtime
      }
    }));

    if (capability_result.status === 'executed') {
      if (resourceResult?.status === 'found') {
        evidenceRecords.push(
          this.appendWorkflowEvidence({
            organization_id: organizationContext.organization_id,
            correlation_id,
            record_type: 'source_evidence_recorded',
            subject: capabilityId,
            data: {
              workflow_id: input.workflow_id,
              resource_type: resourceResult.resource_type,
              resource_id: resourceResult.resource_id,
              source_evidence: resourceResult.source_evidence
            }
          })
        );
        evidenceRecords.push(
          this.appendWorkflowEvidence({
            organization_id: organizationContext.organization_id,
            correlation_id,
            record_type: 'external_read_found',
            subject: capabilityId,
            data: {
              workflow_id: input.workflow_id,
              resource_result: resourceResult
            }
          })
        );
      }
      this.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'completed',
        reason: resource_type === 'invoice' ? 'mock invoice workflow completed' : 'mock estimate workflow completed',
        now: this.now
      });
    } else if (capability_result.status === 'unavailable' || capability_result.status === 'error') {
      this.turnRuntime.markEffectUnknownOutcome({
        turn_id: turn.turn_id,
        effect_id: this.turnRuntime.addPendingEffect({
          turn_id: turn.turn_id,
          binding_id: null,
          evidence_reference: capability_result.evidence_reference,
          now: this.now
        }).effect!.effect_id,
        reason: capability_result.reason,
        evidence_reference: capability_result.evidence_reference,
        now: this.now
      });
      this.turnRuntime.requestReconciliation({
        turn_id: turn.turn_id,
        reason: capability_result.reason,
        evidence_reference: capability_result.evidence_reference,
        now: this.now
      });
    } else {
      this.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: capability_result.status === 'not_found' ? 'completed' : 'failed',
        reason: capability_result.reason,
        now: this.now
      });
    }

    const responseData =
      capability_result.status === 'executed'
        ? resourceResult?.status === 'found'
          ? resourceResult.data
          : capability_result.output?.result && typeof capability_result.output.result === 'object'
            ? (capability_result.output.result as { data?: Record<string, unknown> | null }).data ?? null
            : null
        : null;
    const response = createRuntimeResponse({
      kind: workflowKind,
      status:
        capability_result.status === 'executed'
          ? 'completed'
          : capability_result.status === 'not_found'
            ? 'not_found'
            : capability_result.status === 'unavailable'
              ? 'unavailable'
              : capability_result.status === 'error'
                ? 'error'
                : 'denied',
      message:
        capability_result.status === 'executed'
          ? resource_type === 'invoice'
            ? 'invoice retrieved from runtime'
            : 'estimate retrieved from runtime'
          : capability_result.status === 'not_found'
            ? resource_type === 'invoice'
              ? 'invoice not found'
              : 'estimate not found'
            : capability_result.status === 'unavailable'
              ? resource_type === 'invoice'
                ? 'invoice runtime unavailable'
                : 'estimate runtime unavailable'
              : capability_result.status === 'error'
                ? resource_type === 'invoice'
                  ? 'invoice runtime error'
                  : 'estimate runtime error'
                : resource_type === 'invoice'
                  ? 'invoice denied'
                  : 'estimate denied',
      data: responseData,
      runtimeDriven: true
    });
    const externalReadResultBoundEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'external_read_result_bound',
      subject: capabilityId,
      data: {
        workflow_id: input.workflow_id,
        status: capability_result.status,
        resource_result: resourceResult
      }
    });
    evidenceRecords.push(externalReadResultBoundEvidence);
    if (capability_result.status === 'not_found') {
      evidenceRecords.push(
        this.appendWorkflowEvidence({
          organization_id: organizationContext.organization_id,
          correlation_id,
          record_type: 'external_read_not_found',
          subject: capabilityId,
          data: {
            workflow_id: input.workflow_id,
            resource_result: resourceResult
          }
        })
      );
    } else if (capability_result.status === 'unavailable') {
      evidenceRecords.push(
        this.appendWorkflowEvidence({
          organization_id: organizationContext.organization_id,
          correlation_id,
          record_type: 'external_read_unavailable',
          subject: capabilityId,
          data: {
            workflow_id: input.workflow_id,
            resource_result: resourceResult
          }
        })
      );
    } else if (capability_result.status === 'error') {
      evidenceRecords.push(
        this.appendWorkflowEvidence({
          organization_id: organizationContext.organization_id,
          correlation_id,
          record_type: 'external_read_error',
          subject: capabilityId,
          data: {
            workflow_id: input.workflow_id,
            resource_result: resourceResult
          }
        })
      );
    } else if (capability_result.status === 'denied') {
      evidenceRecords.push(
        this.appendWorkflowEvidence({
          organization_id: organizationContext.organization_id,
          correlation_id,
          record_type: 'external_read_denied',
          subject: capabilityId,
          data: {
            workflow_id: input.workflow_id,
            resource_result: resourceResult
          }
        })
      );
    }
    const responseEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'workflow_response_created',
      subject: input.workflow_id,
      data: {
        workflow_id: input.workflow_id,
        status: response.status,
        response_source: response.response_source,
        capability_result,
        response
      }
    });
    evidenceRecords.push(responseEvidence);
    const finalEvidenceLinks = [
      ...evidenceRecords.map((record) => record.evidence_id),
      ...(capability_result.evidence_links ?? []),
      responseEvidence.evidence_id
    ];
    return this.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: turn.turn_id,
      status: response.status,
      response,
      capability_result,
      evidenceRecords,
      steps,
      created_at,
      updated_at: responseEvidence.created_at,
      extraEvidence: responseEvidence,
      evidence_links: finalEvidenceLinks
    });
  }

  private executeMockEmailSendWorkflow(input: MockEmailSendWorkflowInput): GovernedWorkflowResult {
    const correlation_id = normalizeCorrelationId({
      request_id: input.workflow_id,
      correlation_id: input.correlation_id ?? null
    });
    const requested_at = input.requested_at?.trim() || this.now().toISOString();
    const workflowKind: GovernedWorkflowKind = 'mock.email.send';
    const coreRequest = createWorkflowCoreRequest({
      workflow_id: input.workflow_id,
      correlation_id,
      organization_hint: input.organization_hint,
      principal_hint: input.principal_hint,
      action: 'workflow.mock.email.send',
      purpose: `Send mock email to ${input.to}`,
      payload: {
        resource: `email/${input.to}`,
        operation: 'send',
        requested_scope: 'request:governed',
        classification: 'internal',
        destination: 'core',
        amount: 1
      },
      requires_binding: true
    });
    const created_at = requested_at;
    const steps: WorkflowStep[] = [];
    const evidenceRecords = [] as { evidence_id: string; record_type: string }[];

    const intentEvidence = createEvidenceRecord({
      organization_id: input.organization_hint?.trim() || 'unknown',
      correlation_id,
      record_type: 'intent',
      subject: coreRequest.action,
      data: {
        workflow_id: input.workflow_id,
        kind: input.kind,
        to: input.to,
        subject: input.subject,
        body_fingerprint: fingerprintCapabilityInput({
          purpose: `Send mock email to ${input.to}`,
          payload: {
            to: input.to,
            subject: input.subject,
            body: input.body
          },
          requested_scope: ['request:governed']
        }),
        claimed_result: input.claimed_result ?? null,
        claimed_output: input.claimed_output ?? null,
        caller_result: input.caller_result ?? null,
        assistant_result: input.assistant_result ?? null,
        model_claimed_result: input.model_claimed_result ?? null
      },
      created_at
    });
    this.evidenceLedger.append(intentEvidence);
    evidenceRecords.push(intentEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'intent',
      status: 'completed',
      evidence_reference: intentEvidence.evidence_id,
      details: { to: input.to, subject: input.subject }
    }));

    const organizationContext = this.resolveOrganizationContext(coreRequest);
    if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: 'organization could not be resolved',
        data: null,
        runtimeDriven: false
      });
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: null,
        correlation_id,
        turn_id: null,
        status: 'denied',
        response,
        capability_result: null,
        evidenceRecords,
        steps,
        created_at,
        updated_at: this.now().toISOString()
      });
    }

    const identityContext = this.resolveIdentityContext(coreRequest, organizationContext);
    if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: 'principal could not be resolved',
        data: null,
        runtimeDriven: false
      });
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        turn_id: null,
        status: 'denied',
        response,
        capability_result: null,
        evidenceRecords,
        steps,
        created_at,
        updated_at: this.now().toISOString()
      });
    }

    const policyDecision = evaluatePolicy({ request: coreRequest, organizationContext, identityContext });
    const policyEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'policy_decision',
      subject: policyDecision.outcome,
      data: {
        decision_id: policyDecision.decision_id,
        decision_reason: policyDecision.decision_reason,
        outcome: policyDecision.outcome,
        obligations: policyDecision.obligations
      }
    });
    evidenceRecords.push(policyEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'policy',
      status: policyDecision.allow ? 'completed' : 'denied',
      evidence_reference: policyEvidence.evidence_id,
      details: {
        decision_id: policyDecision.decision_id,
        outcome: policyDecision.outcome
      }
    }));

    if (policyDecision.deny || policyDecision.failed_closed || policyDecision.defer) {
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: policyDecision.defer ? 'blocked' : 'denied',
        message: policyDecision.decision_reason,
        data: null,
        runtimeDriven: false
      });
      const workflowResponseEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'workflow_response_created',
        subject: input.workflow_id,
        data: {
          workflow_id: input.workflow_id,
          status: response.status,
          response_source: response.response_source,
          response
        }
      });
      evidenceRecords.push(workflowResponseEvidence);
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        turn_id: null,
        status: response.status,
        response,
        capability_result: null,
        evidenceRecords,
        steps,
        created_at,
        updated_at: workflowResponseEvidence.created_at,
        extraEvidence: workflowResponseEvidence
      });
    }

    const turn = this.turnRuntime.createTurn({
      organization_id: organizationContext.organization_id,
      correlation_id,
      actor: {
        principal_id: identityContext.principal_id,
        principal_type: identityContext.principal_type,
        delegated_identity: identityContext.delegated_identity
      },
      execution_context: {
        request_id: coreRequest.request_id,
        request_fingerprint: fingerprintCoreRequest({
          request: coreRequest,
          organization_id: organizationContext.organization_id,
          principal_id: identityContext.principal_id
        }),
        policy_decision_id: policyDecision.decision_id,
        binding_id: null,
        requires_binding: true
      },
      now: this.now
    });
    steps.push(buildWorkflowStep({
      step_kind: 'turn',
      status: 'completed',
      evidence_reference: turn.evidence_links[0] ?? null,
      details: { turn_id: turn.turn_id, state: turn.state }
    }));

    this.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'evaluating',
      reason: 'mock email workflow evaluating',
      now: this.now
    });
    this.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'waiting_for_approval',
      reason: 'preview ready for approval',
      now: this.now
    });

    const previewCapabilityId = input.capability_preview_id ?? 'mock.email.preview';
    const previewInvocation: CapabilityInvocationRequest = {
      capability_id: previewCapabilityId,
      organization_id: organizationContext.organization_id,
      principal_id: identityContext.principal_id,
      correlation_id,
      input: {
        purpose: `Preview email to ${input.to}`,
        requested_scope: ['request:governed'],
        payload: createMockEmailPayload(input)
      },
      binding_id: null,
      decision_binding_id: null,
      policy_decision_id: policyDecision.decision_id,
      approval_requirement: {
        required: false,
        reason: 'preview only',
        binding_required: false
      },
      requested_at
    };
    const previewResult = this.capabilityRuntime.invokeCapability(previewInvocation);
    const previewEvidence = createWorkflowEvidence(
      {
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'preview_created',
        subject: previewCapabilityId,
        data: {
          workflow_id: input.workflow_id,
          capability_result: previewResult,
          preview_fingerprint: fingerprintCapabilityInput(previewInvocation.input)
        }
      },
      this.now,
      this.evidenceLedger
    );
    evidenceRecords.push(previewEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'preview',
      status: previewResult.status === 'executed' ? 'completed' : previewResult.status,
      evidence_reference: previewEvidence.evidence_id,
      details: {
        capability_id: previewCapabilityId,
        status: previewResult.status,
        preview_fingerprint: fingerprintCapabilityInput(previewInvocation.input)
      }
    }));

    const approvalRequestedEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'approval_requested',
      subject: input.workflow_id,
      data: {
        workflow_id: input.workflow_id,
        preview_fingerprint: fingerprintCapabilityInput(previewInvocation.input),
        approval_decision: input.approval_decision ?? null
      }
    });
    evidenceRecords.push(approvalRequestedEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'approval_requested',
      status: 'requires_approval',
      evidence_reference: approvalRequestedEvidence.evidence_id,
      details: {
        preview_fingerprint: fingerprintCapabilityInput(previewInvocation.input),
        approval_decision: input.approval_decision ?? null
      }
    }));

    if (input.approval_decision !== 'approved') {
      const blockedEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'effect_blocked',
        subject: input.workflow_id,
        data: {
          workflow_id: input.workflow_id,
          reason: input.approval_decision === 'denied' ? 'approval denied' : 'approval missing'
        }
      });
      evidenceRecords.push(blockedEvidence);
      const deniedEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'capability_invocation_denied',
        subject: input.capability_id ?? 'mock.email.send',
        data: {
          workflow_id: input.workflow_id,
          reason: input.approval_decision === 'denied' ? 'approval denied' : 'approval missing'
        }
      });
      evidenceRecords.push(deniedEvidence);
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'blocked',
        message: input.approval_decision === 'denied' ? 'approval denied' : 'approval missing',
        data: null,
        runtimeDriven: false
      });
      const responseEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'workflow_response_created',
        subject: input.workflow_id,
        data: {
          workflow_id: input.workflow_id,
          status: response.status,
          response_source: response.response_source,
          response
        }
      });
      evidenceRecords.push(responseEvidence);
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        turn_id: turn.turn_id,
        status: 'blocked',
        response,
        capability_result: null,
        evidenceRecords,
        steps,
        created_at,
        updated_at: responseEvidence.created_at,
        extraEvidence: responseEvidence
      });
    }

    const sendCapabilityId = input.capability_id ?? 'mock.email.send';
    const sendInvocation: CapabilityInvocationRequest = {
      capability_id: sendCapabilityId,
      organization_id: organizationContext.organization_id,
      principal_id: identityContext.principal_id,
      correlation_id,
      input: {
        purpose: `Send email to ${input.to}`,
        requested_scope: ['request:governed'],
        payload: {
          to: input.to,
          subject: input.subject,
          body: input.body,
          preview_fingerprint: fingerprintCapabilityInput(previewInvocation.input)
        }
      },
      decision_binding_id: null,
      binding_id: null,
      policy_decision_id: policyDecision.decision_id,
      approval_requirement: {
        required: true,
        reason: 'binding required',
        binding_required: true
      },
      requested_at
    };

    const bindingRequest = createWorkflowCoreRequest({
      workflow_id: input.workflow_id,
      correlation_id,
      organization_hint: input.organization_hint,
      principal_hint: input.principal_hint,
      action: 'workflow.mock.email.send',
      purpose: `Send mock email to ${input.to}`,
      payload: {
        resource: `email/${input.to}`,
        operation: 'send',
        requested_scope: 'request:governed',
        classification: 'internal',
        destination: 'core',
        amount: 1
      },
      requires_binding: true
    });
    const binding = this.bindingStore.createBinding({
      request: bindingRequest,
      organizationContext,
      identityContext,
      policyDecision,
      evidence_reference: approvalRequestedEvidence.evidence_id,
      capabilityInvocation: sendInvocation,
      now: this.now
    });
    const bindingCreatedEvidence = createWorkflowEvidence(
      {
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'binding_created',
        subject: binding.binding_id,
        data: {
          workflow_id: input.workflow_id,
          binding_id: binding.binding_id,
          approved_capability_id: binding.approved_capability_id,
          approved_input_fingerprint: binding.approved_input_fingerprint
        }
      },
      this.now,
      this.evidenceLedger
    );
    evidenceRecords.push(bindingCreatedEvidence);
    const validatedBinding = this.bindingStore.validateBinding({
      binding,
      request: bindingRequest,
      organizationContext,
      identityContext,
      capabilityInvocation: sendInvocation,
      now: this.now
    });
    const bindingValidatedEvidence = createWorkflowEvidence(
      {
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'binding_validated',
        subject: binding.binding_id,
        data: {
          workflow_id: input.workflow_id,
          binding_id: validatedBinding.binding?.binding_id ?? binding.binding_id,
          valid: validatedBinding.valid,
          reason: validatedBinding.reason ?? null
        }
      },
      this.now,
      this.evidenceLedger
    );
    evidenceRecords.push(bindingValidatedEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'binding',
      status: validatedBinding.valid ? 'completed' : 'blocked',
      evidence_reference: bindingValidatedEvidence.evidence_id,
      details: {
        binding_id: validatedBinding.binding?.binding_id ?? binding.binding_id,
        approved_capability_id: binding.approved_capability_id,
        approved_input_fingerprint: binding.approved_input_fingerprint
      }
    }));

    if (!validatedBinding.valid || !validatedBinding.binding) {
      const deniedEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'capability_invocation_denied',
        subject: sendCapabilityId,
        data: {
          workflow_id: input.workflow_id,
          reason: validatedBinding.reason ?? 'binding invalid'
        }
      });
      evidenceRecords.push(deniedEvidence);
      this.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'failed',
        reason: validatedBinding.reason ?? 'binding invalid',
        now: this.now
      });
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: validatedBinding.reason ?? 'binding invalid',
        data: null,
        runtimeDriven: false
      });
      const responseEvidence = this.appendWorkflowEvidence({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'workflow_response_created',
        subject: input.workflow_id,
        data: {
          workflow_id: input.workflow_id,
          status: response.status,
          response_source: response.response_source,
          response
        }
      });
      evidenceRecords.push(responseEvidence);
      return this.finishWorkflow({
        workflow_id: input.workflow_id,
        workflow_kind: workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        turn_id: turn.turn_id,
        status: 'denied',
        response,
        capability_result: null,
        evidenceRecords,
        steps,
        created_at,
        updated_at: responseEvidence.created_at,
        extraEvidence: responseEvidence
      });
    }

    this.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'executing',
      reason: 'mock email workflow executing',
      now: this.now
    });
    const capabilityResult = this.capabilityRuntime.invokeCapability({
      ...sendInvocation,
      binding_id: validatedBinding.binding.binding_id,
      decision_binding_id: validatedBinding.binding.binding_id
    });
    steps.push(buildWorkflowStep({
      step_kind: 'capability',
      status: capabilityResult.status === 'executed' ? 'completed' : capabilityResult.status,
      evidence_reference: capabilityResult.evidence_reference,
      details: {
        capability_id: capabilityResult.capability_id,
        status: capabilityResult.status,
        executed_by_runtime: capabilityResult.executed_by_runtime
      }
    }));

    if (capabilityResult.status === 'executed') {
      this.bindingStore.consumeBinding(validatedBinding.binding.binding_id);
      this.turnRuntime.addPendingEffect({
        turn_id: turn.turn_id,
        binding_id: validatedBinding.binding.binding_id,
        evidence_reference: capabilityResult.evidence_reference,
        now: this.now
      });
      const effect = this.turnRuntime.getTurn(turn.turn_id)?.pending_effects.at(-1);
      if (effect?.effect_id) {
        this.turnRuntime.markEffectSucceeded({
          turn_id: turn.turn_id,
          effect_id: effect.effect_id,
          evidence_reference: capabilityResult.evidence_reference,
          now: this.now
        });
      }
      this.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'completed',
        reason: 'mock email send completed',
        now: this.now
      });
    } else if (capabilityResult.status === 'unavailable' || capabilityResult.status === 'error') {
      this.turnRuntime.addPendingEffect({
        turn_id: turn.turn_id,
        binding_id: validatedBinding.binding.binding_id,
        evidence_reference: capabilityResult.evidence_reference,
        now: this.now
      });
      const effect = this.turnRuntime.getTurn(turn.turn_id)?.pending_effects.at(-1);
      if (effect?.effect_id) {
        this.turnRuntime.markEffectUnknownOutcome({
          turn_id: turn.turn_id,
          effect_id: effect.effect_id,
          reason: capabilityResult.reason,
          evidence_reference: capabilityResult.evidence_reference,
          now: this.now
        });
      }
      this.turnRuntime.requestReconciliation({
        turn_id: turn.turn_id,
        reason: capabilityResult.reason,
        evidence_reference: capabilityResult.evidence_reference,
        now: this.now
      });
    } else {
      this.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'failed',
        reason: capabilityResult.reason,
        now: this.now
      });
    }

    const response = createRuntimeResponse({
      kind: workflowKind,
      status:
        capabilityResult.status === 'executed'
          ? 'completed'
          : capabilityResult.status === 'not_found'
            ? 'not_found'
            : capabilityResult.status === 'unavailable'
              ? 'unavailable'
              : capabilityResult.status === 'error'
                ? 'error'
                : 'denied',
      message:
        capabilityResult.status === 'executed'
          ? 'email prepared and sent via mock runtime'
          : capabilityResult.status === 'not_found'
            ? 'email target not found'
            : capabilityResult.status === 'unavailable'
              ? 'email runtime unavailable'
              : capabilityResult.status === 'error'
                ? 'email runtime error'
                : 'email denied',
      data: capabilityResult.output?.result ?? null,
      runtimeDriven: true
    });
    const responseEvidence = this.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'workflow_response_created',
      subject: input.workflow_id,
      data: {
        workflow_id: input.workflow_id,
        status: response.status,
        response_source: response.response_source,
        capability_result: capabilityResult,
        response
      }
    });
    evidenceRecords.push(responseEvidence);
    const finalEvidenceLinks = [
      ...evidenceRecords.map((record) => record.evidence_id),
      ...(capabilityResult.evidence_links ?? []),
      responseEvidence.evidence_id
    ];
    return this.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: turn.turn_id,
      status: response.status,
      response,
      capability_result: capabilityResult,
      evidenceRecords,
      steps,
      created_at,
      updated_at: responseEvidence.created_at,
      evidence_links: finalEvidenceLinks,
      extraEvidence: responseEvidence
    });
  }

  private appendWorkflowEvidence(input: {
    organization_id: string;
    correlation_id: string;
    record_type:
      | 'policy_decision'
      | 'binding_created'
      | 'binding_validated'
      | 'capability_invocation_requested'
      | 'capability_invocation_denied'
      | 'workflow_response_created'
      | 'preview_created'
      | 'approval_requested'
      | 'effect_blocked'
      | 'external_read_requested'
      | 'external_read_denied'
      | 'external_read_blocked'
      | 'external_read_found'
      | 'external_read_not_found'
      | 'external_read_unavailable'
      | 'external_read_error'
      | 'source_evidence_recorded'
      | 'external_read_result_bound';
    subject: string;
    data: Record<string, unknown>;
  }) {
    return this.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        record_type: input.record_type,
        subject: input.subject,
        data: input.data,
        created_at: this.now().toISOString()
      })
    );
  }

  private finishWorkflow(input: {
    workflow_id: string;
    workflow_kind: GovernedWorkflowKind;
    organization_id: string | null;
    correlation_id: string;
    turn_id: string | null;
    status: WorkflowExecutionStatus;
    response: GovernedWorkflowResponse;
    capability_result: CapabilityInvocationResult | null;
    evidenceRecords: { evidence_id: string; record_type: string }[];
    steps: WorkflowStep[];
    created_at: string;
    updated_at: string;
    evidence_links?: string[];
    extraEvidence?: { evidence_id: string; record_type: string };
  }): GovernedWorkflowResult {
    const traceSource = this.evidenceLedger.listByCorrelation(input.correlation_id);
    const workflowResult = buildWorkflowResult({
      workflow_id: input.workflow_id,
      workflow_kind: input.workflow_kind,
      organization_id: input.organization_id,
      correlation_id: input.correlation_id,
      turn_id: input.turn_id,
      status: input.status,
      response: input.response,
      capability_result: input.capability_result,
      evidence_links: input.evidence_links ?? traceSource.map((record) => record.evidence_id),
      created_at: input.created_at,
      updated_at: input.updated_at,
      steps: input.steps,
      evidence_trace: workflowEvidenceTrace(traceSource)
    });

    this.workflowRecords.set(input.workflow_id, workflowResult);
    return buildWorkflowResult({
      ...workflowResult,
      evidence_trace: workflowEvidenceTrace(this.evidenceLedger.listByCorrelation(input.correlation_id))
    });
  }
}
