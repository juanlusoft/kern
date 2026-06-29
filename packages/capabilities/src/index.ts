import {
  createDeterministicId,
  createEvidenceRecord,
  fingerprintCapabilityInput,
  fingerprintCapabilityInvocation,
  type CapabilityDefinition,
  type CapabilityInvocationRequest,
  type CapabilityInvocationResult,
  type CapabilityMockResult,
  type CapabilityRegistry,
  type CapabilityRuntimeDecision,
  type CapabilityInput,
  type CapabilityOutput,
  type DecisionBinding,
  type EvidenceRecord
} from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';

export interface CapabilityRuntimeOptions {
  evidenceLedger?: InMemoryEvidenceLedger;
  bindingStore?: InMemoryDecisionBindingStore;
  now?: () => Date;
}

type InvocationEvidenceType =
  | 'capability_invocation_requested'
  | 'capability_invocation_denied'
  | 'capability_invocation_started'
  | 'capability_invocation_completed'
  | 'capability_invocation_unavailable'
  | 'capability_invocation_error'
  | 'capability_invocation_not_found'
  | 'capability_result_bound';

interface CapabilityInvocationRecord {
  invocation: CapabilityInvocationRequest;
  result: CapabilityInvocationResult;
  evidence_reference: string | null;
}

function cloneCapabilityDefinition(definition: CapabilityDefinition): CapabilityDefinition {
  return {
    ...definition,
    approval_requirement: definition.approval_requirement
      ? {
          ...definition.approval_requirement
        }
      : null,
    mock: definition.mock ?? null
  };
}

function cloneCapabilityInput(input: CapabilityInput): CapabilityInput {
  return {
    purpose: input.purpose,
    requested_scope: [...input.requested_scope],
    payload: structuredClone(input.payload)
  };
}

function cloneCapabilityInvocationRequest(request: CapabilityInvocationRequest): CapabilityInvocationRequest {
  return {
    ...request,
    approval_requirement: request.approval_requirement
      ? {
          ...request.approval_requirement
        }
      : null,
    input: cloneCapabilityInput(request.input)
  };
}

function cloneCapabilityOutput(output: CapabilityOutput | null): CapabilityOutput | null {
  if (!output) {
    return null;
  }
  return {
    ...output,
    result: structuredClone(output.result)
  };
}

function cloneCapabilityInvocationResult(result: CapabilityInvocationResult): CapabilityInvocationResult {
  return {
    ...result,
    output: cloneCapabilityOutput(result.output),
    evidence_links: [...result.evidence_links]
  };
}

function normalizeRequestedAt(requested_at: string | null | undefined, now: () => Date): string {
  const candidate = requested_at?.trim();
  return candidate && candidate.length > 0 ? candidate : now().toISOString();
}

function normalizeInvocation(input: CapabilityInvocationRequest, correlation_id: string, requested_at: string): CapabilityInvocationRequest {
  return {
    capability_id: input.capability_id,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    correlation_id,
    input: cloneCapabilityInput(input.input),
    binding_id: input.binding_id ?? null,
    decision_binding_id: input.decision_binding_id ?? input.binding_id ?? null,
    policy_decision_id: input.policy_decision_id ?? null,
    approval_requirement: input.approval_requirement
      ? {
          ...input.approval_requirement
        }
      : null,
    evidence_reference: input.evidence_reference ?? null,
    requested_at
  };
}

function createInvocationEvidence(
  input: {
    organization_id: string;
    correlation_id: string;
    record_type: InvocationEvidenceType;
    subject: string;
    data: Record<string, unknown>;
  },
  now: () => Date,
  evidenceLedger?: InMemoryEvidenceLedger
): EvidenceRecord {
  const record = createEvidenceRecord({
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    record_type: input.record_type,
    subject: input.subject,
    data: input.data,
    created_at: now().toISOString()
  });
  return evidenceLedger ? evidenceLedger.append(record) : record;
}

function buildInvocationResult(input: {
  invocation_id: string;
  capability_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  status: CapabilityInvocationResult['status'];
  binding_id: string | null;
  policy_decision_id: string | null;
  executed_by_runtime: boolean;
  evidence_reference: string | null;
  evidence_links: string[];
  created_at: string;
  reason: string;
  error: string | null;
  output: CapabilityOutput | null;
}): CapabilityInvocationResult {
  const runtimeDecision: CapabilityRuntimeDecision =
    input.status === 'executed'
      ? 'executed'
      : input.status === 'denied'
        ? 'denied'
        : input.status === 'unavailable'
          ? 'unavailable'
          : input.status === 'not_found'
            ? 'not_found'
            : 'error';
  return {
    invocation_id: input.invocation_id,
    capability_id: input.capability_id,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    correlation_id: input.correlation_id,
    status: input.status,
    runtime_decision: runtimeDecision,
    binding_id: input.binding_id,
    decision_binding_id: input.binding_id,
    policy_decision_id: input.policy_decision_id,
    executed_by_runtime: input.executed_by_runtime,
    output: cloneCapabilityOutput(input.output),
    error: input.error,
    evidence_links: [...input.evidence_links],
    created_at: input.created_at,
    evidence_reference: input.evidence_reference,
    reason: input.reason
  };
}

function bindingStateIsUsable(binding_state: string): boolean {
  return binding_state === 'created' || binding_state === 'validated';
}

export class InMemoryCapabilityRegistry implements CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityDefinition>();

  register(capability: CapabilityDefinition): CapabilityDefinition {
    const stored = cloneCapabilityDefinition(capability);
    this.capabilities.set(stored.capability_id, stored);
    return this.get(stored.capability_id) as CapabilityDefinition;
  }

  get(capability_id: string): CapabilityDefinition | undefined {
    const capability = this.capabilities.get(capability_id);
    return capability ? cloneCapabilityDefinition(capability) : undefined;
  }

  list(): CapabilityDefinition[] {
    return [...this.capabilities.values()].map((capability) => cloneCapabilityDefinition(capability));
  }

  has(capability_id: string): boolean {
    return this.capabilities.has(capability_id);
  }
}

export class InMemoryCapabilityRuntime {
  private readonly registry = new InMemoryCapabilityRegistry();
  private readonly evidenceLedger?: InMemoryEvidenceLedger;
  private readonly bindingStore?: InMemoryDecisionBindingStore;
  private readonly now: () => Date;
  private readonly invocations = new Map<string, CapabilityInvocationRecord>();

  constructor(options: CapabilityRuntimeOptions = {}) {
    this.evidenceLedger = options.evidenceLedger;
    this.bindingStore = options.bindingStore;
    this.now = options.now ?? (() => new Date());
  }

  registerCapability(capability: CapabilityDefinition): CapabilityDefinition {
    return this.registry.register(capability);
  }

  getCapability(capability_id: string): CapabilityDefinition | undefined {
    return this.registry.get(capability_id);
  }

  listCapabilities(): CapabilityDefinition[] {
    return this.registry.list();
  }

  getInvocation(invocation_id: string): CapabilityInvocationResult | undefined {
    const record = this.invocations.get(invocation_id);
    return record ? cloneCapabilityInvocationResult(record.result) : undefined;
  }

  listInvocations(): CapabilityInvocationResult[] {
    return [...this.invocations.values()].map((record) => cloneCapabilityInvocationResult(record.result));
  }

  invokeCapability(input: CapabilityInvocationRequest): CapabilityInvocationResult {
    const correlation_id = input.correlation_id.trim();
    const requested_at = normalizeRequestedAt(input.requested_at, this.now);
    const normalizedRequest = normalizeInvocation(input, correlation_id, requested_at);
    const invocation_id = createDeterministicId('capability-invocation', {
      capability_id: normalizedRequest.capability_id,
      organization_id: normalizedRequest.organization_id,
      principal_id: normalizedRequest.principal_id,
      correlation_id,
      requested_at,
      input: fingerprintCapabilityInvocation(normalizedRequest)
    });

    const requestedEvidence = createInvocationEvidence(
      {
        organization_id: normalizedRequest.organization_id,
        correlation_id,
        record_type: 'capability_invocation_requested',
        subject: normalizedRequest.capability_id,
        data: {
          capability_id: normalizedRequest.capability_id,
          principal_id: normalizedRequest.principal_id,
          binding_id: normalizedRequest.binding_id,
          decision_binding_id: normalizedRequest.decision_binding_id,
          policy_decision_id: normalizedRequest.policy_decision_id,
          approval_requirement: normalizedRequest.approval_requirement,
          input: normalizedRequest.input
        }
      },
      this.now,
      this.evidenceLedger
    );

    const capability = this.registry.get(normalizedRequest.capability_id);
    if (!capability || !capability.enabled) {
      const deniedEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_denied',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            reason: 'capability unknown or not authorized'
          }
        },
        this.now,
        this.evidenceLedger
      );
      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'denied',
          binding_id: normalizedRequest.decision_binding_id ?? normalizedRequest.binding_id ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: deniedEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, deniedEvidence.evidence_id],
          created_at: this.now().toISOString(),
          reason: 'capability unknown or not authorized',
          error: 'capability unknown or not authorized',
          output: null
        }),
        normalizedRequest,
        deniedEvidence.evidence_id
      );
    }

    if (!capability.mock) {
      const unavailableEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_unavailable',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            reason: 'capability runtime unavailable'
          }
        },
        this.now,
        this.evidenceLedger
      );
      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'unavailable',
          binding_id: normalizedRequest.decision_binding_id ?? normalizedRequest.binding_id ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: unavailableEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, unavailableEvidence.evidence_id],
          created_at: this.now().toISOString(),
          reason: 'capability runtime unavailable',
          error: 'capability runtime unavailable',
          output: null
        }),
        normalizedRequest,
        unavailableEvidence.evidence_id
      );
    }

    const bindingId = normalizedRequest.decision_binding_id ?? normalizedRequest.binding_id;
    let validatedBinding: DecisionBinding | null = null;

    if (capability.kind === 'effectful') {
      if (!bindingId || !this.bindingStore) {
        const deniedEvidence = createInvocationEvidence(
          {
            organization_id: normalizedRequest.organization_id,
            correlation_id,
            record_type: 'capability_invocation_denied',
            subject: normalizedRequest.capability_id,
            data: {
              capability_id: normalizedRequest.capability_id,
              reason: 'binding required before capability execution'
            }
          },
          this.now,
          this.evidenceLedger
        );
        return this.cacheInvocation(
          buildInvocationResult({
            invocation_id,
            capability_id: normalizedRequest.capability_id,
            organization_id: normalizedRequest.organization_id,
            principal_id: normalizedRequest.principal_id,
            correlation_id,
            status: 'denied',
            binding_id: bindingId ?? null,
            policy_decision_id: normalizedRequest.policy_decision_id ?? null,
            executed_by_runtime: true,
            evidence_reference: deniedEvidence.evidence_id,
            evidence_links: [requestedEvidence.evidence_id, deniedEvidence.evidence_id],
            created_at: this.now().toISOString(),
            reason: 'binding required before capability execution',
            error: 'binding required before capability execution',
            output: null
          }),
          normalizedRequest,
          deniedEvidence.evidence_id
        );
      }

      const storedBinding = this.bindingStore.get(bindingId);
      const bindingReason = this.evaluateCapabilityBinding({
        binding: storedBinding ?? null,
        invocation: normalizedRequest,
        capability
      });
      if (bindingReason !== null) {
        const deniedEvidence = createInvocationEvidence(
          {
            organization_id: normalizedRequest.organization_id,
            correlation_id,
            record_type: 'capability_invocation_denied',
            subject: normalizedRequest.capability_id,
            data: {
              capability_id: normalizedRequest.capability_id,
              reason: bindingReason
            }
          },
          this.now,
          this.evidenceLedger
        );
        return this.cacheInvocation(
          buildInvocationResult({
            invocation_id,
            capability_id: normalizedRequest.capability_id,
            organization_id: normalizedRequest.organization_id,
            principal_id: normalizedRequest.principal_id,
            correlation_id,
            status: 'denied',
            binding_id: bindingId ?? null,
            policy_decision_id: normalizedRequest.policy_decision_id ?? null,
            executed_by_runtime: true,
            evidence_reference: deniedEvidence.evidence_id,
            evidence_links: [requestedEvidence.evidence_id, deniedEvidence.evidence_id],
            created_at: this.now().toISOString(),
            reason: bindingReason,
            error: bindingReason,
            output: null
          }),
          normalizedRequest,
          deniedEvidence.evidence_id
        );
      }

      validatedBinding = storedBinding ?? null;
    }

    const startedEvidence = createInvocationEvidence(
      {
        organization_id: normalizedRequest.organization_id,
        correlation_id,
        record_type: 'capability_invocation_started',
        subject: normalizedRequest.capability_id,
        data: {
          capability_id: normalizedRequest.capability_id,
          capability_kind: capability.kind,
          binding_id: bindingId
        }
      },
      this.now,
      this.evidenceLedger
    );

    let mockResult: CapabilityMockResult;
    try {
      mockResult = capability.mock.invoke(normalizedRequest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'capability mock threw';
      const errorEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_error',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            reason: errorMessage
          }
        },
        this.now,
        this.evidenceLedger
      );
      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'error',
          binding_id: bindingId ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: errorEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, startedEvidence.evidence_id, errorEvidence.evidence_id],
          created_at: this.now().toISOString(),
          reason: errorMessage,
          error: errorMessage,
          output: null
        }),
        normalizedRequest,
        errorEvidence.evidence_id
      );
    }

    const created_at = this.now().toISOString();
    if (mockResult.status === 'executed') {
      const completedEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_completed',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            invocation_id,
            binding_id: bindingId ?? null,
            output: mockResult.output
          }
        },
        this.now,
        this.evidenceLedger
      );
      const resultBoundEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_result_bound',
          subject: normalizedRequest.capability_id,
          data: {
            invocation_id,
            capability_id: normalizedRequest.capability_id,
            binding_id: bindingId ?? null,
            status: mockResult.status
          }
        },
        this.now,
        this.evidenceLedger
      );

      if (validatedBinding && this.bindingStore) {
        this.bindingStore.consumeBinding(validatedBinding.binding_id);
      }

      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'executed',
          binding_id: bindingId ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: resultBoundEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, startedEvidence.evidence_id, completedEvidence.evidence_id, resultBoundEvidence.evidence_id],
          created_at,
          reason: 'capability executed',
          error: null,
          output: mockResult.output
        }),
        normalizedRequest,
        resultBoundEvidence.evidence_id
      );
    }

    if (mockResult.status === 'not_found') {
      const notFoundEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_not_found',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            reason: mockResult.error ?? 'capability mock resource not found'
          }
        },
        this.now,
        this.evidenceLedger
      );
      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'not_found',
          binding_id: bindingId ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: notFoundEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, startedEvidence.evidence_id, notFoundEvidence.evidence_id],
          created_at,
          reason: mockResult.error ?? 'capability mock resource not found',
          error: mockResult.error ?? 'capability mock resource not found',
          output: null
        }),
        normalizedRequest,
        notFoundEvidence.evidence_id
      );
    }

    if (mockResult.status === 'unavailable') {
      const unavailableEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_unavailable',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            reason: mockResult.error ?? 'capability unavailable'
          }
        },
        this.now,
        this.evidenceLedger
      );
      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'unavailable',
          binding_id: bindingId ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: unavailableEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, startedEvidence.evidence_id, unavailableEvidence.evidence_id],
          created_at,
          reason: mockResult.error ?? 'capability unavailable',
          error: mockResult.error ?? 'capability unavailable',
          output: null
        }),
        normalizedRequest,
        unavailableEvidence.evidence_id
      );
    }

    if (mockResult.status === 'error') {
      const errorEvidence = createInvocationEvidence(
        {
          organization_id: normalizedRequest.organization_id,
          correlation_id,
          record_type: 'capability_invocation_error',
          subject: normalizedRequest.capability_id,
          data: {
            capability_id: normalizedRequest.capability_id,
            reason: mockResult.error ?? 'capability error'
          }
        },
        this.now,
        this.evidenceLedger
      );
      return this.cacheInvocation(
        buildInvocationResult({
          invocation_id,
          capability_id: normalizedRequest.capability_id,
          organization_id: normalizedRequest.organization_id,
          principal_id: normalizedRequest.principal_id,
          correlation_id,
          status: 'error',
          binding_id: bindingId ?? null,
          policy_decision_id: normalizedRequest.policy_decision_id ?? null,
          executed_by_runtime: true,
          evidence_reference: errorEvidence.evidence_id,
          evidence_links: [requestedEvidence.evidence_id, startedEvidence.evidence_id, errorEvidence.evidence_id],
          created_at,
          reason: mockResult.error ?? 'capability error',
          error: mockResult.error ?? 'capability error',
          output: mockResult.output
        }),
        normalizedRequest,
        errorEvidence.evidence_id
      );
    }

    const deniedEvidence = createInvocationEvidence(
      {
        organization_id: normalizedRequest.organization_id,
        correlation_id,
        record_type: 'capability_invocation_denied',
        subject: normalizedRequest.capability_id,
        data: {
          capability_id: normalizedRequest.capability_id,
          reason: mockResult.error ?? 'capability denied'
        }
      },
      this.now,
      this.evidenceLedger
    );
    return this.cacheInvocation(
      buildInvocationResult({
        invocation_id,
        capability_id: normalizedRequest.capability_id,
        organization_id: normalizedRequest.organization_id,
        principal_id: normalizedRequest.principal_id,
        correlation_id,
        status: 'denied',
        binding_id: bindingId ?? null,
        policy_decision_id: normalizedRequest.policy_decision_id ?? null,
        executed_by_runtime: true,
        evidence_reference: deniedEvidence.evidence_id,
        evidence_links: [requestedEvidence.evidence_id, startedEvidence.evidence_id, deniedEvidence.evidence_id],
        created_at,
        reason: mockResult.error ?? 'capability denied',
        error: mockResult.error ?? 'capability denied',
        output: null
      }),
      normalizedRequest,
      deniedEvidence.evidence_id
    );
  }

  private evaluateCapabilityBinding(input: {
    binding: DecisionBinding | null;
    invocation: CapabilityInvocationRequest;
    capability: CapabilityDefinition;
  }): string | null {
    const binding = input.binding;
    if (!binding) {
      return 'binding required before capability execution';
    }

    if (!bindingStateIsUsable(binding.binding_state)) {
      return 'binding rejected';
    }

    if (new Date(binding.expires_at).getTime() < this.now().getTime()) {
      return 'binding expired';
    }

    if (binding.organization_id !== input.invocation.organization_id) {
      return 'binding rejected';
    }

    if (binding.principal_id !== input.invocation.principal_id) {
      return 'binding rejected';
    }

    if (binding.approved_capability_id !== input.capability.capability_id) {
      return 'binding rejected';
    }

    const fingerprint = fingerprintCapabilityInput(input.invocation.input);
    if (binding.approved_input_fingerprint !== fingerprint) {
      return 'binding rejected';
    }

    return null;
  }

  private cacheInvocation(
    result: CapabilityInvocationResult,
    request: CapabilityInvocationRequest,
    evidence_reference: string | null
  ): CapabilityInvocationResult {
    this.recordInvocation(result, request, evidence_reference);
    return result;
  }

  private recordInvocation(result: CapabilityInvocationResult, request: CapabilityInvocationRequest, evidence_reference: string | null): void {
    this.invocations.set(result.invocation_id, {
      invocation: cloneCapabilityInvocationRequest(request),
      result: cloneCapabilityInvocationResult(result),
      evidence_reference
    });
  }
}
