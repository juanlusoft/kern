import {
  createEvidenceRecord,
  normalizeCorrelationId,
  type GovernedWorkflowKind,
  type GovernedWorkflowResult,
  type NumaHrReadWorkflowInput,
  type WorkflowExecutionStatus,
  type WorkflowStep
} from '../../contracts/src/index';
import { buildWorkflowStep, createRuntimeResponse, createWorkflowCoreRequest } from './workflow-internals';
import type { WorkflowRuntimeContext } from './workflow-runtime-context';

const WORKFLOW_KIND: GovernedWorkflowKind = 'numa.hr.read';

function normalizeParams(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value as Record<string, unknown>) : {};
}

function buildStatus(status: string): WorkflowExecutionStatus {
  if (status === 'executed') {
    return 'completed';
  }
  if (status === 'not_found' || status === 'unavailable' || status === 'error' || status === 'denied') {
    return status;
  }
  return 'blocked';
}

export function executeNumaHrReadWorkflow(runtime: WorkflowRuntimeContext, input: NumaHrReadWorkflowInput): GovernedWorkflowResult {
  const correlation_id = normalizeCorrelationId({ request_id: input.workflow_id, correlation_id: input.correlation_id ?? null });
  const requested_at = input.requested_at?.trim() || runtime.now().toISOString();
  const created_at = requested_at;
  const capabilityId = input.capability_id;
  const organization_id = input.organization_hint?.trim() || 'unknown';
  const params = normalizeParams(input.params);
  const steps: WorkflowStep[] = [];
  const evidenceRecords: { evidence_id: string; record_type: string }[] = [];

  const intentEvidence = runtime.evidenceLedger.append(
    createEvidenceRecord({
      organization_id,
      correlation_id,
      record_type: 'intent',
      subject: `workflow.${capabilityId}`,
      data: {
        workflow_id: input.workflow_id,
        capability_id: capabilityId,
        params
      },
      created_at
    })
  );
  evidenceRecords.push(intentEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'intent',
      status: 'completed',
      evidence_reference: intentEvidence.evidence_id,
      details: {
        capability_id: capabilityId
      }
    })
  );

  const coreRequest = createWorkflowCoreRequest({
    workflow_id: input.workflow_id,
    correlation_id,
    organization_hint: input.organization_hint,
    principal_hint: input.principal_hint,
    action: `workflow.${capabilityId}`,
    purpose: `Numa HR read for ${capabilityId}`,
    payload: {
      resource: `numa/hr/${capabilityId}`,
      operation: 'read',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1
    },
    requires_binding: false
  });

  const organizationContext = runtime.resolveOrganizationContext(coreRequest);
  if (
    organizationContext.resolution_state !== 'resolved' ||
    !organizationContext.organization_id ||
    organizationContext.organization_state !== 'active'
  ) {
    const response = createRuntimeResponse({
      kind: WORKFLOW_KIND,
      status: 'blocked',
      message: organizationContext.failure_reason ?? 'organization could not be resolved',
      data: null,
      runtimeDriven: false
    });
    const responseEvidence = runtime.appendWorkflowEvidence({
      organization_id,
      correlation_id,
      record_type: 'workflow_response_created',
      subject: capabilityId,
      data: { status: 'blocked', reason: response.message, response }
    });
    evidenceRecords.push(responseEvidence);
    steps.push(
      buildWorkflowStep({
        step_kind: 'response',
        status: 'blocked',
        evidence_reference: responseEvidence.evidence_id,
        details: { reason: response.message }
      })
    );
    return runtime.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: WORKFLOW_KIND,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: null,
      status: 'blocked',
      response,
      capability_result: null,
      evidenceRecords,
      steps,
      created_at,
      updated_at: runtime.now().toISOString()
    });
  }

  const identityContext = runtime.resolveIdentityContext(coreRequest, organizationContext);
  if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
    const response = createRuntimeResponse({
      kind: WORKFLOW_KIND,
      status: 'blocked',
      message: identityContext.failure_reason ?? 'identity could not be resolved',
      data: null,
      runtimeDriven: false
    });
    const responseEvidence = runtime.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'workflow_response_created',
      subject: capabilityId,
      data: { status: 'blocked', reason: response.message, response }
    });
    evidenceRecords.push(responseEvidence);
    steps.push(
      buildWorkflowStep({
        step_kind: 'response',
        status: 'blocked',
        evidence_reference: responseEvidence.evidence_id,
        details: { reason: response.message }
      })
    );
    return runtime.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: WORKFLOW_KIND,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: null,
      status: 'blocked',
      response,
      capability_result: null,
      evidenceRecords,
      steps,
      created_at,
      updated_at: runtime.now().toISOString()
    });
  }

  const capability_result = runtime.capabilityRuntime.invokeCapability({
    capability_id: capabilityId,
    organization_id: organizationContext.organization_id,
    principal_id: identityContext.principal_id,
    correlation_id,
    input: {
      purpose: `Execute ${capabilityId}`,
      requested_scope: ['read:knowledge'],
      payload: {
        organization_id: organizationContext.organization_id,
        correlation_id,
        ...params
      }
    },
    requested_at,
    claimed_result: input.claimed_result ?? null,
    claimed_output: input.claimed_output ?? null,
    caller_result: input.caller_result ?? null,
    assistant_result: input.assistant_result ?? null,
    model_claimed_result: input.model_claimed_result ?? null
  });

  steps.push(
    buildWorkflowStep({
      step_kind: 'capability',
      status: buildStatus(capability_result.status),
      evidence_reference: capability_result.evidence_reference,
      details: {
        capability_id: capability_result.capability_id,
        status: capability_result.status
      }
    })
  );

  const responseData = capability_result.status === 'executed' && capability_result.output ? (capability_result.output.result as Record<string, unknown>) : null;
  const response = createRuntimeResponse({
    kind: WORKFLOW_KIND,
    status: buildStatus(capability_result.status),
    message: capability_result.reason ?? capability_result.error ?? 'Numa HR read completed',
    data: responseData,
    runtimeDriven: true
  });
  const responseEvidence = runtime.appendWorkflowEvidence({
    organization_id: organizationContext.organization_id,
    correlation_id,
    record_type: 'workflow_response_created',
    subject: capabilityId,
    data: {
      status: response.status,
      reason: response.message,
      response
    }
  });
  evidenceRecords.push(responseEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'response',
      status: response.status,
      evidence_reference: responseEvidence.evidence_id,
      details: {
        status: response.status,
        capability_id: capabilityId
      }
    })
  );

  return runtime.finishWorkflow({
    workflow_id: input.workflow_id,
    workflow_kind: WORKFLOW_KIND,
    organization_id: organizationContext.organization_id,
    correlation_id,
    turn_id: null,
    status: response.status,
    response,
    capability_result,
    evidenceRecords,
    steps,
    created_at,
    updated_at: runtime.now().toISOString()
  });
}
