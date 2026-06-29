import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEvidenceLedger } from '../src/index';
import { createEvidenceRecord } from '../../contracts/src/index';

test('evidence ledger assigns monotonic sequence numbers', () => {
  const ledger = new InMemoryEvidenceLedger();
  const first = ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-evidence',
      record_type: 'intent',
      subject: 'governed.read',
      data: { request_id: 'req-evidence' }
    })
  );
  const second = ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-evidence',
      record_type: 'policy_decision',
      subject: 'allow',
      data: { decision_id: 'decision-1' }
    })
  );

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(ledger.list()[0].sequence, 1);
  assert.equal(ledger.list()[1].sequence, 2);
});

test('evidence ledger is append-only and returns defensive copies', () => {
  const ledger = new InMemoryEvidenceLedger();
  const original = createEvidenceRecord({
    organization_id: 'org-acme',
    correlation_id: 'corr-evidence',
    record_type: 'intent',
    subject: 'governed.read',
    data: { request_id: 'req-evidence', nested: { allowed: true } }
  });
  ledger.append(original);

  (original.data as { request_id?: string }).request_id = 'tampered';
  const snapshot = ledger.list();
  (snapshot[0].data as { request_id?: string }).request_id = 'mutated-by-test';

  assert.equal((ledger.list()[0].data as { request_id?: string }).request_id, 'req-evidence');
  assert.equal((ledger.list()[0].data as { nested?: { allowed?: boolean } }).nested?.allowed, true);
});

test('evidence ledger scopes organization and correlation queries', () => {
  const ledger = new InMemoryEvidenceLedger();
  ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-a',
      record_type: 'intent',
      subject: 'governed.read',
      data: { request_id: 'req-a' }
    })
  );
  ledger.append(
    createEvidenceRecord({
      organization_id: 'org-foreign',
      correlation_id: 'corr-b',
      record_type: 'policy_decision',
      subject: 'allow',
      data: { decision_id: 'decision-b' }
    })
  );
  ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-a',
      record_type: 'binding_created',
      subject: 'binding_created',
      data: { binding_id: 'binding-a' }
    })
  );

  assert.equal(ledger.listByOrganization('org-acme').length, 2);
  assert.equal(ledger.listByOrganization('org-acme').every((record) => record.organization_id === 'org-acme'), true);
  assert.deepEqual(
    ledger.listByCorrelation('corr-a').map((record) => record.record_type),
    ['intent', 'binding_created']
  );
});

test('evidence ledger reconstructs intent to policy decision to binding or block by correlation', () => {
  const ledger = new InMemoryEvidenceLedger();
  ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-flow',
      record_type: 'intent',
      subject: 'governed.read',
      data: { request_id: 'req-flow' }
    })
  );
  ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-flow',
      record_type: 'policy_decision',
      subject: 'deny',
      data: { decision_id: 'decision-flow' }
    })
  );
  ledger.append(
    createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-flow',
      record_type: 'execution_blocked',
      subject: 'policy_deny',
      data: { decision_id: 'decision-flow' }
    })
  );

  assert.deepEqual(
    ledger.listByCorrelation('corr-flow').map((record) => record.record_type),
    ['intent', 'policy_decision', 'execution_blocked']
  );
});
