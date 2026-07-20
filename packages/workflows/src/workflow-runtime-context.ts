import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryCapabilityRuntime } from '../../capabilities/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { type ExternalReadAdapter, type PacoPrintCatalogAdapterPort, type CapabilityInvocationResult, type GovernedWorkflowKind, type GovernedWorkflowResponse, type GovernedWorkflowResult, type WorkflowExecutionStatus, type WorkflowStep, type NumaHrReadPort } from '../../contracts/src/index';
import { type InMemoryTurnRuntime } from '../../turns/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';

export interface AppendWorkflowEvidenceInput {
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
    | 'external_read_result_bound'
    | 'failed_closed';
  subject: string;
  data: Record<string, unknown>;
}

export interface FinishWorkflowInput {
  workflow_id: string;
  workflow_kind: GovernedWorkflowKind | null;
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
}

export interface WorkflowRuntimeContext {
  evidenceLedger: InMemoryEvidenceLedger;
  bindingStore: InMemoryDecisionBindingStore;
  capabilityRuntime: InMemoryCapabilityRuntime;
  turnRuntime: InMemoryTurnRuntime;
  externalReadAdapter: ExternalReadAdapter;
  pacoPrintCatalogAdapter: PacoPrintCatalogAdapterPort | null;
  hrReadPort: NumaHrReadPort | null;
  /** Organizacion fijada por el bootstrap; nunca procede del payload de la request. */
  installationOrganizationId: string | null;
  resolveOrganizationContext: typeof resolveOrganizationContext;
  resolveIdentityContext: typeof resolveIdentityContext;
  now: () => Date;
  appendWorkflowEvidence(input: AppendWorkflowEvidenceInput): ReturnType<InMemoryEvidenceLedger['append']>;
  finishWorkflow(input: FinishWorkflowInput): GovernedWorkflowResult;
}
