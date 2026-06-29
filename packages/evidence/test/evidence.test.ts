import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEvidenceLedger } from '../src/index';
import { createEvidenceRecord } from '../../contracts/src/index';

test('evidence ledger is append-only and organization scoped by record contents', () => {
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

  assert.equal(ledger.list().length, 2);
  assert.equal(ledger.listByCorrelation('corr-evidence').length, 2);
  assert.equal(first.record_type, 'intent');
  assert.equal(second.record_type, 'policy_decision');
});
