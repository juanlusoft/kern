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
export type GovernedWorkflowKind = 'mock.estimate.read' | 'mock.email.send';
export type WorkflowExecutionStatus =
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'denied'
  | 'unavailable'
  | 'not_found'
  | 'error'
  | 'requires_approval';
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
  | 'capability_result_bound'
  | 'preview_created'
  | 'approval_requested'
  | 'effect_blocked'
  | 'orchestration_requested'
  | 'model_orchestration_requested'
  | 'model_tool_call_received'
  | 'model_no_tool_call'
  | 'model_orchestration_error'
  | 'model_claimed_result_ignored'
  | 'orchestration_proposal_created'
  | 'orchestration_no_proposal'
  | 'orchestration_proposal_denied'
  | 'orchestration_proposal_blocked'
  | 'orchestration_proposal_validated'
  | 'orchestration_claimed_result_ignored'
  | 'workflow_invocation_requested'
  | 'external_read_requested'
  | 'external_read_denied'
  | 'external_read_blocked'
  | 'external_read_found'
  | 'external_read_not_found'
  | 'external_read_unavailable'
  | 'external_read_error'
  | 'source_evidence_recorded'
  | 'external_read_result_bound'
  | 'workflow_response_created'
  | 'channel_message_received'
  | 'channel_identity_resolved'
  | 'channel_identity_denied'
  | 'channel_message_denied'
  | 'channel_message_blocked'
  | 'channel_orchestration_requested'
  | 'channel_response_prepared'
  | 'channel_message_sent'
  | 'channel_message_send_error'
  | 'installation_config_loaded'
  | 'installation_config_validated'
  | 'installation_start_blocked'
  | 'module_registered'
  | 'module_activated'
  | 'module_missing'
  | 'secret_missing'
  | 'runtime_started'
  | 'runtime_message_received'
  | 'runtime_message_processed'
  | 'runtime_message_failed';

export type ResourceReadStatus = 'found' | 'not_found' | 'unavailable' | 'error' | 'denied' | 'blocked';
export type ResourcePaymentStatus = 'pending' | 'paid' | 'overdue';
export type PresenceStatus = 'inside' | 'outside' | 'unknown' | 'no_data' | 'unsupported';
export type PresenceDirection = 'in' | 'out' | 'neutral';
export type PresenceScopeKind = 'self' | 'organization' | 'explicit' | 'unsupported';

export interface PresenceSourceCitation {
  tables: string[];
  queryId: string;
  rowCount: number;
  truncated: boolean;
}

export interface PresenceScope {
  kind: PresenceScopeKind;
  requester_principal_id: string;
  organization_id: string;
  employee_ids: string[];
  reason: string;
}

export interface PresenceEmployeeRecord {
  employee_id: string;
  principal_id: string | null;
  display_name: string;
  email: string | null;
  active: boolean;
}

export interface PresenceEmployeeFindParams {
  organization_id: string;
  correlation_id: string;
  term: string;
  limit: number;
}

export interface PresenceEmployeeFindResult {
  query_id: 'employee.find';
  organization_id: string;
  correlation_id: string;
  search_term: string;
  records: PresenceEmployeeRecord[];
  truncated: boolean;
  citations: [PresenceSourceCitation, ...PresenceSourceCitation[]];
}

export interface PresencePunchRecord {
  punch_id: string;
  employee_id: string;
  display_name: string;
  direction: PresenceDirection;
  punched_at: string;
  source_table: string;
  source_record_id: string;
}

export interface PresencePunchesListParams {
  organization_id: string;
  correlation_id: string;
  employee_id: string | null;
  limit: number;
  offset: number;
}

export interface PresencePunchesListResult {
  query_id: 'punches.list';
  organization_id: string;
  correlation_id: string;
  employee_id: string | null;
  records: PresencePunchRecord[];
  truncated: boolean;
  citations: [PresenceSourceCitation, ...PresenceSourceCitation[]];
}

export interface PresenceCurrentParams {
  organization_id: string;
  correlation_id: string;
  scope: PresenceScope;
  active_window_days?: number;
  current_window_hours?: number;
}

export interface PresenceCurrentResult {
  query_id: 'presence.current';
  organization_id: string;
  correlation_id: string;
  scope: PresenceScope;
  status: PresenceStatus;
  employee_id: string | null;
  display_name: string | null;
  direction: PresenceDirection | null;
  observed_at: string | null;
  row_count: number;
  truncated: boolean;
  citations: PresenceSourceCitation[];
}

export interface PresenceReadPort {
  findEmployee(input: PresenceEmployeeFindParams): PresenceEmployeeFindResult;
  listPunches(input: PresencePunchesListParams): PresencePunchesListResult;
  currentPresence(input: PresenceCurrentParams): PresenceCurrentResult;
}

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

export interface WorkflowStep {
  step_id: string;
  step_kind: 'intent' | 'policy' | 'turn' | 'preview' | 'approval_requested' | 'binding' | 'capability' | 'response';
  status: WorkflowExecutionStatus;
  evidence_reference: string | null;
  details: Record<string, unknown>;
}

export interface WorkflowEvidenceTrace {
  evidence_ids: string[];
  record_types: EvidenceRecordType[];
}

export interface SourceEvidence {
  source_id: string;
  source_type: string;
  source_system: string;
  resource_id: string;
  record_id: string;
  field_path: string;
  observed_at: string;
  correlation_id: string;
}

export interface ResourceListAggregate {
  count: number;
  paymentsPendingTotal: number;
  totalAmount: number;
}

export interface ResourceListRecord {
  record_id: string;
  resource_type: 'estimate' | 'invoice';
  payment_status: ResourcePaymentStatus | null;
  status: number | null;
  paymentsPending: number | null;
  dueDate: number | null;
  total: number | null;
  docNumber: string | null;
  contactName: string | null;
  source_evidence: [SourceEvidence, ...SourceEvidence[]];
  data: Record<string, unknown>;
}

export interface ResourceListResultData {
  kind: 'list';
  result_mode: 'list';
  resource_type: 'estimate' | 'invoice';
  payment_status: ResourcePaymentStatus | null;
  lookup_mode: 'by_status' | 'by_customer' | 'by_year' | 'latest_n';
  customer?: string | null;
  year?: string | null;
  records: [ResourceListRecord, ...ResourceListRecord[]] | ResourceListRecord[];
  aggregate: ResourceListAggregate;
}

export interface ExternalReadAdapterAuthorization {
  adapter_id: string;
  source_system: string;
  organization_id: string | null;
  correlation_id: string;
  actor: TurnActor | null;
  authorized: boolean;
  reason: string;
}

export interface ExternalReadAdapterDecision {
  query_id: string;
  adapter_id: string;
  source_system: string;
  status: ResourceReadStatus;
  reason: string;
  authorization: ExternalReadAdapterAuthorization;
}

interface ResourceResultBase {
  query_id: string;
  organization_id: string;
  correlation_id: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
  evidence_links: string[];
  produced_by_adapter: boolean;
  decision: ExternalReadAdapterDecision;
}

export interface ResourceFoundResult extends ResourceResultBase {
  status: 'found';
  data: Record<string, unknown>;
  source_evidence: [SourceEvidence, ...SourceEvidence[]];
  error: null;
  produced_by_adapter: true;
}

export interface ExternalResourceNotFound extends ResourceResultBase {
  status: 'not_found';
  data: null;
  source_evidence: null;
  error: string;
}

export interface ExternalSystemUnavailable extends ResourceResultBase {
  status: 'unavailable';
  data: null;
  source_evidence: null;
  error: string;
}

export interface ExternalSystemError extends ResourceResultBase {
  status: 'error';
  data: null;
  source_evidence: null;
  error: string;
}

export interface ExternalReadAdapterDeniedResult extends ResourceResultBase {
  status: 'denied';
  data: null;
  source_evidence: null;
  error: string;
}

export interface ExternalReadAdapterBlockedResult extends ResourceResultBase {
  status: 'blocked';
  data: null;
  source_evidence: null;
  error: string;
}

export type ResourceResult =
  | ResourceFoundResult
  | ExternalResourceNotFound
  | ExternalSystemUnavailable
  | ExternalSystemError
  | ExternalReadAdapterDeniedResult
  | ExternalReadAdapterBlockedResult;

export interface ResourceQuery {
  query_id: string;
  organization_id: string | null;
  correlation_id: string | null;
  actor: TurnActor | null;
  resource_type: string;
  limit?: number | null;
  payment_status?: ResourcePaymentStatus | null;
  year?: string | null;
  resource_id: string | null;
  customer_id?: string | null;
  filters: Record<string, unknown> | null;
  requested_fields: string[] | null;
  claimed_result?: unknown;
  model_claimed_result?: unknown;
  caller_result?: unknown;
  assistant_result?: unknown;
}

export interface ExternalReadAdapter {
  adapter_id: string;
  source_system: string;
  authorize(query: ResourceQuery): ExternalReadAdapterAuthorization;
  read(query: ResourceQuery): ResourceResult;
}

export interface GovernedWorkflowResponse {
  response_source: 'runtime_result' | 'workflow_blocked';
  workflow_kind: GovernedWorkflowKind;
  status: WorkflowExecutionStatus;
  message: string;
  data: Record<string, unknown> | null;
}

export interface GovernedWorkflowResult {
  workflow_id: string;
  workflow_kind: GovernedWorkflowKind;
  organization_id: string | null;
  correlation_id: string;
  turn_id: string | null;
  status: WorkflowExecutionStatus;
  response: GovernedWorkflowResponse;
  capability_result: CapabilityInvocationResult | null;
  evidence_links: string[];
  created_at: string;
  updated_at: string;
  steps: WorkflowStep[];
  evidence_trace: WorkflowEvidenceTrace;
}

export interface GovernedWorkflowRequestBase {
  workflow_id: string;
  organization_hint?: string | null;
  principal_hint?: string | null;
  correlation_id?: string | null;
  requested_at?: string | null;
  claimed_result?: unknown;
  claimed_output?: unknown;
  caller_result?: unknown;
  assistant_result?: unknown;
  model_claimed_result?: unknown;
}

export interface MockReadEstimateWorkflowInput extends GovernedWorkflowRequestBase {
  kind: 'mock.estimate.read';
  resource_type?: 'estimate' | 'invoice';
  limit?: number | null;
  payment_status?: ResourcePaymentStatus | null;
  year?: string | null;
  estimate_id?: string | null;
  customer_id?: string | null;
  capability_id?: string | null;
}

export interface MockEmailSendWorkflowInput extends GovernedWorkflowRequestBase {
  kind: 'mock.email.send';
  to: string;
  subject: string;
  body: string;
  approval_decision?: 'approved' | 'denied' | null;
  approval_binding_id?: string | null;
  capability_preview_id?: string | null;
  preview_note?: string | null;
  capability_id?: string | null;
}

export type GovernedWorkflowRequest = MockReadEstimateWorkflowInput | MockEmailSendWorkflowInput;

export type OrchestrationStatus = 'proposal' | 'no_proposal' | 'denied' | 'blocked' | 'error';

export interface OrchestrationContext {
  installation_id: string | null;
  active_capabilities: string[];
  metadata: Record<string, unknown>;
  force_capability_key?: string | null;
  force_params?: Record<string, unknown> | null;
}

export interface OrchestrationRequest {
  request_id: string;
  user_message: string;
  organization_id: string | null;
  principal_id: string | null;
  actor: TurnActor | null;
  correlation_id: string;
  installation_id?: string | null;
  context?: OrchestrationContext | null;
  claimed_result?: unknown;
  model_claimed_result?: unknown;
  caller_result?: unknown;
  assistant_result?: unknown;
  claimed_output?: unknown;
}

export interface OrchestrationProposal {
  proposal_id: string;
  capability_key: string;
  params: Record<string, unknown>;
  confidence: number | null;
  reason: string | null;
  evidence_links?: string[];
}

export interface OrchestrationValidationResult {
  valid: boolean;
  status: OrchestrationStatus;
  reason: string;
  capability_key: string | null;
  params: Record<string, unknown> | null;
  capability_active: boolean;
  capability_known: boolean;
}

export interface OrchestrationResponse {
  response_source: 'runtime_result' | 'workflow_blocked';
  workflow_kind: GovernedWorkflowKind | null;
  status: OrchestrationStatus | WorkflowExecutionStatus;
  message: string;
  data: Record<string, unknown> | null;
}

export interface OrchestrationOutcome {
  request_id: string;
  organization_id: string | null;
  principal_id: string | null;
  correlation_id: string;
  installation_id: string | null;
  status: OrchestrationStatus;
  proposal: OrchestrationProposal | null;
  validation: OrchestrationValidationResult | null;
  workflow_kind: GovernedWorkflowKind | null;
  workflow_result: GovernedWorkflowResult | null;
  response: OrchestrationResponse;
  evidence_links: string[];
  created_at: string;
  updated_at: string;
  reason: string;
}

export type ChannelDeliveryStatus = 'sent' | 'denied' | 'blocked' | 'error' | 'skipped';

export interface InboundMessage {
  channel: string;
  message_id: string;
  chat_id: string;
  user_id: string;
  text: string;
  received_at: string;
  raw?: unknown;
}

export interface OutboundMessage {
  channel: string;
  chat_id: string;
  text: string;
  reply_to_message_id?: string | null;
  correlation_id: string;
  raw?: unknown;
}

export interface TelegramChannelUpdateMessage {
  message_id: string | number;
  chat: {
    id: string | number;
    type: string;
  };
  from?: {
    id: string | number;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  text?: string | null;
  date?: number | null;
  raw?: unknown;
}

export interface TelegramChannelUpdate {
  update_id: number;
  message: TelegramChannelUpdateMessage | null;
  raw?: unknown;
}

export interface TelegramOutboundMessage extends OutboundMessage {
  update_id?: number | null;
  parse_mode?: 'Markdown' | 'HTML' | null;
  source_evidence?: string[] | null;
  data?: Record<string, unknown> | null;
}

export interface ChannelIdentityMapping {
  channel: 'telegram';
  telegram_user_id: string;
  telegram_chat_id: string;
  organization_id: string;
  principal_id: string;
  installation_id: string;
  principal_type?: PrincipalType | null;
  active: boolean;
  display_name?: string | null;
}

export interface ChannelInstallationConfig {
  channel: 'telegram';
  installation_id: string;
  active: boolean;
  bot_token: string | null;
  identity_mappings: ChannelIdentityMapping[];
}

export interface ChannelMessageResult {
  channel: 'telegram';
  status: ChannelDeliveryStatus;
  reason: string;
  correlation_id: string;
  inbound_message: InboundMessage | null;
  outbound_message: TelegramOutboundMessage | null;
  organization_id: string | null;
  principal_id: string | null;
  installation_id: string | null;
  orchestration_outcome: OrchestrationOutcome | null;
  evidence_links: string[];
}

export interface ChannelAdapter {
  channel: string;
  handleInboundMessage(message: InboundMessage): ChannelMessageResult;
}

export interface OrchestratorPort {
  propose(request: OrchestrationRequest): OrchestrationOutcome;
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

function normalizeOptionalLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function normalizeResourceQuery(input: unknown): ResourceQuery {
  const candidate = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const actorCandidate = candidate.actor && typeof candidate.actor === 'object' ? (candidate.actor as Record<string, unknown>) : null;
  const requestedFields = Array.isArray(candidate.requested_fields)
    ? candidate.requested_fields.filter((field): field is string => typeof field === 'string' && field.trim().length > 0)
    : null;
  return {
    query_id: typeof candidate.query_id === 'string' ? candidate.query_id : '',
    organization_id: typeof candidate.organization_id === 'string' ? candidate.organization_id : null,
    correlation_id: typeof candidate.correlation_id === 'string' ? candidate.correlation_id : null,
    actor: actorCandidate
      ? {
          principal_id: typeof actorCandidate.principal_id === 'string' ? actorCandidate.principal_id : '',
          principal_type:
            actorCandidate.principal_type === 'human' ||
            actorCandidate.principal_type === 'service' ||
            actorCandidate.principal_type === 'agent'
              ? actorCandidate.principal_type
              : null,
          delegated_identity: typeof actorCandidate.delegated_identity === 'string' ? actorCandidate.delegated_identity : null
        }
      : null,
    resource_type: typeof candidate.resource_type === 'string' ? candidate.resource_type : '',
    limit: normalizeOptionalLimit(candidate.limit),
    payment_status:
      candidate.payment_status === 'pending' || candidate.payment_status === 'paid' || candidate.payment_status === 'overdue'
        ? candidate.payment_status
        : null,
    year: typeof candidate.year === 'string' && candidate.year.trim().length > 0 ? candidate.year.trim() : null,
    resource_id: typeof candidate.resource_id === 'string' ? candidate.resource_id : null,
    filters: candidate.filters && typeof candidate.filters === 'object' ? (candidate.filters as Record<string, unknown>) : null,
    requested_fields: requestedFields,
    claimed_result: candidate.claimed_result ?? null,
    model_claimed_result: candidate.model_claimed_result ?? null,
    caller_result: candidate.caller_result ?? null,
    assistant_result: candidate.assistant_result ?? null
  };
}

export function fingerprintResourceQuery(query: ResourceQuery): string {
  return stableStringify({
    query_id: query.query_id,
    organization_id: query.organization_id,
    correlation_id: query.correlation_id,
    actor: query.actor,
    resource_type: query.resource_type,
    limit: query.limit ?? null,
    payment_status: query.payment_status,
    year: query.year,
    resource_id: query.resource_id,
    filters: query.filters,
    requested_fields: query.requested_fields ? [...query.requested_fields].sort() : null
  });
}

export function createSourceEvidence(input: {
  source_id: string;
  source_type: string;
  source_system: string;
  resource_id: string;
  record_id: string;
  field_path: string;
  observed_at: string;
  correlation_id: string;
}): SourceEvidence {
  return {
    source_id: input.source_id,
    source_type: input.source_type,
    source_system: input.source_system,
    resource_id: input.resource_id,
    record_id: input.record_id,
    field_path: input.field_path,
    observed_at: input.observed_at,
    correlation_id: input.correlation_id
  };
}

export function validateResourceResult(result: ResourceResult): ResourceResult {
  if (result.status === 'found') {
    const hasSourceEvidence = Array.isArray(result.source_evidence) && result.source_evidence.length > 0;
    const hasData = result.data && typeof result.data === 'object' && !Array.isArray(result.data);
    if (!hasSourceEvidence || !hasData) {
      return {
        query_id: result.query_id,
        organization_id: result.organization_id,
        correlation_id: result.correlation_id,
        resource_type: result.resource_type,
        resource_id: result.resource_id,
        created_at: result.created_at,
        evidence_links: [...result.evidence_links],
        produced_by_adapter: false,
        status: 'error',
        data: null,
        source_evidence: null,
        error: 'found result requires source evidence and data',
        decision: {
          ...result.decision,
          status: 'error',
          reason: 'found result requires source evidence and data'
        }
      };
    }
  }

  return {
    ...result,
    evidence_links: [...result.evidence_links],
    decision: {
      ...result.decision,
      authorization: {
        ...result.decision.authorization,
        actor: result.decision.authorization.actor
          ? {
              ...result.decision.authorization.actor
            }
          : null
      }
    },
    source_evidence:
      result.status === 'found' && result.source_evidence
        ? result.source_evidence.map((sourceEvidence) => ({ ...sourceEvidence }))
        : null,
    data: result.status === 'found' ? structuredClone(result.data) : null
  } as ResourceResult;
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
