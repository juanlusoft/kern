import {
  createPolicyDecision,
  normalizeRequestedScope,
  type CoreRequest,
  type IdentityContext,
  type OrganizationContext,
  type PolicyDecision,
  type PolicyObligation,
  type PolicyInputAttributes,
  type CoreRequestPayload
} from '../../contracts/src/index';

function hasCriticalResolution(context: OrganizationContext | IdentityContext): boolean {
  if (context.resolution_state !== 'resolved') {
    return false;
  }
  if ('organization_id' in context) {
    return Boolean(context.organization_id);
  }
  return Boolean(context.principal_id);
}

function buildPolicyInputAttributes(request: CoreRequest): PolicyInputAttributes {
  return {
    resource: request.payload.resource,
    operation: request.payload.operation,
    requested_scope: normalizeRequestedScope(request.payload.requested_scope),
    classification: request.payload.classification,
    destination: request.payload.destination,
    amount: request.payload.amount,
    flags: { ...request.payload.flags }
  };
}

function buildDecisionSeed(
  request: CoreRequest,
  organizationContext: OrganizationContext,
  identityContext: IdentityContext,
  attributes: PolicyInputAttributes
): unknown {
  return {
    request_id: request.request_id,
    correlation_id: request.correlation_id,
    organization_id: organizationContext.organization_id,
    principal_id: identityContext.principal_id,
    resource: attributes.resource,
    operation: attributes.operation,
    requested_scope: attributes.requested_scope,
    classification: attributes.classification,
    destination: attributes.destination,
    amount: attributes.amount
  };
}

function buildAllowDecision(seed: unknown, reason: string, obligations: PolicyObligation[] = []): PolicyDecision {
  return createPolicyDecision({
    outcome: 'allow',
    obligations,
    decision_reason: reason,
    seed
  });
}

export function createFailedClosedPolicyDecision(seed: unknown, reason: string, missingCriticalAttributes: string[] = []): PolicyDecision {
  return createPolicyDecision({
    outcome: 'failed_closed',
    decision_reason: reason,
    missing_critical_attributes: missingCriticalAttributes,
    seed
  });
}

export function evaluatePolicy(input: {
  request: CoreRequest;
  organizationContext: OrganizationContext;
  identityContext: IdentityContext;
}): PolicyDecision {
  const { request, organizationContext, identityContext } = input;
  const attributes = buildPolicyInputAttributes(request);
  const seed = buildDecisionSeed(request, organizationContext, identityContext, attributes);

  const missingCriticalAttributes: string[] = [];
  if (!request.request_id) missingCriticalAttributes.push('request_id');
  if (!attributes.resource) missingCriticalAttributes.push('resource');
  if (!attributes.operation) missingCriticalAttributes.push('operation');
  if (!hasCriticalResolution(organizationContext)) missingCriticalAttributes.push('organization_context');
  if (!hasCriticalResolution(identityContext)) missingCriticalAttributes.push('identity_context');
  if (attributes.flags.missing_critical_attribute === true) missingCriticalAttributes.push('flag_missing_critical_attribute');

  if (missingCriticalAttributes.length > 0) {
    return createFailedClosedPolicyDecision(seed, 'critical attributes missing', missingCriticalAttributes);
  }

  if (attributes.flags.force_policy_deny === true) {
    return createPolicyDecision({
      outcome: 'deny',
      decision_reason: 'policy denies governed execution',
      seed
    });
  }

  if (attributes.flags.force_policy_defer === true) {
    return createPolicyDecision({
      outcome: 'defer',
      decision_reason: 'policy defers governed execution',
      seed
    });
  }

  const requiredScopes = attributes.requested_scope;
  const missingScope = requiredScopes.find((scope) => !identityContext.scopes.includes(scope));
  if (missingScope) {
    return createFailedClosedPolicyDecision(seed, `required scope missing: ${missingScope}`, ['requested_scope']);
  }

  if (attributes.flags.obligation_incomplete === true) {
    return createFailedClosedPolicyDecision(seed, 'required obligations cannot be fulfilled', ['obligation_incomplete']);
  }

  const obligations: PolicyObligation[] = request.requires_binding
    ? [
        {
          obligation_id: `binding-obligation-${request.request_id}`,
          obligation_type: 'binding',
          description: 'Decision Binding is required before relevant effects',
          required: true,
          status: 'pending'
        }
      ]
    : [];

  return buildAllowDecision(seed, 'policy allows governed execution', obligations);
}

export function getPolicyInputAttributes(request: Pick<CoreRequest, 'payload'>): PolicyInputAttributes {
  const payload = request.payload;
  return {
    resource: payload.resource,
    operation: payload.operation,
    requested_scope: normalizeRequestedScope(payload.requested_scope),
    classification: payload.classification,
    destination: payload.destination,
    amount: payload.amount,
    flags: { ...payload.flags }
  };
}
