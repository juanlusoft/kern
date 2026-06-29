import {
  createDeterministicId,
  createEvidenceRecord,
  type EvidenceRecord,
  type EvidenceRecordType,
  type ReconciliationState,
  type Turn,
  type TurnActor,
  type TurnEffect,
  type TurnEffectState,
  type TurnExecutionContext,
  type TurnState,
  type TurnTransition,
  type TurnTransitionResult,
  type UnknownOutcome
} from '../../contracts/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';

export interface TurnRuntimeOptions {
  evidenceLedger?: InMemoryEvidenceLedger;
  now?: () => Date;
}

export interface CreateTurnInput {
  organization_id: string;
  correlation_id: string;
  actor: TurnActor;
  execution_context: TurnExecutionContext;
  now?: () => Date;
}

export interface TurnMutationResult {
  valid: boolean;
  invalid: boolean;
  reason: string | null;
  turn: Turn;
  effect: TurnEffect | null;
  unknown_outcome: UnknownOutcome | null;
  evidence_record: EvidenceRecord | null;
  record_type: EvidenceRecordType | null;
}

interface TurnStoreEntry {
  turn: Turn;
  effectsById: Map<string, TurnEffect>;
  unknownOutcomesById: Map<string, UnknownOutcome>;
}

const TERMINAL_STATES: ReadonlySet<TurnState> = new Set(['completed', 'failed', 'cancelled', 'expired']);

const ALLOWED_TRANSITIONS: ReadonlyMap<TurnState, readonly TurnState[]> = new Map([
  ['created', ['evaluating']],
  ['evaluating', ['waiting_for_approval', 'executing', 'failed', 'cancelled']],
  ['waiting_for_approval', ['executing', 'cancelled', 'expired']],
  ['executing', ['waiting_for_external_result', 'waiting_for_reconciliation', 'completed', 'failed', 'cancelled']],
  ['waiting_for_external_result', ['waiting_for_reconciliation', 'completed', 'failed', 'cancelled']],
  ['waiting_for_reconciliation', ['completed', 'failed', 'cancelled']],
  ['completed', []],
  ['failed', []],
  ['cancelled', []],
  ['expired', []]
]);

export class InMemoryTurnRuntime {
  private readonly turns = new Map<string, TurnStoreEntry>();
  private readonly evidenceLedger?: InMemoryEvidenceLedger;
  private readonly now: () => Date;

  constructor(options: TurnRuntimeOptions = {}) {
    this.evidenceLedger = options.evidenceLedger;
    this.now = options.now ?? (() => new Date());
  }

  createTurn(input: CreateTurnInput): Turn {
    const created_at = this.now().toISOString();
    const turn: Turn = {
      turn_id: createDeterministicId('turn', {
        organization_id: input.organization_id,
        correlation_id: input.correlation_id,
        actor: input.actor,
        execution_context: input.execution_context,
        created_at
      }),
      organization_id: input.organization_id,
      correlation_id: input.correlation_id,
      actor: this.cloneActor(input.actor),
      state: 'created',
      execution_context: this.cloneExecutionContext(input.execution_context),
      pending_effects: [],
      unknown_outcomes: [],
      evidence_links: [],
      reconciliation_state: 'not_requested',
      created_at,
      updated_at: created_at
    };
    this.turns.set(turn.turn_id, {
      turn: this.cloneTurn(turn),
      effectsById: new Map(),
      unknownOutcomesById: new Map()
    });
    this.appendEvidence(turn.turn_id, input.organization_id, input.correlation_id, 'turn_created', 'turn_created', {
      state: turn.state,
      actor: turn.actor,
      execution_context: turn.execution_context
    });
    return this.getRequiredTurn(turn.turn_id);
  }

  getTurn(turn_id: string): Turn | undefined {
    const entry = this.turns.get(turn_id);
    return entry ? this.cloneTurn(entry.turn) : undefined;
  }

  transitionTurn(input: {
    turn_id: string;
    to_state: TurnState;
    reason: string;
    effect_id?: string | null;
    now?: () => Date;
  }): TurnTransitionResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidTransitionResult({
        turn: this.buildMissingTurn(input.turn_id),
        reason: 'turn_missing',
        record_type: 'turn_blocked'
      });
    }

    const current = entry.turn;
    const allowed = ALLOWED_TRANSITIONS.get(current.state) ?? [];
    if (TERMINAL_STATES.has(current.state)) {
      return this.blockTransition(entry, input, 'terminal_state');
    }

    if (!allowed.includes(input.to_state)) {
      return this.blockTransition(entry, input, 'invalid_transition');
    }

    if (input.to_state === 'completed' && !this.canCompleteTurn(entry)) {
      return this.blockTransition(entry, input, this.buildCompletionBlockReason(entry));
    }

    if (
      current.state === 'waiting_for_reconciliation' &&
      ['completed', 'failed', 'cancelled'].includes(input.to_state) &&
      current.reconciliation_state !== 'closed'
    ) {
      return this.blockTransition(entry, input, 'reconciliation_pending');
    }

    const updated_at = (input.now ?? this.now)().toISOString();
    const transition: TurnTransition = {
      transition_id: createDeterministicId('turn-transition', {
        turn_id: current.turn_id,
        from_state: current.state,
        to_state: input.to_state,
        reason: input.reason,
        effect_id: input.effect_id ?? null,
        updated_at
      }),
      turn_id: current.turn_id,
      from_state: current.state,
      to_state: input.to_state,
      reason: input.reason,
      effect_id: input.effect_id ?? null,
      created_at: updated_at
    };

    current.state = input.to_state;
    current.updated_at = updated_at;
    this.storeTurn(current, entry.effectsById, entry.unknownOutcomesById);

    const recordType: EvidenceRecordType = input.to_state === 'completed' ? 'turn_completed' : 'turn_transitioned';
    const evidence_record = this.appendEvidence(current.turn_id, current.organization_id, current.correlation_id, recordType, 'turn_transition', {
      transition,
      state: current.state,
      reason: input.reason
    });

    return {
      valid: true,
      invalid: false,
      reason: null,
      turn: this.cloneTurn(current),
      transition,
      evidence_record,
      record_type: recordType
    };
  }

  addPendingEffect(input: {
    turn_id: string;
    binding_id?: string | null;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidMutationResult('turn_missing');
    }

    if (TERMINAL_STATES.has(entry.turn.state)) {
      return this.buildInvalidMutationResult('terminal_state', entry.turn);
    }

    const updated_at = (input.now ?? this.now)().toISOString();
    const effect: TurnEffect = {
      effect_id: createDeterministicId('effect', {
        turn_id: entry.turn.turn_id,
        binding_id: input.binding_id ?? null,
        created_at: updated_at
      }),
      binding_id: input.binding_id ?? null,
      state: 'planned',
      point_of_no_return_reached: false,
      evidence_reference: input.evidence_reference ?? null
    };

    entry.effectsById.set(effect.effect_id, effect);
    entry.turn.pending_effects = [...entry.effectsById.values()].map((pending) => this.cloneEffect(pending));
    entry.turn.updated_at = updated_at;
    this.storeTurn(entry.turn, entry.effectsById, entry.unknownOutcomesById);

    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, 'effect_registered', 'effect_registered', {
      effect_id: effect.effect_id,
      binding_id: effect.binding_id,
      state: effect.state,
      point_of_no_return_reached: effect.point_of_no_return_reached
    });

    return this.buildMutationResult(entry.turn, effect, null, 'effect_registered', evidence_record);
  }

  markEffectPointOfNoReturn(input: {
    turn_id: string;
    effect_id: string;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    return this.updateEffectState(input, 'point_of_no_return', 'point_of_no_return_reached', {
      point_of_no_return_reached: true,
      evidence_reference: input.evidence_reference ?? null
    }, {
      updateTurnState: (turn) => (turn.state === 'executing' ? 'waiting_for_external_result' : turn.state)
    });
  }

  markEffectSucceeded(input: {
    turn_id: string;
    effect_id: string;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    return this.updateEffectState(input, 'succeeded', 'turn_transitioned', {
      evidence_reference: input.evidence_reference ?? null
    });
  }

  markEffectFailed(input: {
    turn_id: string;
    effect_id: string;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    return this.updateEffectState(input, 'failed', 'turn_transitioned', {
      evidence_reference: input.evidence_reference ?? null
    });
  }

  markEffectUnknownOutcome(input: {
    turn_id: string;
    effect_id: string;
    reason: string;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidMutationResult('turn_missing');
    }

    const effect = entry.effectsById.get(input.effect_id);
    if (!effect) {
      return this.buildInvalidMutationResult('effect_missing', entry.turn);
    }

    const detected_at = (input.now ?? this.now)().toISOString();
    effect.state = 'unknown_outcome';
    effect.point_of_no_return_reached = true;
    if (input.evidence_reference !== undefined) {
      effect.evidence_reference = input.evidence_reference;
    }

    const unknownOutcome: UnknownOutcome = {
      unknown_outcome_id: createDeterministicId('unknown-outcome', {
        turn_id: entry.turn.turn_id,
        effect_id: effect.effect_id,
        reason: input.reason,
        detected_at
      }),
      effect_id: effect.effect_id,
      reason: input.reason,
      detected_at,
      evidence_reference: input.evidence_reference ?? effect.evidence_reference,
      requires_reconciliation: true
    };

    entry.unknownOutcomesById.set(unknownOutcome.unknown_outcome_id, unknownOutcome);
    entry.turn.pending_effects = [...entry.effectsById.values()].map((pending) => this.cloneEffect(pending));
    entry.turn.unknown_outcomes = [...entry.unknownOutcomesById.values()].map((item) => this.cloneUnknownOutcome(item));
    entry.turn.updated_at = detected_at;
    this.storeTurn(entry.turn, entry.effectsById, entry.unknownOutcomesById);

    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, 'unknown_outcome_detected', 'unknown_outcome_detected', {
      effect_id: effect.effect_id,
      unknown_outcome_id: unknownOutcome.unknown_outcome_id,
      reason: input.reason,
      requires_reconciliation: unknownOutcome.requires_reconciliation
    });

    return this.buildMutationResult(entry.turn, effect, unknownOutcome, 'unknown_outcome_detected', evidence_record);
  }

  requestReconciliation(input: {
    turn_id: string;
    reason: string;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidMutationResult('turn_missing');
    }

    if (TERMINAL_STATES.has(entry.turn.state)) {
      return this.buildInvalidMutationResult('terminal_state', entry.turn);
    }

    const updated_at = (input.now ?? this.now)().toISOString();
    entry.turn.state = 'waiting_for_reconciliation';
    entry.turn.reconciliation_state = 'requested';
    entry.turn.updated_at = updated_at;
    this.storeTurn(entry.turn, entry.effectsById, entry.unknownOutcomesById);

    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, 'reconciliation_requested', 'reconciliation_requested', {
      reason: input.reason,
      evidence_reference: input.evidence_reference ?? null
    });

    return this.buildMutationResult(entry.turn, null, null, 'reconciliation_requested', evidence_record);
  }

  completeReconciliation(input: {
    turn_id: string;
    unknown_outcome_id?: string | null;
    reason: string;
    evidence_reference?: string | null;
    now?: () => Date;
  }): TurnMutationResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidMutationResult('turn_missing');
    }

    if (TERMINAL_STATES.has(entry.turn.state)) {
      return this.buildInvalidMutationResult('terminal_state', entry.turn);
    }

    const pendingUnknownOutcomes = [...entry.unknownOutcomesById.values()].filter((unknownOutcome) => unknownOutcome.requires_reconciliation);
    if (pendingUnknownOutcomes.length === 0 && entry.turn.reconciliation_state !== 'requested') {
      return this.buildInvalidMutationResult('reconciliation_not_requested', entry.turn);
    }

    const resolvedAt = (input.now ?? this.now)().toISOString();
    const toResolve = input.unknown_outcome_id
      ? pendingUnknownOutcomes.filter((unknownOutcome) => unknownOutcome.unknown_outcome_id === input.unknown_outcome_id)
      : pendingUnknownOutcomes;

    if (input.unknown_outcome_id && toResolve.length === 0) {
      return this.buildInvalidMutationResult('unknown_outcome_missing', entry.turn);
    }

    for (const unknownOutcome of toResolve) {
      unknownOutcome.requires_reconciliation = false;
      unknownOutcome.evidence_reference = input.evidence_reference ?? unknownOutcome.evidence_reference;
    }

    entry.turn.unknown_outcomes = [...entry.unknownOutcomesById.values()].map((item) => this.cloneUnknownOutcome(item));
    entry.turn.reconciliation_state = 'closed';
    entry.turn.updated_at = resolvedAt;
    this.storeTurn(entry.turn, entry.effectsById, entry.unknownOutcomesById);

    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, 'reconciliation_completed', 'reconciliation_completed', {
      reason: input.reason,
      unknown_outcome_ids: toResolve.map((unknownOutcome) => unknownOutcome.unknown_outcome_id),
      evidence_reference: input.evidence_reference ?? null
    });

    return this.buildMutationResult(entry.turn, null, null, 'reconciliation_completed', evidence_record);
  }

  cancelTurn(input: {
    turn_id: string;
    reason: string;
    now?: () => Date;
  }): TurnTransitionResult {
    return this.transitionTurn({
      turn_id: input.turn_id,
      to_state: 'cancelled',
      reason: input.reason,
      now: input.now
    });
  }

  expireTurn(input: {
    turn_id: string;
    reason: string;
    now?: () => Date;
  }): TurnTransitionResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidTransitionResult({
        turn: this.buildMissingTurn(input.turn_id),
        reason: 'turn_missing',
        record_type: 'turn_blocked'
      });
    }

    if (TERMINAL_STATES.has(entry.turn.state)) {
      return this.blockTransition(entry, { ...input, to_state: 'expired' }, 'terminal_state');
    }

    const updated_at = (input.now ?? this.now)().toISOString();
    const transition: TurnTransition = {
      transition_id: createDeterministicId('turn-transition', {
        turn_id: entry.turn.turn_id,
        from_state: entry.turn.state,
        to_state: 'expired',
        reason: input.reason,
        effect_id: null,
        updated_at
      }),
      turn_id: entry.turn.turn_id,
      from_state: entry.turn.state,
      to_state: 'expired',
      reason: input.reason,
      effect_id: null,
      created_at: updated_at
    };

    entry.turn.state = 'expired';
    entry.turn.updated_at = updated_at;
    this.storeTurn(entry.turn, entry.effectsById, entry.unknownOutcomesById);

    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, 'turn_transitioned', 'turn_expired', {
      transition,
      state: entry.turn.state,
      reason: input.reason
    });

    return {
      valid: true,
      invalid: false,
      reason: null,
      turn: this.cloneTurn(entry.turn),
      transition,
      evidence_record,
      record_type: 'turn_transitioned'
    };
  }

  private updateEffectState(
    input: {
      turn_id: string;
      effect_id: string;
      evidence_reference?: string | null;
      now?: () => Date;
    },
    nextState: TurnEffectState,
    recordType: EvidenceRecordType,
    overrides: {
      point_of_no_return_reached?: boolean;
      evidence_reference?: string | null;
    } = {},
    options: {
      updateTurnState?: (turn: Turn) => TurnState;
    } = {}
  ): TurnMutationResult {
    const entry = this.turns.get(input.turn_id);
    if (!entry) {
      return this.buildInvalidMutationResult('turn_missing');
    }

    const effect = entry.effectsById.get(input.effect_id);
    if (!effect) {
      return this.buildInvalidMutationResult('effect_missing', entry.turn);
    }

    const updated_at = (input.now ?? this.now)().toISOString();
    effect.state = nextState;
    if (overrides.point_of_no_return_reached !== undefined) {
      effect.point_of_no_return_reached = overrides.point_of_no_return_reached;
    }
    if (overrides.evidence_reference !== undefined) {
      effect.evidence_reference = overrides.evidence_reference;
    }

    if (options.updateTurnState) {
      entry.turn.state = options.updateTurnState(entry.turn);
    }
    entry.turn.pending_effects = [...entry.effectsById.values()].map((pending) => this.cloneEffect(pending));
    entry.turn.updated_at = updated_at;
    this.storeTurn(entry.turn, entry.effectsById, entry.unknownOutcomesById);

    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, recordType, recordType, {
      effect_id: effect.effect_id,
      state: effect.state,
      point_of_no_return_reached: effect.point_of_no_return_reached,
      evidence_reference: overrides.evidence_reference ?? input.evidence_reference ?? null
    });

    return this.buildMutationResult(entry.turn, effect, null, recordType, evidence_record);
  }

  private canCompleteTurn(entry: TurnStoreEntry): boolean {
    const turn = entry.turn;
    const hasPendingUnknownOutcomes = [...entry.unknownOutcomesById.values()].some((unknownOutcome) => unknownOutcome.requires_reconciliation);
    if (hasPendingUnknownOutcomes) {
      return false;
    }

    const hasUnresolvedPointOfNoReturn = [...entry.effectsById.values()].some((effect) => {
      if (!effect.point_of_no_return_reached) {
        return false;
      }
      if (['succeeded', 'failed', 'cancelled'].includes(effect.state)) {
        return false;
      }
      if (effect.state === 'unknown_outcome') {
        const relatedOutcome = [...entry.unknownOutcomesById.values()].find((unknownOutcome) => unknownOutcome.effect_id === effect.effect_id);
        return Boolean(relatedOutcome?.requires_reconciliation);
      }
      return true;
    });
    if (hasUnresolvedPointOfNoReturn) {
      return false;
    }

    const hasPendingEffect = [...entry.effectsById.values()].some((effect) => {
      if (['planned', 'binding_created', 'executing', 'point_of_no_return'].includes(effect.state)) {
        return true;
      }
      if (effect.state === 'unknown_outcome') {
        const relatedOutcome = [...entry.unknownOutcomesById.values()].find((unknownOutcome) => unknownOutcome.effect_id === effect.effect_id);
        return Boolean(relatedOutcome?.requires_reconciliation);
      }
      return false;
    });
    if (hasPendingEffect) {
      return false;
    }

    if (turn.state === 'waiting_for_reconciliation' && turn.reconciliation_state !== 'closed') {
      return false;
    }

    return true;
  }

  private buildCompletionBlockReason(entry: TurnStoreEntry): string {
    if ([...entry.unknownOutcomesById.values()].some((unknownOutcome) => unknownOutcome.requires_reconciliation)) {
      return 'unknown_outcome_pending';
    }
    if (
      [...entry.effectsById.values()].some((effect) => {
        if (!effect.point_of_no_return_reached) {
          return false;
        }
        if (['succeeded', 'failed', 'cancelled'].includes(effect.state)) {
          return false;
        }
        if (effect.state === 'unknown_outcome') {
          const relatedOutcome = [...entry.unknownOutcomesById.values()].find((unknownOutcome) => unknownOutcome.effect_id === effect.effect_id);
          return Boolean(relatedOutcome?.requires_reconciliation);
        }
        return true;
      })
    ) {
      return 'point_of_no_return_unresolved';
    }
    if (
      [...entry.effectsById.values()].some((effect) => {
        if (['planned', 'binding_created', 'executing', 'point_of_no_return'].includes(effect.state)) {
          return true;
        }
        if (effect.state === 'unknown_outcome') {
          const relatedOutcome = [...entry.unknownOutcomesById.values()].find((unknownOutcome) => unknownOutcome.effect_id === effect.effect_id);
          return Boolean(relatedOutcome?.requires_reconciliation);
        }
        return false;
      })
    ) {
      return 'pending_effects';
    }
    if (entry.turn.state === 'waiting_for_reconciliation' && entry.turn.reconciliation_state !== 'closed') {
      return 'reconciliation_pending';
    }
    return 'turn_cannot_complete';
  }

  private blockTransition(entry: TurnStoreEntry, input: { turn_id: string; to_state: TurnState; reason: string; effect_id?: string | null; now?: () => Date }, reason: string): TurnTransitionResult {
    const blocked_at = (input.now ?? this.now)().toISOString();
    const evidence_record = this.appendEvidence(entry.turn.turn_id, entry.turn.organization_id, entry.turn.correlation_id, 'turn_blocked', 'turn_blocked', {
      from_state: entry.turn.state,
      to_state: input.to_state,
      reason,
      requested_reason: input.reason,
      effect_id: input.effect_id ?? null
    });
    return this.buildInvalidTransitionResult({
      turn: this.cloneTurn(entry.turn),
      reason,
      record_type: 'turn_blocked',
      evidence_record,
      transition: {
        transition_id: createDeterministicId('turn-transition', {
          turn_id: entry.turn.turn_id,
          from_state: entry.turn.state,
          to_state: input.to_state,
          reason: input.reason,
          effect_id: input.effect_id ?? null,
          blocked_at
        }),
        turn_id: entry.turn.turn_id,
        from_state: entry.turn.state,
        to_state: input.to_state,
        reason: input.reason,
        effect_id: input.effect_id ?? null,
        created_at: blocked_at
      }
    });
  }

  private buildInvalidTransitionResult(input: {
    turn: Turn;
    reason: string;
    record_type: EvidenceRecordType;
    evidence_record?: EvidenceRecord | null;
    transition?: TurnTransition | null;
  }): TurnTransitionResult {
    return {
      valid: false,
      invalid: true,
      reason: input.reason,
      turn: this.cloneTurn(input.turn),
      transition: input.transition ?? null,
      evidence_record: input.evidence_record ?? null,
      record_type: input.record_type
    };
  }

  private buildInvalidMutationResult(reason: string, turn?: Turn): TurnMutationResult {
    const safeTurn = turn ? this.cloneTurn(turn) : this.buildMissingTurn('turn_missing');
    return {
      valid: false,
      invalid: true,
      reason,
      turn: safeTurn,
      effect: null,
      unknown_outcome: null,
      evidence_record: null,
      record_type: null
    };
  }

  private buildMutationResult(
    turn: Turn,
    effect: TurnEffect | null,
    unknown_outcome: UnknownOutcome | null,
    record_type: EvidenceRecordType,
    evidence_record: EvidenceRecord | null
  ): TurnMutationResult {
    return {
      valid: true,
      invalid: false,
      reason: null,
      turn: this.cloneTurn(turn),
      effect: effect ? this.cloneEffect(effect) : null,
      unknown_outcome: unknown_outcome ? this.cloneUnknownOutcome(unknown_outcome) : null,
      evidence_record,
      record_type
    };
  }

  private appendEvidence(
    turn_id: string,
    organization_id: string,
    correlation_id: string,
    record_type: EvidenceRecordType,
    subject: string,
    data: Record<string, unknown>
  ): EvidenceRecord {
    const record = createEvidenceRecord({
      organization_id,
      correlation_id,
      record_type,
      subject,
      data,
      created_at: this.now().toISOString()
    });
    if (this.evidenceLedger) {
      const stored = this.evidenceLedger.append(record);
      this.pushEvidenceLink(turn_id, stored.evidence_id);
      return stored;
    }
    this.pushEvidenceLink(turn_id, record.evidence_id);
    return record;
  }

  private pushEvidenceLink(turn_id: string, evidence_id: string): void {
    const entry = this.turns.get(turn_id);
    if (!entry) {
      return;
    }
    if (!entry.turn.evidence_links.includes(evidence_id)) {
      entry.turn.evidence_links = [...entry.turn.evidence_links, evidence_id];
      entry.turn.updated_at = this.now().toISOString();
      this.turns.set(turn_id, {
        turn: this.cloneTurn(entry.turn),
        effectsById: new Map(entry.effectsById),
        unknownOutcomesById: new Map(entry.unknownOutcomesById)
      });
    }
  }

  private storeTurn(turn: Turn, effectsById: Map<string, TurnEffect>, unknownOutcomesById: Map<string, UnknownOutcome>): void {
    this.turns.set(turn.turn_id, {
      turn: this.cloneTurn(turn),
      effectsById: new Map([...effectsById.entries()].map(([key, value]) => [key, this.cloneEffect(value)])),
      unknownOutcomesById: new Map([...unknownOutcomesById.entries()].map(([key, value]) => [key, this.cloneUnknownOutcome(value)]))
    });
  }

  private getRequiredTurn(turn_id: string): Turn {
    const turn = this.getTurn(turn_id);
    if (!turn) {
      throw new Error(`turn not found: ${turn_id}`);
    }
    return turn;
  }

  private buildMissingTurn(turn_id: string): Turn {
    const now = this.now().toISOString();
    return {
      turn_id,
      organization_id: 'unknown',
      correlation_id: turn_id,
      actor: {
        principal_id: 'unknown',
        principal_type: null,
        delegated_identity: null
      },
      state: 'failed',
      execution_context: {
        request_id: turn_id,
        request_fingerprint: turn_id,
        policy_decision_id: null,
        binding_id: null,
        requires_binding: false
      },
      pending_effects: [],
      unknown_outcomes: [],
      evidence_links: [],
      reconciliation_state: 'not_requested',
      created_at: now,
      updated_at: now
    };
  }

  private cloneTurn(turn: Turn): Turn {
    return {
      ...turn,
      actor: this.cloneActor(turn.actor),
      execution_context: this.cloneExecutionContext(turn.execution_context),
      pending_effects: turn.pending_effects.map((effect) => this.cloneEffect(effect)),
      unknown_outcomes: turn.unknown_outcomes.map((unknownOutcome) => this.cloneUnknownOutcome(unknownOutcome)),
      evidence_links: [...turn.evidence_links]
    };
  }

  private cloneActor(actor: TurnActor): TurnActor {
    return {
      ...actor
    };
  }

  private cloneExecutionContext(executionContext: TurnExecutionContext): TurnExecutionContext {
    return {
      ...executionContext
    };
  }

  private cloneEffect(effect: TurnEffect): TurnEffect {
    return {
      ...effect
    };
  }

  private cloneUnknownOutcome(unknownOutcome: UnknownOutcome): UnknownOutcome {
    return {
      ...unknownOutcome
    };
  }
}
