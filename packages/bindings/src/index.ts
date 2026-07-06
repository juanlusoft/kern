import {
  createDeterministicId,
  fingerprintCapabilityInput,
  fingerprintCoreRequest,
  normalizeCorrelationId,
  toBindingPayloadReference,
  type BindingPayloadReference,
  type CoreRequest,
  type CapabilityInvocationRequest,
  type DecisionBinding,
  type IdentityContext,
  type OrganizationContext,
  type PolicyDecision
} from '../../contracts/src/index';

export type BindingValidationReason =
  | 'missing_binding'
  | 'wrong_organization'
  | 'wrong_principal'
  | 'wrong_correlation'
  | 'fingerprint_mismatch'
  | 'expired'
  | 'revoked'
  | 'consumed'
  | 'missing_evidence_reference';

export interface BindingValidationResult {
  valid: boolean;
  invalid: boolean;
  reason?: BindingValidationReason;
  binding?: DecisionBinding;
  evidence_reference?: string;
  record_type?: 'binding_validated' | 'binding_rejected';
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
    capabilityInvocation?: CapabilityInvocationRequest | null;
  }): DecisionBinding {
    if (!input.evidence_reference.trim()) {
      throw new Error('binding requires evidence reference');
    }

    const now = input.now ?? (() => new Date());
    const payloadReference = toBindingPayloadReference(input.request.payload);
    const approved_capability_id = input.capabilityInvocation?.capability_id ?? null;
    const approved_input_fingerprint = input.capabilityInvocation
      ? fingerprintCapabilityInput(input.capabilityInvocation.input)
      : null;
    const request_fingerprint = createBindingFingerprint({
      request: input.request,
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      principal_id: input.identityContext.principal_id ?? 'unknown'
    });
    const binding: DecisionBinding = {
      binding_id: createDeterministicId('binding', {
        organization_id: input.organizationContext.organization_id,
        principal_id: input.identityContext.principal_id,
        correlation_id: normalizeCorrelationId(input.request),
        request_fingerprint,
        policy_decision_id: input.policyDecision.decision_id
      }),
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      principal_id: input.identityContext.principal_id ?? 'unknown',
      correlation_id: normalizeCorrelationId(input.request),
      request_fingerprint,
      policy_decision_id: input.policyDecision.decision_id,
      obligations: input.policyDecision.obligations,
      expires_at: new Date(now().getTime() + 5 * 60_000).toISOString(),
      binding_state: 'created',
      evidence_reference: input.evidence_reference,
      approved_capability_id,
      approved_input_fingerprint,
      approval_requirement: input.capabilityInvocation?.approval_requirement ?? null
    };
    this.bindings.set(binding.binding_id, binding);
    this.payloadReferences.set(binding.binding_id, payloadReference);
    return this.cloneBinding(binding);
  }

  validateBinding(input: {
    binding?: DecisionBinding | null;
    request: CoreRequest;
    organizationContext: OrganizationContext;
    identityContext: IdentityContext;
    capabilityInvocation?: CapabilityInvocationRequest | null;
    now?: () => Date;
  }): BindingValidationResult {
    const now = input.now ?? (() => new Date());
    if (!input.binding) {
      return {
        valid: false,
        invalid: true,
        reason: 'missing_binding',
        evidence_reference: undefined,
        record_type: 'binding_rejected'
      };
    }

    if (!input.binding.evidence_reference.trim()) {
      return {
        valid: false,
        invalid: true,
        reason: 'missing_evidence_reference',
        binding: this.rejectedBinding(input.binding),
        evidence_reference: input.binding.evidence_reference,
        record_type: 'binding_rejected'
      };
    }

    const stored = this.bindings.get(input.binding.binding_id);
    if (!stored) {
      return {
        valid: false,
        invalid: true,
        reason: 'missing_binding',
        binding: this.rejectedBinding(input.binding),
        evidence_reference: input.binding.evidence_reference,
        record_type: 'binding_rejected'
      };
    }

    const activeBinding = stored;
    if (new Date(activeBinding.expires_at).getTime() < now().getTime()) {
      return {
        valid: false,
        invalid: true,
        reason: 'expired',
        binding: this.expiredBinding(activeBinding),
        evidence_reference: activeBinding.evidence_reference,
        record_type: 'binding_rejected'
      };
    }

    if (activeBinding.organization_id !== (input.organizationContext.organization_id ?? 'unknown')) {
      return this.rejectBinding(activeBinding, 'wrong_organization');
    }

    if (activeBinding.principal_id !== (input.identityContext.principal_id ?? 'unknown')) {
      return this.rejectBinding(activeBinding, 'wrong_principal');
    }

    if (activeBinding.correlation_id !== normalizeCorrelationId(input.request)) {
      return this.rejectBinding(activeBinding, 'wrong_correlation');
    }

    if (input.capabilityInvocation) {
      if (activeBinding.approved_capability_id !== input.capabilityInvocation.capability_id) {
        return this.rejectBinding(activeBinding, 'fingerprint_mismatch');
      }

      const approvedFingerprint = activeBinding.approved_input_fingerprint;
      const currentFingerprint = fingerprintCapabilityInput(input.capabilityInvocation.input);
      if (approvedFingerprint && approvedFingerprint !== currentFingerprint) {
        return this.rejectBinding(activeBinding, 'fingerprint_mismatch');
      }
    }

    if (activeBinding.binding_state === 'revoked') {
      return {
        valid: false,
        invalid: true,
        reason: 'revoked',
        binding: this.cloneBinding(activeBinding),
        evidence_reference: activeBinding.evidence_reference,
        record_type: 'binding_rejected'
      };
    }

    if (activeBinding.binding_state === 'consumed') {
      return {
        valid: false,
        invalid: true,
        reason: 'consumed',
        binding: this.cloneBinding(activeBinding),
        evidence_reference: activeBinding.evidence_reference,
        record_type: 'binding_rejected'
      };
    }

    if (activeBinding.binding_state === 'expired') {
      return {
        valid: false,
        invalid: true,
        reason: 'expired',
        binding: this.cloneBinding(activeBinding),
        evidence_reference: activeBinding.evidence_reference,
        record_type: 'binding_rejected'
      };
    }

    const storedReference = this.payloadReferences.get(activeBinding.binding_id);
    const currentReference = toBindingPayloadReference(input.request.payload);
    if (storedReference && JSON.stringify(storedReference) !== JSON.stringify(currentReference)) {
      return this.rejectBinding(activeBinding, 'fingerprint_mismatch');
    }

    const expectedFingerprint = createBindingFingerprint({
      request: input.request,
      organization_id: input.organizationContext.organization_id ?? 'unknown',
      principal_id: input.identityContext.principal_id ?? 'unknown'
    });
    if (activeBinding.request_fingerprint !== expectedFingerprint) {
      return this.rejectBinding(activeBinding, 'fingerprint_mismatch');
    }

    const validated = this.storeBinding({ ...activeBinding, binding_state: 'validated' });
    return {
      valid: true,
      invalid: false,
      reason: undefined,
      binding: validated,
      evidence_reference: validated.evidence_reference,
      record_type: 'binding_validated'
    };
  }

  consumeBinding(binding_id: string): DecisionBinding | undefined {
    const binding = this.bindings.get(binding_id);
    if (!binding) {
      return undefined;
    }
    const consumed = this.storeBinding({ ...binding, binding_state: 'consumed' as const });
    return consumed;
  }

  revokeBinding(binding_id: string): DecisionBinding | undefined {
    const binding = this.bindings.get(binding_id);
    if (!binding) {
      return undefined;
    }
    return this.storeBinding({ ...binding, binding_state: 'revoked' as const });
  }

  get(binding_id: string): DecisionBinding | undefined {
    const binding = this.bindings.get(binding_id);
    return binding ? this.cloneBinding(binding) : undefined;
  }

  list(): DecisionBinding[] {
    return [...this.bindings.values()].map((binding) => this.cloneBinding(binding));
  }

  private storeBinding(binding: DecisionBinding): DecisionBinding {
    const stored = this.cloneBinding(binding);
    this.bindings.set(binding.binding_id, stored);
    return this.cloneBinding(stored);
  }

  private cloneBinding(binding: DecisionBinding): DecisionBinding {
    return {
      ...binding,
      obligations: binding.obligations.map((obligation) => ({ ...obligation }))
    };
  }

  private rejectBinding(binding: DecisionBinding, reason: Extract<BindingValidationReason, 'wrong_organization' | 'wrong_principal' | 'wrong_correlation' | 'fingerprint_mismatch'>): BindingValidationResult {
    const rejected = this.storeBinding({ ...binding, binding_state: 'rejected' });
    return {
      valid: false,
      invalid: true,
      reason,
      binding: rejected,
      evidence_reference: rejected.evidence_reference,
      record_type: 'binding_rejected'
    };
  }

  private expiredBinding(binding: DecisionBinding): DecisionBinding {
    return this.storeBinding({ ...binding, binding_state: 'expired' });
  }

  private rejectedBinding(binding: DecisionBinding): DecisionBinding {
    return this.storeBinding({ ...binding, binding_state: 'rejected' });
  }
}
