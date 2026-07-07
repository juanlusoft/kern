import {
  createEvidenceRecord,
  createDeterministicId,
  fingerprintCoreRequest,
  normalizeCorrelationId,
  type CoreRequest,
  type CapabilityInvocationRequest,
  type CapabilityInvocationResult,
  type DecisionBinding,
  type GovernedExecutionResult,
  type IdentityContext,
  type OrganizationContext,
  type PolicyDecision
} from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryCapabilityRuntime } from '../../capabilities/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import { createFailedClosedPolicyDecision, evaluatePolicy } from '../../policy/src/index';
import { InMemoryTurnRuntime } from '../../turns/src/index';

export interface CoreM1Environment {
  evidenceLedger: InMemoryEvidenceLedger;
  bindingStore: InMemoryDecisionBindingStore;
  capabilityRuntime?: InMemoryCapabilityRuntime;
  turnRuntime?: InMemoryTurnRuntime;
  resolveOrganizationContext: typeof resolveOrganizationContext;
  resolveIdentityContext: typeof resolveIdentityContext;
  evaluatePolicy: typeof evaluatePolicy;
  now: () => Date;
}

export function createCoreM1Environment(overrides: Partial<CoreM1Environment> = {}): CoreM1Environment {
  return {
    evidenceLedger: overrides.evidenceLedger ?? new InMemoryEvidenceLedger(),
    bindingStore: overrides.bindingStore ?? new InMemoryDecisionBindingStore(),
    capabilityRuntime: overrides.capabilityRuntime,
    turnRuntime: overrides.turnRuntime,
    resolveOrganizationContext: overrides.resolveOrganizationContext ?? resolveOrganizationContext,
    resolveIdentityContext: overrides.resolveIdentityContext ?? resolveIdentityContext,
    evaluatePolicy: overrides.evaluatePolicy ?? evaluatePolicy,
    now: overrides.now ?? (() => new Date())
  };
}

function createPlaceholderIdentityContext(reason: string, now: () => Date): IdentityContext {
  return {
    principal_id: null,
    principal_type: null,
    delegated_identity: null,
    scopes: [],
    auth_method: null,
    resolved_at: now().toISOString(),
    revocation_version: null,
    resolution_state: 'failed_closed',
    failure_reason: reason
  };
}

function createPlaceholderPolicyDecision(reason: string, seed: unknown): PolicyDecision {
  return createFailedClosedPolicyDecision(seed, reason, ['organization_context', 'identity_context']);
}

function buildFailedClosedResult(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  identityContext: IdentityContext;
  policyDecision: PolicyDecision;
  reason: string;
  evidenceLedger: InMemoryEvidenceLedger;
  binding: DecisionBinding | null;
}): GovernedExecutionResult {
  return {
    status: 'failed_closed',
    correlation_id: normalizeCorrelationId(input.request),
    organization_context: input.organizationContext,
    identity_context: input.identityContext,
    policy_decision: input.policyDecision,
    evidence_records: input.evidenceLedger.listByCorrelation(normalizeCorrelationId(input.request)),
    binding: input.binding,
    turn_id: null,
    reason: input.reason
  };
}

function buildBlockedResult(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  identityContext: IdentityContext;
  policyDecision: PolicyDecision;
  evidenceLedger: InMemoryEvidenceLedger;
  status: 'denied' | 'deferred';
}): GovernedExecutionResult {
  return {
    status: input.status,
    correlation_id: normalizeCorrelationId(input.request),
    organization_context: input.organizationContext,
    identity_context: input.identityContext,
    policy_decision: input.policyDecision,
    evidence_records: input.evidenceLedger.listByCorrelation(normalizeCorrelationId(input.request)),
    binding: null,
    turn_id: null,
    reason: input.policyDecision.decision_reason
  };
}

function buildCapabilityUnavailableResult(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  identityContext: IdentityContext;
  policyDecision: PolicyDecision;
  capability_invocation: CapabilityInvocationRequest;
  now: () => Date;
  reason: string;
  evidence_id?: string | null;
}): CapabilityInvocationResult {
  const correlation_id = normalizeCorrelationId(input.request);
  const created_at = input.now().toISOString();
  const evidence_links = input.evidence_id ? [input.evidence_id] : [];
  return {
    invocation_id: createDeterministicId('capability-invocation', {
      capability_id: input.capability_invocation.capability_id,
      organization_id: input.organizationContext.organization_id,
      principal_id: input.identityContext.principal_id,
      correlation_id,
      requested_at: created_at
    }),
    capability_id: input.capability_invocation.capability_id,
    organization_id: input.organizationContext.organization_id ?? input.capability_invocation.organization_id,
    principal_id: input.identityContext.principal_id ?? input.capability_invocation.principal_id,
    correlation_id,
    status: 'unavailable',
    runtime_decision: 'unavailable',
    binding_id: input.capability_invocation.binding_id ?? null,
    decision_binding_id: input.capability_invocation.decision_binding_id ?? input.capability_invocation.binding_id ?? null,
    policy_decision_id: input.policyDecision.decision_id,
    executed_by_runtime: false,
    output: null,
    error: input.reason,
    evidence_links,
    created_at,
    evidence_reference: input.evidence_id ?? null,
    reason: input.reason,
  };
}

function recordCapabilityUnavailable(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  capabilityInvocation: CapabilityInvocationRequest;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
  reason: string;
}): string {
  return input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: normalizeCorrelationId(input.request),
      record_type: 'capability_invocation_unavailable',
      subject: input.capabilityInvocation.capability_id,
      data: {
        capability_id: input.capabilityInvocation.capability_id,
        reason: input.reason,
        capability_invocation: input.capabilityInvocation
      },
      created_at: input.now().toISOString()
    })
  ).evidence_id;
}

function recordOrganizationFailure(input: {
  request: CoreRequest;
  correlation_id: string;
  organizationContext: OrganizationContext;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
}): void {
  input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.request.organization_hint?.trim() || 'unknown',
      correlation_id: input.correlation_id,
      record_type: 'failed_closed',
      subject: 'organization_resolution_failed',
      data: { reason: input.organizationContext.failure_reason ?? 'organization unresolved' },
      created_at: input.now().toISOString()
    })
  );
}

function recordOrganizationResolved(input: {
  organizationContext: OrganizationContext;
  correlation_id: string;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
}): void {
  input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: input.correlation_id,
      record_type: 'organization_resolved',
      subject: input.organizationContext.organization_id ?? 'organization',
      data: {
        organization_state: input.organizationContext.organization_state,
        source: input.organizationContext.source,
        isolation_boundary: input.organizationContext.isolation_boundary,
        resolution_state: input.organizationContext.resolution_state
      },
      created_at: input.now().toISOString()
    })
  );
}

function recordIdentityFailure(input: {
  organizationContext: OrganizationContext;
  correlation_id: string;
  identityContext: IdentityContext;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
}): void {
  input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: input.correlation_id,
      record_type: 'failed_closed',
      subject: 'identity_resolution_failed',
      data: { reason: input.identityContext.failure_reason ?? 'identity unresolved' },
      created_at: input.now().toISOString()
    })
  );
}

function recordIdentityResolved(input: {
  organizationContext: OrganizationContext;
  correlation_id: string;
  identityContext: IdentityContext;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
}): void {
  input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: input.correlation_id,
      record_type: 'identity_resolved',
      subject: input.identityContext.principal_id ?? 'principal',
      data: {
        principal_type: input.identityContext.principal_type,
        delegated_identity: input.identityContext.delegated_identity,
        scopes: input.identityContext.scopes,
        auth_method: input.identityContext.auth_method,
        resolution_state: input.identityContext.resolution_state
      },
      created_at: input.now().toISOString()
    })
  );
}

function recordIntentEvidence(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  correlation_id: string;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
}): void {
  input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: input.correlation_id,
      record_type: 'intent',
      subject: input.request.action,
      data: {
        request_id: input.request.request_id,
        purpose: input.request.purpose,
        requires_binding: input.request.requires_binding,
        payload: input.request.payload
      },
      created_at: input.now().toISOString()
    })
  );
}

function recordPolicyDecisionEvidence(input: {
  organizationContext: OrganizationContext;
  correlation_id: string;
  policyDecision: PolicyDecision;
  evidenceLedger: InMemoryEvidenceLedger;
  now: () => Date;
}): string {
  return input.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: input.correlation_id,
      record_type: 'policy_decision',
      subject: input.policyDecision.outcome,
      data: {
        decision_id: input.policyDecision.decision_id,
        allow: input.policyDecision.allow,
        deny: input.policyDecision.deny,
        defer: input.policyDecision.defer,
        failed_closed: input.policyDecision.failed_closed,
        obligations: input.policyDecision.obligations,
        missing_critical_attributes: input.policyDecision.missing_critical_attributes,
        decision_reason: input.policyDecision.decision_reason,
        policy_version: input.policyDecision.policy_version
      },
      created_at: input.now().toISOString()
    })
  ).evidence_id;
}

function createBindingIfRequired(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  identityContext: IdentityContext;
  policyDecision: PolicyDecision;
  evidence_reference: string;
  environment: CoreM1Environment;
}): DecisionBinding | null {
  if (!input.request.requires_binding) {
    return null;
  }

  const binding = input.environment.bindingStore.createBinding({
    request: input.request,
    organizationContext: input.organizationContext,
    identityContext: input.identityContext,
    policyDecision: input.policyDecision,
    evidence_reference: input.evidence_reference,
    now: input.environment.now,
    capabilityInvocation: input.request.capability_invocation ?? null
  });

  input.environment.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      correlation_id: normalizeCorrelationId(input.request),
      record_type: 'binding_created',
      subject: 'binding_created',
      data: {
        binding_id: binding.binding_id,
        policy_decision_id: binding.policy_decision_id,
        request_fingerprint: binding.request_fingerprint
      },
      created_at: input.environment.now().toISOString()
    })
  );

  return binding;
}

export function executeGovernedRequest(
  request: CoreRequest,
  environment: CoreM1Environment = createCoreM1Environment()
): GovernedExecutionResult {
  const correlation_id = normalizeCorrelationId(request);
  const now = environment.now;

  const organizationContext = environment.resolveOrganizationContext(request);
  if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
    recordOrganizationFailure({ request, correlation_id, organizationContext, evidenceLedger: environment.evidenceLedger, now });
    return buildFailedClosedResult({
      request,
      organizationContext,
      identityContext: createPlaceholderIdentityContext('organization resolution failed', now),
      policyDecision: createPlaceholderPolicyDecision('organization resolution failed', {
        request_id: request.request_id,
        correlation_id
      }),
      reason: organizationContext.failure_reason ?? 'organization unresolved',
      evidenceLedger: environment.evidenceLedger,
      binding: null
    });
  }

  recordOrganizationResolved({ organizationContext, correlation_id, evidenceLedger: environment.evidenceLedger, now });
  recordIntentEvidence({ request, organizationContext, correlation_id, evidenceLedger: environment.evidenceLedger, now });

  const identityContext = environment.resolveIdentityContext(request, organizationContext);
  if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
    recordIdentityFailure({ organizationContext, correlation_id, identityContext, evidenceLedger: environment.evidenceLedger, now });
    return buildFailedClosedResult({
      request,
      organizationContext,
      identityContext,
      policyDecision: createPlaceholderPolicyDecision('identity resolution failed', {
        request_id: request.request_id,
        correlation_id
      }),
      reason: identityContext.failure_reason ?? 'identity unresolved',
      evidenceLedger: environment.evidenceLedger,
      binding: null
    });
  }

  recordIdentityResolved({ organizationContext, correlation_id, identityContext, evidenceLedger: environment.evidenceLedger, now });

  const policyDecision = environment.evaluatePolicy({
    request,
    organizationContext,
    identityContext
  });
  const policyDecisionEvidenceId = recordPolicyDecisionEvidence({
    organizationContext,
    correlation_id,
    policyDecision,
    evidenceLedger: environment.evidenceLedger,
    now
  });

  if (policyDecision.outcome === 'deny') {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id ?? 'unknown',
        correlation_id,
        record_type: 'execution_blocked',
        subject: 'policy_deny',
        data: { decision_id: policyDecision.decision_id },
        created_at: now().toISOString()
      })
    );
    return buildBlockedResult({
      request,
      organizationContext,
      identityContext,
      policyDecision,
      evidenceLedger: environment.evidenceLedger,
      status: 'denied'
    });
  }

  if (policyDecision.outcome === 'defer') {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id ?? 'unknown',
        correlation_id,
        record_type: 'execution_blocked',
        subject: 'policy_defer',
        data: { decision_id: policyDecision.decision_id },
        created_at: now().toISOString()
      })
    );
    return buildBlockedResult({
      request,
      organizationContext,
      identityContext,
      policyDecision,
      evidenceLedger: environment.evidenceLedger,
      status: 'deferred'
    });
  }

  if (policyDecision.outcome === 'failed_closed') {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id ?? 'unknown',
        correlation_id,
        record_type: 'failed_closed',
        subject: 'policy_failed_closed',
        data: {
          decision_id: policyDecision.decision_id,
          missing_critical_attributes: policyDecision.missing_critical_attributes
        },
        created_at: now().toISOString()
      })
    );
    return buildFailedClosedResult({
      request,
      organizationContext,
      identityContext,
      policyDecision,
      reason: policyDecision.decision_reason,
      evidenceLedger: environment.evidenceLedger,
      binding: null
    });
  }

  const binding = createBindingIfRequired({
    request,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: policyDecisionEvidenceId,
    environment
  });

  const capabilityInvocation = request.capability_invocation
    ? {
        capability_id: request.capability_invocation.capability_id,
        organization_id: organizationContext.organization_id ?? request.capability_invocation.organization_id,
        principal_id: identityContext.principal_id ?? request.capability_invocation.principal_id,
        correlation_id,
        binding_id: binding?.binding_id ?? request.capability_invocation.binding_id ?? null,
        decision_binding_id: binding?.binding_id ?? request.capability_invocation.decision_binding_id ?? request.capability_invocation.binding_id ?? null,
        policy_decision_id: policyDecision.decision_id,
        approval_requirement: request.capability_invocation.approval_requirement ?? null,
        requested_at: request.capability_invocation.requested_at ?? null,
        evidence_reference: request.capability_invocation.evidence_reference ?? policyDecisionEvidenceId,
        input: {
          purpose: request.capability_invocation.input.purpose,
          requested_scope: [...request.capability_invocation.input.requested_scope],
          payload: structuredClone(request.capability_invocation.input.payload)
        },
        claimed_result: undefined,
        claimed_output: undefined,
        caller_result: undefined,
        assistant_result: undefined,
        model_claimed_result: undefined
      }
    : null;

  let capability_invocation_id: string | null = null;
  let capability_result: CapabilityInvocationResult | null = null;
  if (capabilityInvocation) {
    if (!environment.capabilityRuntime) {
      const evidence_id = recordCapabilityUnavailable({
        request,
        organizationContext,
        capabilityInvocation,
        evidenceLedger: environment.evidenceLedger,
        now,
        reason: 'capability runtime unavailable'
      });
      const unavailableResult = buildCapabilityUnavailableResult({
        request,
        organizationContext,
        identityContext,
        policyDecision,
        capability_invocation: capabilityInvocation,
        now,
        reason: 'capability runtime unavailable',
        evidence_id
      });
      capability_invocation_id = unavailableResult.invocation_id;
      capability_result = unavailableResult;
    } else {
      capability_result = environment.capabilityRuntime.invokeCapability(capabilityInvocation);
      capability_invocation_id = capability_result.invocation_id;
    }
  }

  const turn = environment.turnRuntime?.createTurn({
    organization_id: organizationContext.organization_id ?? 'unknown',
    correlation_id,
    actor: {
      principal_id: identityContext.principal_id ?? 'unknown',
      principal_type: identityContext.principal_type,
      delegated_identity: identityContext.delegated_identity
    },
    execution_context: {
      request_id: request.request_id,
      request_fingerprint: fingerprintCoreRequest({
        request,
        organization_id: organizationContext.organization_id ?? 'unknown',
        principal_id: identityContext.principal_id ?? 'unknown'
      }),
      policy_decision_id: policyDecision.decision_id,
      binding_id: binding?.binding_id ?? null,
      requires_binding: request.requires_binding
    },
    now
  });

  if (turn && capabilityInvocation) {
    const pendingEffect = environment.turnRuntime?.addPendingEffect({
      turn_id: turn.turn_id,
      binding_id: capability_result?.binding_id ?? capabilityInvocation.binding_id ?? null,
      evidence_reference: capability_result?.evidence_reference ?? policyDecisionEvidenceId,
      now
    });
    const effect_id = pendingEffect?.effect?.effect_id ?? null;
    if (effect_id && capability_result) {
      if (capability_result.status === 'executed') {
        environment.turnRuntime?.markEffectSucceeded({
          turn_id: turn.turn_id,
          effect_id,
          evidence_reference: capability_result.evidence_reference,
          now
        });
      } else if (capability_result.status === 'unavailable' || capability_result.status === 'error') {
        environment.turnRuntime?.markEffectUnknownOutcome({
          turn_id: turn.turn_id,
          effect_id,
          reason: capability_result.reason,
          evidence_reference: capability_result.evidence_reference,
          now
        });
      } else if (capability_result.status === 'not_found' || capability_result.status === 'denied') {
        environment.turnRuntime?.markEffectFailed({
          turn_id: turn.turn_id,
          effect_id,
          evidence_reference: capability_result.evidence_reference,
          now
        });
      }
    }
  }

  return {
    status: 'allowed',
    correlation_id,
    organization_context: organizationContext,
    identity_context: identityContext,
    policy_decision: policyDecision,
    evidence_records: environment.evidenceLedger.listByCorrelation(correlation_id),
    binding,
    turn_id: turn?.turn_id ?? null,
    capability_invocation_id,
    capability_result,
    reason: policyDecision.decision_reason
  };
}

export * from './presence';
export * from './hr';
