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
  type PresenceReadPort,
  type ResourceQuery,
  type ResourceResult,
  type WorkflowEvidenceTrace,
  type WorkflowExecutionStatus,
  type WorkflowStep
} from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryCapabilityRuntime, createMockResourceReadCapability, createPresenceCapabilitySet } from '../../capabilities/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import { evaluatePolicy } from '../../policy/src/index';
import { InMemoryTurnRuntime } from '../../turns/src/index';
import { createMockExternalReadAdapter } from '../../external-read-adapters/src/index';
import { buildWorkflowResult, workflowEvidenceTrace } from './workflow-internals';
import { executeMockEstimateReadWorkflow } from './estimate-workflow';
import { executeMockEmailSendWorkflow } from './email-workflow';
import { createMockEstimateReadCapability, createMockEmailPreviewCapability, createMockEmailSendCapability } from './mock-capabilities';
import { type AppendWorkflowEvidenceInput, type FinishWorkflowInput, type WorkflowRuntimeContext } from './workflow-runtime-context';

export interface GovernedWorkflowRuntimeOptions {
  evidenceLedger?: InMemoryEvidenceLedger;
  bindingStore?: InMemoryDecisionBindingStore;
  capabilityRuntime?: InMemoryCapabilityRuntime;
  turnRuntime?: InMemoryTurnRuntime;
  externalReadAdapter?: ExternalReadAdapter;
  presenceReadPort?: PresenceReadPort;
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
  private readonly presenceReadPort: PresenceReadPort | null;
  private readonly resolveOrganizationContext: typeof resolveOrganizationContext;
  private readonly resolveIdentityContext: typeof resolveIdentityContext;
  private readonly now: () => Date;
  private readonly workflowRecords = new Map<string, GovernedWorkflowResult>();

  constructor(options: GovernedWorkflowRuntimeOptions = {}) {
    this.evidenceLedger = options.evidenceLedger ?? new InMemoryEvidenceLedger();
    this.bindingStore = options.bindingStore ?? new InMemoryDecisionBindingStore();
    this.externalReadAdapter = options.externalReadAdapter ?? createMockExternalReadAdapter({ now: options.now });
    this.presenceReadPort = options.presenceReadPort ?? null;
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
      if (this.presenceReadPort) {
        for (const capability of createPresenceCapabilitySet(this.presenceReadPort)) {
          this.registerCapability(capability);
        }
      }
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
    const runtimeContext: WorkflowRuntimeContext = this.createWorkflowRuntimeContext();
    return input.kind === 'mock.estimate.read'
      ? executeMockEstimateReadWorkflow(runtimeContext, input)
      : executeMockEmailSendWorkflow(runtimeContext, input);
  }

  private createWorkflowRuntimeContext(): WorkflowRuntimeContext {
    return {
      evidenceLedger: this.evidenceLedger,
      bindingStore: this.bindingStore,
      capabilityRuntime: this.capabilityRuntime,
      turnRuntime: this.turnRuntime,
      externalReadAdapter: this.externalReadAdapter,
      resolveOrganizationContext: this.resolveOrganizationContext,
      resolveIdentityContext: this.resolveIdentityContext,
      now: this.now,
      appendWorkflowEvidence: this.appendWorkflowEvidence.bind(this),
      finishWorkflow: this.finishWorkflow.bind(this)
    };
  }

  private appendWorkflowEvidence(input: AppendWorkflowEvidenceInput) {
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

  private finishWorkflow(input: FinishWorkflowInput) {
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
