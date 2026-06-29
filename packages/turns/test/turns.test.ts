import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { InMemoryTurnRuntime } from '../src/index';
import type { CreateTurnInput } from '../src/index';

function createRuntime() {
  const ledger = new InMemoryEvidenceLedger();
  const now = () => new Date('2026-06-28T00:00:00.000Z');
  const runtime = new InMemoryTurnRuntime({ evidenceLedger: ledger, now });
  return { runtime, ledger, now };
}

function createTurnInput(overrides: Partial<CreateTurnInput> = {}): CreateTurnInput {
  return {
    organization_id: 'org-acme',
    correlation_id: 'corr-turn',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    execution_context: {
      request_id: 'req-turn',
      request_fingerprint: 'fingerprint-turn',
      policy_decision_id: 'decision-turn',
      binding_id: 'binding-turn',
      requires_binding: true
    },
    ...overrides
  };
}

function createBaseTurn(runtime: InMemoryTurnRuntime) {
  const turn = runtime.createTurn(createTurnInput());
  const evaluating = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'evaluating',
    reason: 'start evaluation'
  });
  return {
    turn: evaluating.turn,
    turn_id: turn.turn_id,
    evaluated: evaluating
  };
}

test('createTurn registers a created turn and evidence', () => {
  const { runtime, ledger } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());

  assert.equal(turn.state, 'created');
  assert.equal(turn.reconciliation_state, 'not_requested');
  assert.equal(turn.pending_effects.length, 0);
  assert.equal(turn.unknown_outcomes.length, 0);
  assert.equal(turn.evidence_links.length, 1);
  assert.equal(ledger.list().at(0)?.record_type, 'turn_created');
});

test('transitionTurn supports created to evaluating', () => {
  const { runtime, ledger } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  const result = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'evaluating',
    reason: 'governed request is now under evaluation'
  });

  assert.equal(result.valid, true);
  assert.equal(result.turn.state, 'evaluating');
  assert.equal(result.record_type, 'turn_transitioned');
  assert.equal(ledger.list().at(-1)?.record_type, 'turn_transitioned');
});

test('transitionTurn supports evaluating to executing', () => {
  const { runtime } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'evaluating', reason: 'evaluate' });
  const result = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'executing',
    reason: 'policy approved execution'
  });

  assert.equal(result.valid, true);
  assert.equal(result.turn.state, 'executing');
});

test('transitionTurn blocks invalid transitions with a structured result', () => {
  const { runtime } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  const result = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'completed',
    reason: 'skip states'
  });

  assert.equal(result.valid, false);
  assert.equal(result.invalid, true);
  assert.equal(result.reason, 'invalid_transition');
  assert.equal(result.record_type, 'turn_blocked');
});

test('completed is terminal', () => {
  const { runtime } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'evaluating', reason: 'evaluate' });
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'executing', reason: 'execute' });
  const completed = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'completed',
    reason: 'done'
  });
  const afterCompleted = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'failed',
    reason: 'should not move'
  });

  assert.equal(completed.valid, true);
  assert.equal(completed.turn.state, 'completed');
  assert.equal(afterCompleted.valid, false);
  assert.equal(afterCompleted.reason, 'terminal_state');
});

test('cancelled is terminal', () => {
  const { runtime } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'evaluating', reason: 'evaluate' });
  const cancelled = runtime.cancelTurn({ turn_id: turn.turn_id, reason: 'cancel flow' });
  const afterCancelled = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'executing',
    reason: 'should not move'
  });

  assert.equal(cancelled.valid, true);
  assert.equal(cancelled.turn.state, 'cancelled');
  assert.equal(afterCancelled.valid, false);
  assert.equal(afterCancelled.reason, 'terminal_state');
});

test('expired is terminal', () => {
  const { runtime } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'evaluating', reason: 'evaluate' });
  const expired = runtime.expireTurn({ turn_id: turn.turn_id, reason: 'clock expired' });
  const afterExpired = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'executing',
    reason: 'should not move'
  });

  assert.equal(expired.valid, true);
  assert.equal(expired.turn.state, 'expired');
  assert.equal(afterExpired.valid, false);
  assert.equal(afterExpired.reason, 'terminal_state');
});

test('addPendingEffect registers a pending effect and evidence', () => {
  const { runtime, ledger } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const result = runtime.addPendingEffect({
    turn_id,
    binding_id: 'binding-1',
    evidence_reference: 'evidence-1'
  });

  assert.equal(result.valid, true);
  assert.equal(result.effect?.state, 'planned');
  assert.equal(result.turn.pending_effects.length, 1);
  assert.equal(ledger.list().some((record) => record.record_type === 'effect_registered'), true);
});

test('markEffectPointOfNoReturn updates the effect and records evidence', () => {
  const { runtime, ledger } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id, binding_id: 'binding-1' }).effect;
  assert.ok(effect);
  const result = runtime.markEffectPointOfNoReturn({
    turn_id,
    effect_id: effect.effect_id
  });

  assert.equal(result.valid, true);
  assert.equal(result.effect?.state, 'point_of_no_return');
  assert.equal(result.effect?.point_of_no_return_reached, true);
  assert.equal(ledger.list().some((record) => record.record_type === 'point_of_no_return_reached'), true);
});

test('markEffectSucceeded updates the effect to succeeded', () => {
  const { runtime } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  const result = runtime.markEffectSucceeded({ turn_id, effect_id: effect.effect_id });

  assert.equal(result.valid, true);
  assert.equal(result.effect?.state, 'succeeded');
});

test('markEffectFailed updates the effect to failed', () => {
  const { runtime } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  const result = runtime.markEffectFailed({ turn_id, effect_id: effect.effect_id });

  assert.equal(result.valid, true);
  assert.equal(result.effect?.state, 'failed');
});

test('markEffectUnknownOutcome creates UnknownOutcome and evidence', () => {
  const { runtime, ledger } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  const result = runtime.markEffectUnknownOutcome({
    turn_id,
    effect_id: effect.effect_id,
    reason: 'external system returned an indeterminate state'
  });

  assert.equal(result.valid, true);
  assert.equal(result.unknown_outcome?.requires_reconciliation, true);
  assert.equal(result.turn.unknown_outcomes.length, 1);
  assert.equal(ledger.list().some((record) => record.record_type === 'unknown_outcome_detected'), true);
});

test('turn with pending unknown outcome cannot complete', () => {
  const { runtime } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  runtime.transitionTurn({ turn_id, to_state: 'executing', reason: 'ready to execute' });
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  runtime.markEffectUnknownOutcome({
    turn_id,
    effect_id: effect.effect_id,
    reason: 'unknown outcome'
  });

  const result = runtime.transitionTurn({
    turn_id,
    to_state: 'completed',
    reason: 'should be blocked'
  });

  assert.equal(result.valid, false);
  assert.equal(result.record_type, 'turn_blocked');
  assert.equal(result.reason, 'unknown_outcome_pending');
});

test('cancelTurn preserves unknown outcomes', () => {
  const { runtime } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  runtime.markEffectUnknownOutcome({
    turn_id,
    effect_id: effect.effect_id,
    reason: 'unknown outcome'
  });

  const cancelled = runtime.cancelTurn({ turn_id, reason: 'operator cancelled' });
  const cancelledTurn = runtime.getTurn(turn_id);

  assert.equal(cancelled.valid, true);
  assert.equal(cancelled.turn.state, 'cancelled');
  assert.equal(cancelledTurn?.unknown_outcomes.length, 1);
  assert.equal(cancelledTurn?.unknown_outcomes[0].requires_reconciliation, true);
});

test('expireTurn preserves unknown outcomes without resolving them', () => {
  const { runtime } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  runtime.markEffectUnknownOutcome({
    turn_id,
    effect_id: effect.effect_id,
    reason: 'unknown outcome'
  });

  const expired = runtime.expireTurn({ turn_id, reason: 'operator timeout' });
  const expiredTurn = runtime.getTurn(turn_id);

  assert.equal(expired.valid, true);
  assert.equal(expired.turn.state, 'expired');
  assert.equal(expiredTurn?.unknown_outcomes.length, 1);
  assert.equal(expiredTurn?.unknown_outcomes[0].requires_reconciliation, true);
});

test('requestReconciliation moves the turn into waiting_for_reconciliation', () => {
  const { runtime, ledger } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  runtime.markEffectUnknownOutcome({
    turn_id,
    effect_id: effect.effect_id,
    reason: 'unknown outcome'
  });

  const requested = runtime.requestReconciliation({
    turn_id,
    reason: 'reconcile external result'
  });

  assert.equal(requested.valid, true);
  assert.equal(requested.turn.state, 'waiting_for_reconciliation');
  assert.equal(requested.turn.reconciliation_state, 'requested');
  assert.equal(ledger.list().some((record) => record.record_type === 'reconciliation_requested'), true);
});

test('completeReconciliation allows completion when no unknown outcomes remain pending', () => {
  const { runtime, ledger } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  runtime.markEffectUnknownOutcome({
    turn_id,
    effect_id: effect.effect_id,
    reason: 'unknown outcome'
  });
  runtime.requestReconciliation({
    turn_id,
    reason: 'reconcile external result'
  });

  const completedReconciliation = runtime.completeReconciliation({
    turn_id,
    reason: 'external result reconciled'
  });
  const completed = runtime.transitionTurn({
    turn_id,
    to_state: 'completed',
    reason: 'complete turn'
  });

  assert.equal(completedReconciliation.valid, true);
  assert.equal(completedReconciliation.turn.reconciliation_state, 'closed');
  assert.equal(completed.valid, true);
  assert.equal(completed.turn.state, 'completed');
  assert.equal(ledger.list().some((record) => record.record_type === 'reconciliation_completed'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'turn_completed'), true);
});

test('attempting to complete with a point of no return effect still blocked until definitive result', () => {
  const { runtime } = createRuntime();
  const { turn_id } = createBaseTurn(runtime);
  runtime.transitionTurn({ turn_id, to_state: 'executing', reason: 'ready to execute' });
  const effect = runtime.addPendingEffect({ turn_id }).effect;
  assert.ok(effect);
  runtime.markEffectPointOfNoReturn({
    turn_id,
    effect_id: effect.effect_id
  });

  const completed = runtime.transitionTurn({
    turn_id,
    to_state: 'completed',
    reason: 'should be blocked'
  });

  assert.equal(completed.valid, false);
  assert.equal(completed.reason, 'point_of_no_return_unresolved');
});

test('terminal states do not admit normal transitions', () => {
  const { runtime } = createRuntime();
  const turn = runtime.createTurn(createTurnInput());
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'evaluating', reason: 'evaluate' });
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'executing', reason: 'execute' });
  runtime.transitionTurn({ turn_id: turn.turn_id, to_state: 'completed', reason: 'complete' });

  const afterCompleted = runtime.transitionTurn({
    turn_id: turn.turn_id,
    to_state: 'evaluating',
    reason: 'should stay terminal'
  });

  assert.equal(afterCompleted.valid, false);
  assert.equal(afterCompleted.reason, 'terminal_state');
});
