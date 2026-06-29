import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { InMemoryTurnRuntime } from '../../turns/src/index';
import { createCoreM1Environment, executeGovernedRequest } from '../../core/src/index';
import type { CoreRequest } from '../../contracts/src/index';

function createPayload(): CoreRequest['payload'] {
  return {
    resource: 'documents/quarterly',
    operation: 'read',
    requested_scope: 'read:knowledge',
    classification: 'internal',
    destination: 'core',
    amount: 1,
    flags: {
      force_policy_deny: false,
      force_policy_defer: false,
      missing_critical_attribute: false,
      obligation_incomplete: false,
      attempt_human_impersonation: false,
      delegated_identity_exceeds_principal: false,
      agent_selected_organization: false
    }
  };
}

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'm3-request',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'governed.read',
    purpose: 'M3 governed request',
    payload: createPayload(),
    requires_binding: true,
    correlation_id: 'corr-m3',
    ...overrides
  };
}

test('M3 core integration associates a turn and records turn creation evidence', () => {
  const ledger = new InMemoryEvidenceLedger();
  const turnRuntime = new InMemoryTurnRuntime({
    evidenceLedger: ledger,
    now: () => new Date('2026-06-28T00:00:00.000Z')
  });
  const environment = createCoreM1Environment({
    evidenceLedger: ledger,
    turnRuntime,
    now: () => new Date('2026-06-28T00:00:00.000Z')
  });

  const result = executeGovernedRequest(createRequest(), environment);
  const turn = result.turn_id ? turnRuntime.getTurn(result.turn_id) : undefined;

  assert.equal(result.status, 'allowed');
  assert.ok(result.turn_id);
  assert.equal(turn?.state, 'created');
  assert.equal(result.evidence_records.some((record) => record.record_type === 'turn_created'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'turn_created'), true);
});

