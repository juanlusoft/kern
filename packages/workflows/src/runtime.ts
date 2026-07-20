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
  type PresenceReadPort,
  type NumaHrReadPort,
  type PrincipalType,
  type ResourceQuery,
  type ResourceResult,
  type WorkflowEvidenceTrace,
  type WorkflowExecutionStatus,
  type WorkflowStep
} from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import {
  InMemoryCapabilityRuntime,
  createMockResourceReadCapability,
  createPresenceCapabilitySet,
  createNumaHrCapabilitySet
} from '../../capabilities/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import { evaluatePolicy } from '../../policy/src/index';
import { InMemoryTurnRuntime } from '../../turns/src/index';
import { createMockExternalReadAdapter } from '../../external-read-adapters/src/index';
import { type PacoPrintCatalogAdapterPort } from '../../contracts/src/index';
import { buildWorkflowResult, workflowEvidenceTrace } from './workflow-internals';
import { executeMockEstimateReadWorkflow } from './estimate-workflow';
import { executeNumaHrReadWorkflow } from './hr-workflow';
import { executeMockEmailSendWorkflow } from './email-workflow';
import { executePricingQuoteLineWorkflow } from './pricing-workflow';
import { executePricingQuoteDraftWorkflow } from './pricing-draft-workflow';
import { executeUnsupportedWorkflow, type UnsupportedWorkflowInput } from './unsupported-workflow';
import { createMockEstimateReadCapability, createMockEmailPreviewCapability, createMockEmailSendCapability } from './mock-capabilities';
import { type AppendWorkflowEvidenceInput, type FinishWorkflowInput, type WorkflowRuntimeContext } from './workflow-runtime-context';

export interface GovernedWorkflowRuntimeOptions {
  evidenceLedger?: InMemoryEvidenceLedger;
  bindingStore?: InMemoryDecisionBindingStore;
  capabilityRuntime?: InMemoryCapabilityRuntime;
  turnRuntime?: InMemoryTurnRuntime;
  externalReadAdapter?: ExternalReadAdapter;
  pacoPrintCatalogAdapter?: PacoPrintCatalogAdapterPort | null;
  presenceReadPort?: PresenceReadPort | null;
  hrReadPort?: NumaHrReadPort | null;
  organization_id?: string | null;
  resolveOrganizationContext?: typeof resolveOrganizationContext;
  resolveIdentityContext?: typeof resolveIdentityContext;
  now?: () => Date;
}

function normalizeOptionalOrganizationId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export class InMemoryGovernedWorkflowRuntime {
  private readonly evidenceLedger: InMemoryEvidenceLedger;
  private readonly bindingStore: InMemoryDecisionBindingStore;
  private readonly capabilityRuntime: InMemoryCapabilityRuntime;
  private readonly turnRuntime: InMemoryTurnRuntime;
  private readonly externalReadAdapter: ExternalReadAdapter;
  private readonly resolveOrganizationContext: typeof resolveOrganizationContext;
  private readonly pacoPrintCatalogAdapter: PacoPrintCatalogAdapterPort | null;
  private readonly resolveIdentityContext: typeof resolveIdentityContext;
  private readonly hrReadPort: NumaHrReadPort | null;
  private readonly installationOrganizationId: string | null;
  private readonly now: () => Date;
  private readonly workflowRecords = new Map<string, GovernedWorkflowResult>();

  constructor(options: GovernedWorkflowRuntimeOptions = {}) {
    this.evidenceLedger = options.evidenceLedger ?? new InMemoryEvidenceLedger();
    this.bindingStore = options.bindingStore ?? new InMemoryDecisionBindingStore();
    this.externalReadAdapter = options.externalReadAdapter ?? createMockExternalReadAdapter({ now: options.now });
    this.resolveOrganizationContext = options.resolveOrganizationContext ?? resolveOrganizationContext;
    this.pacoPrintCatalogAdapter = options.pacoPrintCatalogAdapter ?? null;
    this.resolveIdentityContext = options.resolveIdentityContext ?? resolveIdentityContext;
    this.installationOrganizationId = normalizeOptionalOrganizationId(options.organization_id);
    this.capabilityRuntime =
      options.capabilityRuntime ?? new InMemoryCapabilityRuntime({ evidenceLedger: this.evidenceLedger, bindingStore: this.bindingStore, now: options.now });
    this.turnRuntime = options.turnRuntime ?? new InMemoryTurnRuntime({ evidenceLedger: this.evidenceLedger, now: options.now });
    this.now = options.now ?? (() => new Date());
    this.hrReadPort = options.hrReadPort ?? null;

    if (!options.capabilityRuntime) {
      const capabilityOrganizationId = this.installationOrganizationId;
      if (capabilityOrganizationId) {
        this.registerCapability(createMockResourceReadCapability(this.externalReadAdapter, {}, capabilityOrganizationId));
        this.registerCapability(createMockEstimateReadCapability(capabilityOrganizationId));
        this.registerCapability(createMockEmailPreviewCapability(capabilityOrganizationId));
        this.registerCapability(createMockEmailSendCapability(capabilityOrganizationId));
      }
      if (options.presenceReadPort) {
        if (!capabilityOrganizationId) {
          throw new Error('presenceReadPort requires explicit organization_id');
        }
        for (const capability of createPresenceCapabilitySet(options.presenceReadPort, capabilityOrganizationId)) {
          this.registerCapability(capability);
        }
      }
      if (options.hrReadPort) {
        if (!capabilityOrganizationId) {
          throw new Error('hrReadPort requires explicit organization_id');
        }
        for (const capability of createNumaHrCapabilitySet(options.hrReadPort, capabilityOrganizationId)) {
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

  /**
   * Despacho fail-closed: cada `kind` soportado se declara explícitamente y
   * cualquier otro valor termina en `executeUnsupportedWorkflow`.
   *
   * No debe existir una rama por defecto que ejecute el workflow de una empresa
   * concreta: eso convertiría una petición no reconocida de un cliente en
   * lógica de otro (ADR-0002 §2.5, ADR-0006 §3.6).
   */
  executeWorkflow(input: GovernedWorkflowRequest): GovernedWorkflowResult {
    const runtimeContext: WorkflowRuntimeContext = this.createWorkflowRuntimeContext();
    switch (input.kind) {
      case 'mock.estimate.read':
        return executeMockEstimateReadWorkflow(runtimeContext, input);
      case 'mock.email.send':
        return executeMockEmailSendWorkflow(runtimeContext, input);
      case 'numa.hr.read':
        return executeNumaHrReadWorkflow(runtimeContext, input);
      case 'pricing.quote_draft':
        return executePricingQuoteDraftWorkflow(runtimeContext, input);
      case 'pricing.quote_line':
        return executePricingQuoteLineWorkflow(runtimeContext, input);
      default:
        return executeUnsupportedWorkflow(runtimeContext, input as UnsupportedWorkflowInput);
    }
  }

  private createWorkflowRuntimeContext(): WorkflowRuntimeContext {
    return {
      evidenceLedger: this.evidenceLedger,
      bindingStore: this.bindingStore,
      capabilityRuntime: this.capabilityRuntime,
      turnRuntime: this.turnRuntime,
      externalReadAdapter: this.externalReadAdapter,
      pacoPrintCatalogAdapter: this.pacoPrintCatalogAdapter,
      hrReadPort: this.hrReadPort,
      installationOrganizationId: this.installationOrganizationId,
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
