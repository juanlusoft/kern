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

export function normalizeResourceType(value: unknown): 'estimate' | 'invoice' {
  return value === 'invoice' ? 'invoice' : 'estimate';
}

function cloneWorkflowStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    details: structuredClone(step.details)
  };
}

export function buildWorkflowStep(input: {
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

export function createWorkflowEvidence(
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

export function createWorkflowCoreRequest(input: {
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

export function createRuntimeResponse(input: {
  kind: GovernedWorkflowKind | null;
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

export function createDeniedCapabilityResult(input: {
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

export function workflowEvidenceTrace(records: { evidence_id: string; record_type: string }[]): WorkflowEvidenceTrace {
  return {
    evidence_ids: records.map((record) => record.evidence_id),
    record_types: records.map((record) => record.record_type as WorkflowEvidenceTrace['record_types'][number])
  };
}

export function buildWorkflowResult(input: {
  workflow_id: string;
  workflow_kind: GovernedWorkflowKind | null;
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
