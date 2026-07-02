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

import { createWorkflowCoreRequest, createRuntimeResponse, buildWorkflowStep, createWorkflowEvidence } from './workflow-internals';
import { type WorkflowRuntimeContext } from './workflow-runtime-context';

function createMockEmailPayload(input: MockEmailSendWorkflowInput): Record<string, unknown> {
  return {
    to: input.to,
    subject: input.subject,
    body: input.body,
    preview_note: input.preview_note ?? null
  };
}

  export function executeMockEmailSendWorkflow(runtime: WorkflowRuntimeContext, input: MockEmailSendWorkflowInput): GovernedWorkflowResult {
    const correlation_id = normalizeCorrelationId({
      request_id: input.workflow_id,
      correlation_id: input.correlation_id ?? null
    });
    const requested_at = input.requested_at?.trim() || runtime.now().toISOString();
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
    runtime.evidenceLedger.append(intentEvidence);
    evidenceRecords.push(intentEvidence);
    steps.push(buildWorkflowStep({
      step_kind: 'intent',
      status: 'completed',
      evidence_reference: intentEvidence.evidence_id,
      details: { to: input.to, subject: input.subject }
    }));

    const organizationContext = runtime.resolveOrganizationContext(coreRequest);
    if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: 'organization could not be resolved',
        data: null,
        runtimeDriven: false
      });
      return runtime.finishWorkflow({
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
        updated_at: runtime.now().toISOString()
      });
    }

    const identityContext = runtime.resolveIdentityContext(coreRequest, organizationContext);
    if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: 'principal could not be resolved',
        data: null,
        runtimeDriven: false
      });
      return runtime.finishWorkflow({
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
        updated_at: runtime.now().toISOString()
      });
    }

    const policyDecision = evaluatePolicy({ request: coreRequest, organizationContext, identityContext });
    const policyEvidence = runtime.appendWorkflowEvidence({
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
      const workflowResponseEvidence = runtime.appendWorkflowEvidence({
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
      return runtime.finishWorkflow({
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

    const turn = runtime.turnRuntime.createTurn({
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
      now: runtime.now
    });
    steps.push(buildWorkflowStep({
      step_kind: 'turn',
      status: 'completed',
      evidence_reference: turn.evidence_links[0] ?? null,
      details: { turn_id: turn.turn_id, state: turn.state }
    }));

    runtime.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'evaluating',
      reason: 'mock email workflow evaluating',
      now: runtime.now
    });
    runtime.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'waiting_for_approval',
      reason: 'preview ready for approval',
      now: runtime.now
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
    const previewResult = runtime.capabilityRuntime.invokeCapability(previewInvocation);
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
      runtime.now,
      runtime.evidenceLedger
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

    const approvalRequestedEvidence = runtime.appendWorkflowEvidence({
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
      const blockedEvidence = runtime.appendWorkflowEvidence({
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
      const deniedEvidence = runtime.appendWorkflowEvidence({
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
      const responseEvidence = runtime.appendWorkflowEvidence({
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
      return runtime.finishWorkflow({
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
    const binding = runtime.bindingStore.createBinding({
      request: bindingRequest,
      organizationContext,
      identityContext,
      policyDecision,
      evidence_reference: approvalRequestedEvidence.evidence_id,
      capabilityInvocation: sendInvocation,
      now: runtime.now
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
      runtime.now,
      runtime.evidenceLedger
    );
    evidenceRecords.push(bindingCreatedEvidence);
    const validatedBinding = runtime.bindingStore.validateBinding({
      binding,
      request: bindingRequest,
      organizationContext,
      identityContext,
      capabilityInvocation: sendInvocation,
      now: runtime.now
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
      runtime.now,
      runtime.evidenceLedger
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
      const deniedEvidence = runtime.appendWorkflowEvidence({
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
      runtime.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'failed',
        reason: validatedBinding.reason ?? 'binding invalid',
        now: runtime.now
      });
      const response = createRuntimeResponse({
        kind: workflowKind,
        status: 'denied',
        message: validatedBinding.reason ?? 'binding invalid',
        data: null,
        runtimeDriven: false
      });
      const responseEvidence = runtime.appendWorkflowEvidence({
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
      return runtime.finishWorkflow({
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

    runtime.turnRuntime.transitionTurn({
      turn_id: turn.turn_id,
      to_state: 'executing',
      reason: 'mock email workflow executing',
      now: runtime.now
    });
    const capabilityResult = runtime.capabilityRuntime.invokeCapability({
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
      runtime.bindingStore.consumeBinding(validatedBinding.binding.binding_id);
      runtime.turnRuntime.addPendingEffect({
        turn_id: turn.turn_id,
        binding_id: validatedBinding.binding.binding_id,
        evidence_reference: capabilityResult.evidence_reference,
        now: runtime.now
      });
      const effect = runtime.turnRuntime.getTurn(turn.turn_id)?.pending_effects.at(-1);
      if (effect?.effect_id) {
        runtime.turnRuntime.markEffectSucceeded({
          turn_id: turn.turn_id,
          effect_id: effect.effect_id,
          evidence_reference: capabilityResult.evidence_reference,
          now: runtime.now
        });
      }
      runtime.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'completed',
        reason: 'mock email send completed',
        now: runtime.now
      });
    } else if (capabilityResult.status === 'unavailable' || capabilityResult.status === 'error') {
      runtime.turnRuntime.addPendingEffect({
        turn_id: turn.turn_id,
        binding_id: validatedBinding.binding.binding_id,
        evidence_reference: capabilityResult.evidence_reference,
        now: runtime.now
      });
      const effect = runtime.turnRuntime.getTurn(turn.turn_id)?.pending_effects.at(-1);
      if (effect?.effect_id) {
        runtime.turnRuntime.markEffectUnknownOutcome({
          turn_id: turn.turn_id,
          effect_id: effect.effect_id,
          reason: capabilityResult.reason,
          evidence_reference: capabilityResult.evidence_reference,
          now: runtime.now
        });
      }
      runtime.turnRuntime.requestReconciliation({
        turn_id: turn.turn_id,
        reason: capabilityResult.reason,
        evidence_reference: capabilityResult.evidence_reference,
        now: runtime.now
      });
    } else {
      runtime.turnRuntime.transitionTurn({
        turn_id: turn.turn_id,
        to_state: 'failed',
        reason: capabilityResult.reason,
        now: runtime.now
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
    const responseEvidence = runtime.appendWorkflowEvidence({
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
    return runtime.finishWorkflow({
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
