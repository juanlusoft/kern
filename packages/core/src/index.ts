import {
  createEvidenceRecord,
  normalizeCorrelationId,
  type CoreRequest,
  type DecisionBinding,
  type GovernedExecutionResult,
  type IdentityContext,
  type OrganizationContext,
  type PolicyDecision
} from '../../contracts/src/index';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import { createFailedClosedPolicyDecision, evaluatePolicy } from '../../policy/src/index';

export interface CoreM1Environment {
  evidenceLedger: InMemoryEvidenceLedger;
  bindingStore: InMemoryDecisionBindingStore;
  resolveOrganizationContext: typeof resolveOrganizationContext;
  resolveIdentityContext: typeof resolveIdentityContext;
  evaluatePolicy: typeof evaluatePolicy;
  now: () => Date;
}

export function createCoreM1Environment(overrides: Partial<CoreM1Environment> = {}): CoreM1Environment {
  return {
    evidenceLedger: overrides.evidenceLedger ?? new InMemoryEvidenceLedger(),
    bindingStore: overrides.bindingStore ?? new InMemoryDecisionBindingStore(),
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
    reason: input.policyDecision.decision_reason
  };
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
    now: input.environment.now
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

  return {
    status: 'allowed',
    correlation_id,
    organization_context: organizationContext,
    identity_context: identityContext,
    policy_decision: policyDecision,
    evidence_records: environment.evidenceLedger.listByCorrelation(correlation_id),
    binding,
    reason: policyDecision.decision_reason
  };
}
