import {
  createPolicyDecision,
  type CoreRequest,
  type IdentityContext,
  type OrganizationContext,
  type PolicyDecision,
  type PolicyObligation
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

function requiredScopesFrom(request: Pick<CoreRequest, 'payload'>): string[] {
  const payload = request.payload;
  if (Array.isArray(payload.required_scopes)) {
    return payload.required_scopes.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0);
  }
  if (typeof payload.required_scope === 'string' && payload.required_scope.trim().length > 0) {
    return [payload.required_scope];
  }
  return [];
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
  const seed = {
    request_id: request.request_id,
    correlation_id: request.correlation_id,
    organization_id: organizationContext.organization_id,
    principal_id: identityContext.principal_id,
    action: request.action,
    purpose: request.purpose
  };

  const missingCriticalAttributes: string[] = [];
  if (!request.request_id) missingCriticalAttributes.push('request_id');
  if (!request.action) missingCriticalAttributes.push('action');
  if (!request.purpose) missingCriticalAttributes.push('purpose');
  if (!hasCriticalResolution(organizationContext)) missingCriticalAttributes.push('organization_context');
  if (!hasCriticalResolution(identityContext)) missingCriticalAttributes.push('identity_context');

  if (missingCriticalAttributes.length > 0) {
    return createFailedClosedPolicyDecision(seed, 'critical attributes missing', missingCriticalAttributes);
  }

  if (request.payload.force_failed_closed === true) {
    return createFailedClosedPolicyDecision(seed, 'explicit failed closed policy path');
  }

  const requiredScopes = requiredScopesFrom(request);
  const missingScope = requiredScopes.find((scope) => !identityContext.scopes.includes(scope));
  if (missingScope) {
    return createFailedClosedPolicyDecision(seed, `required scope missing: ${missingScope}`, ['required_scope']);
  }

  if (request.payload.obligation_rule === 'required') {
    const obligations: PolicyObligation[] = [
      {
        obligation_id: `obligation-binding-${request.request_id}`,
        obligation_type: 'binding',
        description: 'Complete the governed obligation before effect',
        required: true,
        status: request.payload.obligations_completed === true ? 'satisfied' : 'blocked'
      }
    ];
    if (request.payload.obligations_completed !== true) {
      return createFailedClosedPolicyDecision(seed, 'required obligations cannot be fulfilled', ['obligations_completed']);
    }
    return buildAllowDecision(seed, 'policy allows governed execution with satisfied obligations', obligations);
  }

  if (request.payload.force_deny === true || request.action.startsWith('deny')) {
    return createPolicyDecision({
      outcome: 'deny',
      decision_reason: 'policy denies governed execution',
      seed
    });
  }

  if (request.payload.force_defer === true || request.action.startsWith('defer')) {
    return createPolicyDecision({
      outcome: 'defer',
      decision_reason: 'policy defers governed execution',
      seed
    });
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
