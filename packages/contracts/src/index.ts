export type DecisionOutcome = 'allow' | 'deny' | 'defer' | 'failed_closed';
export type GovernedExecutionStatus = 'allowed' | 'denied' | 'deferred' | 'failed_closed';
export type PrincipalType = 'human' | 'service' | 'agent';
export type OrganizationState = 'active' | 'inactive' | 'failed_closed';
export type ResolutionState = 'resolved' | 'failed_closed';
export type BindingState = 'created' | 'validated' | 'consumed' | 'revoked' | 'expired' | 'rejected';
export type TurnState =
  | 'created'
  | 'evaluating'
  | 'waiting_for_approval'
  | 'executing'
  | 'waiting_for_external_result'
  | 'waiting_for_reconciliation'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';
export type TurnEffectState =
  | 'planned'
  | 'binding_created'
  | 'executing'
  | 'point_of_no_return'
  | 'succeeded'
  | 'failed'
  | 'unknown_outcome'
  | 'cancelled';
export type ReconciliationState = 'not_requested' | 'requested' | 'closed';
export type CapabilityKind = 'read_only' | 'effectful';
export type CapabilityInvocationStatus = 'executed' | 'unavailable' | 'error' | 'not_found' | 'denied';
export type CapabilityRuntimeDecision = CapabilityInvocationStatus;
export type EvidenceRecordType =
  | 'intent'
  | 'organization_resolved'
  | 'identity_resolved'
  | 'policy_decision'
  | 'binding_created'
  | 'binding_validated'
  | 'binding_rejected'
  | 'execution_blocked'
  | 'failed_closed'
  | 'turn_created'
  | 'turn_transitioned'
  | 'effect_registered'
  | 'point_of_no_return_reached'
  | 'unknown_outcome_detected'
  | 'reconciliation_requested'
  | 'reconciliation_completed'
  | 'turn_completed'
  | 'turn_blocked'
  | 'capability_invocation_requested'
  | 'capability_invocation_denied'
  | 'capability_invocation_started'
  | 'capability_invocation_completed'
  | 'capability_invocation_unavailable'
  | 'capability_invocation_error'
  | 'capability_invocation_not_found'
  | 'capability_result_bound';

export interface CoreRequestFlags {
  force_policy_deny?: boolean;
  force_policy_defer?: boolean;
  missing_critical_attribute?: boolean;
  obligation_incomplete?: boolean;
  attempt_human_impersonation?: boolean;
  delegated_identity_exceeds_principal?: boolean;
  agent_selected_organization?: boolean;
}

export interface CoreRequestPayload {
  resource: string;
  operation: string;
  requested_scope: string | string[] | null;
  classification: string | null;
  destination: string | null;
  amount: number | null;
  flags: CoreRequestFlags;
}

export interface PolicyInputAttributes {
  resource: string;
  operation: string;
  requested_scope: string[];
  classification: string | null;
  destination: string | null;
  amount: number | null;
  flags: CoreRequestFlags;
}

export interface BindingPayloadReference {
  resource: string;
  operation: string;
  requested_scope: string[];
  classification: string | null;
  destination: string | null;
  amount: number | null;
  flags: CoreRequestFlags;
}

export interface CoreRequest {
  request_id: string;
  organization_hint?: string | null;
  principal_hint?: string | null;
  action: string;
  purpose: string;
  payload: CoreRequestPayload;
  requires_binding: boolean;
  correlation_id?: string | null;
  capability_invocation?: CapabilityInvocationRequest | null;
}

export interface OrganizationContext {
  organization_id: string | null;
  organization_state: OrganizationState;
  source: string;
  resolved_at: string | null;
  isolation_boundary: string | null;
  revocation_version: number | null;
  resolution_state: ResolutionState;
  failure_reason: string | null;
}

export interface IdentityContext {
  principal_id: string | null;
  principal_type: PrincipalType | null;
  delegated_identity: string | null;
  scopes: string[];
  auth_method: string | null;
  resolved_at: string | null;
  revocation_version: number | null;
  resolution_state: ResolutionState;
  failure_reason: string | null;
}

export interface PolicyObligation {
  obligation_id: string;
  obligation_type: 'binding' | 'approval' | 'notification' | 'audit' | 'limit' | 'other';
  description: string;
  required: boolean;
  status: 'pending' | 'satisfied' | 'blocked';
}

export interface PolicyDecision {
  decision_id: string;
  allow: boolean;
  deny: boolean;
  defer: boolean;
  failed_closed: boolean;
  outcome: DecisionOutcome;
  obligations: PolicyObligation[];
  missing_critical_attributes: string[];
  decision_reason: string;
  evaluated_at: string;
  policy_version: string;
}

export interface EvidenceRecord {
  evidence_id: string;
  organization_id: string;
  correlation_id: string;
  record_type: EvidenceRecordType;
  subject: string;
  created_at: string;
  sequence: number;
  data: Record<string, unknown>;
}

export interface DecisionBinding {
  binding_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  request_fingerprint: string;
  policy_decision_id: string;
  obligations: PolicyObligation[];
  expires_at: string;
  binding_state: BindingState;
  evidence_reference: string;
  approved_capability_id: string | null;
  approved_input_fingerprint: string | null;
  approval_requirement?: CapabilityApprovalRequirement | null;
}

export interface CapabilityApprovalRequirement {
  required: boolean;
  reason: string;
  binding_required: boolean;
}

export interface CapabilityMockResult {
  status: CapabilityInvocationStatus;
  output: CapabilityOutput | null;
  error: string | null;
}

export interface CapabilityMock {
  invoke(input: CapabilityInvocationRequest): CapabilityMockResult;
}

export interface CapabilityInput {
  purpose: string;
  payload: Record<string, unknown>;
  requested_scope: string[];
}

export interface CapabilityOutput {
  capability_id: string;
  status: CapabilityRuntimeDecision;
  result: Record<string, unknown>;
  processed_at: string;
}

export interface CapabilityDefinition {
  capability_id: string;
  organization_id: string;
  title: string;
  description: string;
  kind: CapabilityKind;
  version: string;
  enabled: boolean;
  approval_requirement: CapabilityApprovalRequirement | null;
  mock: CapabilityMock | null;
}

export interface CapabilityInvocationRequest {
  capability_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  input: CapabilityInput;
  binding_id?: string | null;
  decision_binding_id?: string | null;
  policy_decision_id?: string | null;
  approval_requirement?: CapabilityApprovalRequirement | null;
  evidence_reference?: string | null;
  requested_at?: string | null;
  claimed_result?: unknown;
  claimed_output?: unknown;
  caller_result?: unknown;
  assistant_result?: unknown;
  model_claimed_result?: unknown;
}

export interface CapabilityInvocationResult {
  invocation_id: string;
  capability_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  status: CapabilityInvocationStatus;
  runtime_decision: CapabilityRuntimeDecision;
  binding_id: string | null;
  decision_binding_id: string | null;
  policy_decision_id: string | null;
  executed_by_runtime: boolean;
  output: CapabilityOutput | null;
  error: string | null;
  evidence_links: string[];
  created_at: string;
  evidence_reference: string | null;
  reason: string;
}

export interface CapabilityRegistry {
  register(capability: CapabilityDefinition): CapabilityDefinition;
  get(capability_id: string): CapabilityDefinition | undefined;
  list(): CapabilityDefinition[];
  has(capability_id: string): boolean;
}

export interface TurnActor {
  principal_id: string;
  principal_type: PrincipalType | null;
  delegated_identity: string | null;
}

export interface TurnExecutionContext {
  request_id: string;
  request_fingerprint: string;
  policy_decision_id: string | null;
  binding_id: string | null;
  requires_binding: boolean;
}

export interface TurnEffect {
  effect_id: string;
  binding_id: string | null;
  state: TurnEffectState;
  point_of_no_return_reached: boolean;
  evidence_reference: string | null;
}

export interface UnknownOutcome {
  unknown_outcome_id: string;
  effect_id: string;
  reason: string;
  detected_at: string;
  evidence_reference: string | null;
  requires_reconciliation: boolean;
}

export interface TurnTransition {
  transition_id: string;
  turn_id: string;
  from_state: TurnState;
  to_state: TurnState;
  reason: string;
  effect_id: string | null;
  created_at: string;
}

export interface Turn {
  turn_id: string;
  organization_id: string;
  correlation_id: string;
  actor: TurnActor;
  state: TurnState;
  execution_context: TurnExecutionContext;
  pending_effects: TurnEffect[];
  unknown_outcomes: UnknownOutcome[];
  evidence_links: string[];
  reconciliation_state: ReconciliationState;
  created_at: string;
  updated_at: string;
}

export interface TurnTransitionResult {
  valid: boolean;
  invalid: boolean;
  reason: string | null;
  turn: Turn;
  transition: TurnTransition | null;
  evidence_record: EvidenceRecord | null;
  record_type: EvidenceRecordType | null;
}

export interface GovernedExecutionResult {
  status: GovernedExecutionStatus;
  correlation_id: string;
  organization_context: OrganizationContext;
  identity_context: IdentityContext;
  policy_decision: PolicyDecision;
  evidence_records: EvidenceRecord[];
  binding: DecisionBinding | null;
  turn_id?: string | null;
  capability_invocation_id?: string | null;
  capability_result?: CapabilityInvocationResult | null;
  reason: string;
}

export function normalizeCorrelationId(request: Pick<CoreRequest, 'request_id' | 'correlation_id'>): string {
  const candidate = request.correlation_id?.trim();
  return candidate && candidate.length > 0 ? candidate : request.request_id.trim();
}

export function normalizeRequestedScope(requested_scope: CoreRequestPayload['requested_scope']): string[] {
  if (Array.isArray(requested_scope)) {
    return requested_scope.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0);
  }
  if (typeof requested_scope === 'string' && requested_scope.trim().length > 0) {
    return [requested_scope];
  }
  return [];
}

export function toPolicyInputAttributes(payload: CoreRequestPayload): PolicyInputAttributes {
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

export function toBindingPayloadReference(payload: CoreRequestPayload): BindingPayloadReference {
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

export function stableStringify(value: unknown): string {
  return serialize(value);
}

export function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createDeterministicId(prefix: string, seed: unknown): string {
  return `${prefix}_${hashString(stableStringify(seed))}`;
}

export function fingerprintCoreRequest(input: {
  request: CoreRequest;
  organization_id: string;
  principal_id: string;
}): string {
  return stableStringify({
    request_id: input.request.request_id,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    action: input.request.action,
    purpose: input.request.purpose,
    payload: toBindingPayloadReference(input.request.payload),
    requires_binding: input.request.requires_binding,
    correlation_id: normalizeCorrelationId(input.request)
  });
}

export function fingerprintCapabilityInput(input: CapabilityInput): string {
  return stableStringify({
    purpose: input.purpose,
    payload: input.payload,
    requested_scope: [...input.requested_scope].sort()
  });
}

export function fingerprintCapabilityInvocation(input: CapabilityInvocationRequest): string {
  return stableStringify({
    capability_id: input.capability_id,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    correlation_id: input.correlation_id,
    binding_id: input.binding_id ?? null,
    policy_decision_id: input.policy_decision_id ?? null,
    approval_requirement: input.approval_requirement ?? null,
    evidence_reference: input.evidence_reference ?? null,
    input: fingerprintCapabilityInput(input.input),
    requested_at: input.requested_at ?? null
  });
}

export function createEvidenceRecord(input: {
  organization_id: string;
  correlation_id: string;
  record_type: EvidenceRecordType;
  subject: string;
  data: Record<string, unknown>;
  created_at?: string;
  sequence?: number;
}): EvidenceRecord {
  const created_at = input.created_at ?? new Date().toISOString();
  const sequence = input.sequence ?? 0;
  return {
    evidence_id: createDeterministicId('evidence', {
      organization_id: input.organization_id,
      correlation_id: input.correlation_id,
      record_type: input.record_type,
      subject: input.subject,
      created_at,
      sequence
    }),
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    record_type: input.record_type,
    subject: input.subject,
    created_at,
    sequence,
    data: input.data
  };
}

export function createPolicyDecision(input: {
  outcome: DecisionOutcome;
  obligations?: PolicyObligation[];
  missing_critical_attributes?: string[];
  decision_reason: string;
  policy_version?: string;
  evaluated_at?: string;
  seed: unknown;
}): PolicyDecision {
  const evaluated_at = input.evaluated_at ?? new Date().toISOString();
  const obligations = input.obligations ?? [];
  const missing_critical_attributes = input.missing_critical_attributes ?? [];
  const outcome = input.outcome;
  return {
    decision_id: createDeterministicId('decision', { outcome, seed: input.seed, evaluated_at }),
    allow: outcome === 'allow',
    deny: outcome === 'deny',
    defer: outcome === 'defer',
    failed_closed: outcome === 'failed_closed',
    outcome,
    obligations,
    missing_critical_attributes,
    decision_reason: input.decision_reason,
    evaluated_at,
    policy_version: input.policy_version ?? 'm1-stub-1'
  };
}

function serialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serialize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${serialize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}
