import {
  createDeterministicId,
  fingerprintCoreRequest,
  toBindingPayloadReference,
  type BindingPayloadReference,
  type CoreRequest,
  type DecisionBinding,
  type IdentityContext,
  type OrganizationContext,
  type PolicyDecision
} from '../../contracts/src/index';

export interface BindingValidationResult {
  valid: boolean;
  reason?: string;
  binding?: DecisionBinding;
}

function createBindingFingerprint(input: {
  request: CoreRequest;
  organization_id: string;
  principal_id: string;
}): string {
  return fingerprintCoreRequest({
    request: input.request,
    organization_id: input.organization_id,
    principal_id: input.principal_id
  });
}

export class InMemoryDecisionBindingStore {
  private readonly bindings = new Map<string, DecisionBinding>();
  private readonly payloadReferences = new Map<string, BindingPayloadReference>();

  createBinding(input: {
    request: CoreRequest;
    organizationContext: OrganizationContext;
    identityContext: IdentityContext;
    policyDecision: PolicyDecision;
    evidence_reference: string;
    now?: () => Date;
  }): DecisionBinding {
    if (!input.evidence_reference.trim()) {
      throw new Error('binding requires evidence reference');
    }

    const now = input.now ?? (() => new Date());
    const payloadReference = toBindingPayloadReference(input.request.payload);
    const request_fingerprint = createBindingFingerprint({
      request: input.request,
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      principal_id: input.identityContext.principal_id ?? 'unknown'
    });
    const binding: DecisionBinding = {
      binding_id: createDeterministicId('binding', {
        organization_id: input.organizationContext.organization_id,
        principal_id: input.identityContext.principal_id,
        correlation_id: input.request.correlation_id,
        request_fingerprint,
        policy_decision_id: input.policyDecision.decision_id
      }),
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      principal_id: input.identityContext.principal_id ?? 'unknown',
      correlation_id: input.request.correlation_id ?? input.request.request_id,
      request_fingerprint,
      policy_decision_id: input.policyDecision.decision_id,
      obligations: input.policyDecision.obligations,
      expires_at: new Date(now().getTime() + 5 * 60_000).toISOString(),
      binding_state: 'active',
      evidence_reference: input.evidence_reference
    };
    this.bindings.set(binding.binding_id, binding);
    this.payloadReferences.set(binding.binding_id, payloadReference);
    return binding;
  }

  validateBinding(input: {
    binding: DecisionBinding;
    request: CoreRequest;
    organizationContext: OrganizationContext;
    identityContext: IdentityContext;
    now?: () => Date;
  }): BindingValidationResult {
    const now = input.now ?? (() => new Date());
    if (new Date(input.binding.expires_at).getTime() < now().getTime()) {
      return { valid: false, reason: 'binding expired', binding: { ...input.binding, binding_state: 'expired' } };
    }

    const stored = this.bindings.get(input.binding.binding_id);
    const activeBinding = stored ?? input.binding;

    if (!activeBinding) {
      return { valid: false, reason: 'binding missing' };
    }

    if (!activeBinding.evidence_reference.trim()) {
      return { valid: false, reason: 'binding missing evidence reference', binding: activeBinding };
    }

    if (new Date(activeBinding.expires_at).getTime() < now().getTime()) {
      return { valid: false, reason: 'binding expired', binding: { ...activeBinding, binding_state: 'expired' } };
    }

    if (activeBinding.binding_state === 'consumed' || activeBinding.binding_state === 'revoked') {
      return { valid: false, reason: 'binding already consumed or revoked', binding: activeBinding };
    }

    if (activeBinding.binding_state === 'expired') {
      return { valid: false, reason: 'binding expired', binding: activeBinding };
    }

    if (activeBinding.organization_id !== (input.organizationContext.organization_id ?? 'unknown')) {
      return { valid: false, reason: 'binding belongs to another organization', binding: activeBinding };
    }

    if (activeBinding.principal_id !== (input.identityContext.principal_id ?? 'unknown')) {
      return { valid: false, reason: 'binding belongs to another principal', binding: activeBinding };
    }

    const storedReference = this.payloadReferences.get(activeBinding.binding_id);
    const currentReference = toBindingPayloadReference(input.request.payload);
    if (storedReference && JSON.stringify(storedReference) !== JSON.stringify(currentReference)) {
      return { valid: false, reason: 'binding payload reference mismatch', binding: activeBinding };
    }

    const expectedFingerprint = createBindingFingerprint({
      request: input.request,
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      principal_id: input.identityContext.principal_id ?? 'unknown'
    });
    if (activeBinding.request_fingerprint !== expectedFingerprint) {
      return { valid: false, reason: 'binding fingerprint mismatch', binding: activeBinding };
    }

    return { valid: true, binding: activeBinding };
  }

  consumeBinding(binding_id: string): DecisionBinding | undefined {
    const binding = this.bindings.get(binding_id);
    if (!binding) {
      return undefined;
    }
    const consumed = { ...binding, binding_state: 'consumed' as const };
    this.bindings.set(binding_id, consumed);
    return consumed;
  }

  revokeBinding(binding_id: string): DecisionBinding | undefined {
    const binding = this.bindings.get(binding_id);
    if (!binding) {
      return undefined;
    }
    const revoked = { ...binding, binding_state: 'revoked' as const };
    this.bindings.set(binding_id, revoked);
    return revoked;
  }

  get(binding_id: string): DecisionBinding | undefined {
    const binding = this.bindings.get(binding_id);
    return binding ? { ...binding, obligations: binding.obligations.map((obligation) => ({ ...obligation })) } : undefined;
  }

  list(): DecisionBinding[] {
    return [...this.bindings.values()].map((binding) => ({
      ...binding,
      obligations: binding.obligations.map((obligation) => ({ ...obligation }))
    }));
  }
}
