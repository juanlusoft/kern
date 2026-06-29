import {
  createEvidenceRecord,
  createPolicyDecision,
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

function createPlaceholderPolicyDecision(reason: string, seed: unknown, now: () => Date): PolicyDecision {
  return createFailedClosedPolicyDecision(seed, reason, ['organization_context', 'identity_context']);
}

function createFailedClosedResult(input: {
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

export function executeGovernedRequest(
  request: CoreRequest,
  environment: CoreM1Environment = createCoreM1Environment()
): GovernedExecutionResult {
  const correlation_id = normalizeCorrelationId(request);
  const now = environment.now;

  const organizationContext = environment.resolveOrganizationContext(request);
  if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
    const failedClosedEvidence = environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: request.organization_hint?.trim() || 'unknown',
        correlation_id,
        record_type: 'failed_closed',
        subject: 'organization_resolution_failed',
        data: { reason: organizationContext.failure_reason ?? 'organization unresolved' },
        created_at: now().toISOString()
      })
    );
    const identityContext = createPlaceholderIdentityContext('organization resolution failed', now);
    const policyDecision = createPlaceholderPolicyDecision('organization resolution failed', { request_id: request.request_id, correlation_id }, now);
    return createFailedClosedResult({
      request,
      organizationContext,
      identityContext,
      policyDecision,
      reason: failedClosedEvidence.data.reason as string,
      evidenceLedger: environment.evidenceLedger,
      binding: null
    });
  }

  const intentEvidence = environment.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'intent',
      subject: request.action,
      data: {
        request_id: request.request_id,
        purpose: request.purpose,
        requires_binding: request.requires_binding,
        payload: request.payload
      },
      created_at: now().toISOString()
    })
  );

  const identityContext = environment.resolveIdentityContext(request, organizationContext);
  if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'failed_closed',
        subject: 'identity_resolution_failed',
        data: { reason: identityContext.failure_reason ?? 'identity unresolved' },
        created_at: now().toISOString()
      })
    );
    const policyDecision = createPlaceholderPolicyDecision('identity resolution failed', { request_id: request.request_id, correlation_id }, now);
    return createFailedClosedResult({
      request,
      organizationContext,
      identityContext,
      policyDecision,
      reason: identityContext.failure_reason ?? 'identity unresolved',
      evidenceLedger: environment.evidenceLedger,
      binding: null
    });
  }

  const policyDecision = environment.evaluatePolicy({
    request,
    organizationContext,
    identityContext
  });
  const policyDecisionEvidence = environment.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'policy_decision',
      subject: policyDecision.outcome,
      data: {
        decision_id: policyDecision.decision_id,
        allow: policyDecision.allow,
        deny: policyDecision.deny,
        defer: policyDecision.defer,
        failed_closed: policyDecision.failed_closed,
        obligations: policyDecision.obligations,
        missing_critical_attributes: policyDecision.missing_critical_attributes,
        decision_reason: policyDecision.decision_reason,
        policy_version: policyDecision.policy_version
      },
      created_at: now().toISOString()
    })
  );

  if (policyDecision.outcome === 'deny') {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'execution_blocked',
        subject: 'policy_deny',
        data: { decision_id: policyDecision.decision_id },
        created_at: now().toISOString()
      })
    );
    return {
      status: 'denied',
      correlation_id,
      organization_context: organizationContext,
      identity_context: identityContext,
      policy_decision: policyDecision,
      evidence_records: environment.evidenceLedger.listByCorrelation(correlation_id),
      binding: null,
      reason: policyDecision.decision_reason
    };
  }

  if (policyDecision.outcome === 'defer') {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'execution_blocked',
        subject: 'policy_defer',
        data: { decision_id: policyDecision.decision_id },
        created_at: now().toISOString()
      })
    );
    return {
      status: 'deferred',
      correlation_id,
      organization_context: organizationContext,
      identity_context: identityContext,
      policy_decision: policyDecision,
      evidence_records: environment.evidenceLedger.listByCorrelation(correlation_id),
      binding: null,
      reason: policyDecision.decision_reason
    };
  }

  if (policyDecision.outcome === 'failed_closed') {
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id,
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
    return {
      status: 'failed_closed',
      correlation_id,
      organization_context: organizationContext,
      identity_context: identityContext,
      policy_decision: policyDecision,
      evidence_records: environment.evidenceLedger.listByCorrelation(correlation_id),
      binding: null,
      reason: policyDecision.decision_reason
    };
  }

  let binding: DecisionBinding | null = null;
  if (request.requires_binding) {
    binding = environment.bindingStore.createBinding({
      request,
      organizationContext,
      identityContext,
      policyDecision,
      evidence_reference: policyDecisionEvidence.evidence_id,
      now
    });
    environment.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: organizationContext.organization_id,
        correlation_id,
        record_type: 'binding_created',
        subject: 'binding_created',
        data: {
          binding_id: binding.binding_id,
          policy_decision_id: binding.policy_decision_id,
          request_fingerprint: binding.request_fingerprint
        },
        created_at: now().toISOString()
      })
    );
  }

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
