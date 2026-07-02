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



import { createWorkflowCoreRequest, createRuntimeResponse, buildWorkflowStep, createDeniedCapabilityResult, normalizeResourceType } from './workflow-internals';
import { type WorkflowRuntimeContext } from './workflow-runtime-context';


function createMockEstimatePayload(input: MockReadEstimateWorkflowInput): Record<string, unknown> {
  return {
    resource_type: input.resource_type ?? 'estimate',
    estimate_id: input.estimate_id ?? null,
    customer_id: input.customer_id ?? null,
    payment_status: input.payment_status ?? null,
    year: input.year ?? null
  };
}

function buildInvoiceListResponseData(
  resourceResult: ResourceResult,
  payment_status: string | null,
  year: string | null
): Record<string, unknown> | null {
  if (resourceResult.status !== 'found') {
    return null;
  }
  const data = resourceResult.data as Record<string, unknown> | null;
  const records = Array.isArray(data?.records)
    ? data.records.filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
    : [];
  if (records.length === 0) {
    return null;
  }
  return {
    ...structuredClone(data ?? {}),
    kind: 'list',
    result_mode: 'list',
    resource_type: 'invoice',
    payment_status: typeof payment_status === 'string' && payment_status.length > 0 ? payment_status : data?.payment_status ?? null,
    lookup_mode: typeof data?.lookup_mode === 'string' ? data.lookup_mode : year ? 'by_year' : 'by_status',
    year: typeof year === 'string' && year.length > 0 ? year : typeof data?.year === 'string' ? data.year : null,
    records,
    aggregate: {
      count: records.length,
      paymentsPendingTotal: records.reduce((sum, record) => {
        const candidate = record.paymentsPending;
        return sum + (typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0);
      }, 0)
    }
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
  payment_status?: 'pending' | 'paid' | 'overdue' | null;
  year?: string | null;
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
    resource_id: input.payment_status ? null : input.estimate_id ?? null,
    payment_status: input.payment_status ?? null,
    year: input.year ?? null,
    filters:
      input.customer_id || input.payment_status || input.year
        ? {
            ...(input.customer_id ? { customer_id: input.customer_id } : {}),
            ...(input.payment_status ? { payment_status: input.payment_status } : {}),
            ...(input.year ? { year: input.year } : {})
          }
        : null,
    requested_fields:
      input.resource_type === 'invoice' && input.payment_status
        ? ['invoice_id', 'customer_name', 'contactName', 'status', 'paymentsPending', 'dueDate', 'total', 'currency', 'source']
        : input.resource_type === 'invoice'
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



  export function executeMockEstimateReadWorkflow(runtime: WorkflowRuntimeContext, input: MockReadEstimateWorkflowInput): GovernedWorkflowResult {

    const correlation_id = normalizeCorrelationId({

      request_id: input.workflow_id,

      correlation_id: input.correlation_id ?? null

    });

    const requested_at = input.requested_at?.trim() || runtime.now().toISOString();

    const capabilityId = input.capability_id ?? 'mock.resource.read';

    const resource_type = normalizeResourceType(input.resource_type);

    const estimate_id = input.estimate_id?.trim() || null;

    const customer_id = input.customer_id?.trim() || null;
    const year = input.year?.trim() || null;

    const coreRequest = createWorkflowCoreRequest({

      workflow_id: input.workflow_id,

      correlation_id,

      organization_hint: input.organization_hint,

      principal_hint: input.principal_hint,

      action: 'workflow.mock.estimate.read',

      purpose:

        resource_type === 'invoice'

          ? input.payment_status

            ? customer_id

              ? `Read ${input.payment_status} invoices for ${customer_id}`

              : `Read ${input.payment_status} invoices`

            : year

              ? customer_id

                ? `Read invoices for ${customer_id} in ${year}`

                : `Read invoices for ${year}`

            : customer_id

              ? `Read latest invoice for ${customer_id}`

              : `Read invoice ${estimate_id ?? 'unknown'}`

          : customer_id

            ? `Read latest estimate for ${customer_id}`

            : `Read estimate ${estimate_id ?? 'unknown'}`,

      payload: {

        resource: input.payment_status
          ? customer_id
            ? `${resource_type}/customer/${customer_id}/status/${input.payment_status}`
            : `${resource_type}/status/${input.payment_status}`
          : year
            ? customer_id
              ? `${resource_type}/customer/${customer_id}/year/${year}`
              : `${resource_type}/year/${year}`
          : customer_id
            ? `${resource_type}/customer/${customer_id}`
            : `${resource_type}/${estimate_id ?? 'unknown'}`,

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

        year,

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

      details: { resource_type, estimate_id, customer_id, year }

    }));



    const organizationContext = runtime.resolveOrganizationContext(coreRequest);

    if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {

      const deniedEvidence = runtime.appendWorkflowEvidence({

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

      return runtime.finishWorkflow({

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

        updated_at: runtime.now().toISOString()

      });

    }



    const identityContext = runtime.resolveIdentityContext(coreRequest, organizationContext);

    const governedResourceQuery = createMockResourceQuery({

      workflow_id: input.workflow_id,

      correlation_id,

      organization_id: organizationContext.organization_id ?? 'unknown',

      principal_id: identityContext.principal_id ?? 'unknown',

      principal_type: identityContext.principal_type,

      delegated_identity: identityContext.delegated_identity,

      resource_type,

      payment_status: input.payment_status ?? null,

      year: input.year ?? null,

      estimate_id,

      customer_id,

      claimed_result: input.claimed_result ?? null,

      caller_result: input.caller_result ?? null,

      assistant_result: input.assistant_result ?? null,

      model_claimed_result: input.model_claimed_result ?? null

    });

    if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {

      const deniedEvidence = runtime.appendWorkflowEvidence({

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

      return runtime.finishWorkflow({

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

      const blockedStatus: WorkflowExecutionStatus = policyDecision.defer ? 'blocked' : 'denied';

      const response = createRuntimeResponse({

        kind: workflowKind,

        status: blockedStatus,

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

          status: blockedStatus,

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

        requires_binding: false

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

      reason: resource_type === 'invoice' ? 'mock invoice workflow evaluating' : 'mock estimate workflow evaluating',

      now: runtime.now

    });

    runtime.turnRuntime.transitionTurn({

      turn_id: turn.turn_id,

      to_state: 'executing',

      reason: resource_type === 'invoice' ? 'mock invoice workflow executing' : 'mock estimate workflow executing',

      now: runtime.now

    });



    const capabilityInvocation: CapabilityInvocationRequest = {

      capability_id: capabilityId,

      organization_id: organizationContext.organization_id,

      principal_id: identityContext.principal_id,

      correlation_id,

      input: {

        purpose:

          resource_type === 'invoice'

            ? input.payment_status

              ? customer_id

                ? `Read ${input.payment_status} invoices for ${customer_id}`

                : `Read ${input.payment_status} invoices`

              : customer_id

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

    const capabilityInvocationEvidence = runtime.appendWorkflowEvidence({

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

      runtime.appendWorkflowEvidence({

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



    const capability_result = runtime.capabilityRuntime.invokeCapability(capabilityInvocation);

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

          runtime.appendWorkflowEvidence({

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

          runtime.appendWorkflowEvidence({

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

      runtime.turnRuntime.transitionTurn({

        turn_id: turn.turn_id,

        to_state: 'completed',

        reason: resource_type === 'invoice' ? 'mock invoice workflow completed' : 'mock estimate workflow completed',

        now: runtime.now

      });

    } else if (capability_result.status === 'unavailable' || capability_result.status === 'error') {

      runtime.turnRuntime.markEffectUnknownOutcome({

        turn_id: turn.turn_id,

        effect_id: runtime.turnRuntime.addPendingEffect({

          turn_id: turn.turn_id,

          binding_id: null,

          evidence_reference: capability_result.evidence_reference,

          now: runtime.now

        }).effect!.effect_id,

        reason: capability_result.reason,

        evidence_reference: capability_result.evidence_reference,

        now: runtime.now

      });

      runtime.turnRuntime.requestReconciliation({

        turn_id: turn.turn_id,

        reason: capability_result.reason,

        evidence_reference: capability_result.evidence_reference,

        now: runtime.now

      });

    } else {

      runtime.turnRuntime.transitionTurn({

        turn_id: turn.turn_id,

        to_state: capability_result.status === 'not_found' ? 'completed' : 'failed',

        reason: capability_result.reason,

        now: runtime.now

      });

    }



    const responseData =

      capability_result.status === 'executed'

        ? resourceResult?.status === 'found'

          ? governedResourceQuery.payment_status && resource_type === 'invoice'

            ? buildInvoiceListResponseData(resourceResult, governedResourceQuery.payment_status, governedResourceQuery.year ?? null)

            : resource_type === 'invoice' && governedResourceQuery.year

              ? buildInvoiceListResponseData(resourceResult, null, governedResourceQuery.year)

              : resourceResult.data

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

            ? governedResourceQuery.payment_status

              ? 'invoice list retrieved from runtime'

              : 'invoice retrieved from runtime'

            : 'estimate retrieved from runtime'

          : capability_result.status === 'not_found'

            ? resource_type === 'invoice'

              ? governedResourceQuery.payment_status

                ? 'invoice list not found'

                : 'invoice not found'

              : 'estimate not found'

            : capability_result.status === 'unavailable'

              ? resource_type === 'invoice'

                ? governedResourceQuery.payment_status

                  ? 'invoice list runtime unavailable'

                  : 'invoice runtime unavailable'

                : 'estimate runtime unavailable'

              : capability_result.status === 'error'

                ? resource_type === 'invoice'

                  ? governedResourceQuery.payment_status

                    ? 'invoice list runtime error'

                    : 'invoice runtime error'

                  : 'estimate runtime error'

                : resource_type === 'invoice'

                  ? governedResourceQuery.payment_status

                    ? 'invoice list denied'

                    : 'invoice denied'

                  : 'estimate denied',

      data: responseData,

      runtimeDriven: true

    });

    const externalReadResultBoundEvidence = runtime.appendWorkflowEvidence({

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

        runtime.appendWorkflowEvidence({

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

        runtime.appendWorkflowEvidence({

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

        runtime.appendWorkflowEvidence({

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

        runtime.appendWorkflowEvidence({

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

    const responseEvidence = runtime.appendWorkflowEvidence({

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

    return runtime.finishWorkflow({

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
