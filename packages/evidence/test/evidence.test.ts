import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryEvidenceLedger } from '../src/index';
import { createEvidenceRecord } from '../../contracts/src/index';

function readJsonlRecords(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

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

test('evidence ledger appends one JSONL record per line and creates missing files', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-evidence-ledger-'));
  const filePath = join(tempDir, 'evidence-ledger.jsonl');

  try {
    assert.equal(existsSync(filePath), false);
    const ledger = new InMemoryEvidenceLedger({ filePath });
    const stored = ledger.append(
      createEvidenceRecord({
        organization_id: 'org-acme',
        correlation_id: 'corr-jsonl-1',
        record_type: 'intent',
        subject: 'governed.read',
        data: { request_id: 'req-jsonl-1' }
      })
    );

    assert.equal(existsSync(filePath), true);
    const contents = readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);

    assert.equal(lines.length, 1);
    assert.equal(contents.includes('"records"'), false);
    assert.equal(contents.trim().startsWith('['), false);
    assert.equal(contents.trim().startsWith('{"version"'), false);
    assert.equal(JSON.parse(lines[0]).sequence, 1);
    assert.equal(ledger.list().length, 1);
    assert.equal(ledger.list()[0].sequence, 1);
    assert.equal(stored.sequence, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('evidence ledger appends to an existing JSONL file without losing prior records', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-evidence-ledger-'));
  const filePath = join(tempDir, 'evidence-ledger.jsonl');

  try {
    const firstLedger = new InMemoryEvidenceLedger({ filePath });
    firstLedger.append(
      createEvidenceRecord({
        organization_id: 'org-acme',
        correlation_id: 'corr-jsonl-2',
        record_type: 'intent',
        subject: 'governed.read',
        data: { request_id: 'req-jsonl-2a' }
      })
    );
    const secondLedger = new InMemoryEvidenceLedger({ filePath });
    secondLedger.append(
      createEvidenceRecord({
        organization_id: 'org-acme',
        correlation_id: 'corr-jsonl-2',
        record_type: 'policy_decision',
        subject: 'allow',
        data: { decision_id: 'decision-jsonl-2' }
      })
    );

    const contents = readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);

    assert.equal(lines.length, 2);
    assert.equal(contents.includes('"records"'), false);
    assert.equal(contents.trim().startsWith('['), false);
    assert.deepEqual(lines.map((line) => JSON.parse(line).sequence), [1, 2]);
    assert.deepEqual(secondLedger.listByCorrelation('corr-jsonl-2').map((record) => record.record_type), ['intent', 'policy_decision']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('evidence ledger survives two instances writing to the same JSONL file', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-evidence-ledger-'));
  const filePath = join(tempDir, 'evidence-ledger.jsonl');

  try {
    const firstLedger = new InMemoryEvidenceLedger({ filePath });
    firstLedger.append(
      createEvidenceRecord({
        organization_id: 'org-acme',
        correlation_id: 'corr-jsonl-3',
        record_type: 'intent',
        subject: 'governed.read',
        data: { request_id: 'req-jsonl-3a' }
      })
    );
    const secondLedger = new InMemoryEvidenceLedger({ filePath });
    secondLedger.append(
      createEvidenceRecord({
        organization_id: 'org-acme',
        correlation_id: 'corr-jsonl-3',
        record_type: 'policy_decision',
        subject: 'allow',
        data: { decision_id: 'decision-jsonl-3' }
      })
    );
    const thirdLedger = new InMemoryEvidenceLedger({ filePath });

    assert.deepEqual(thirdLedger.listByCorrelation('corr-jsonl-3').map((record) => record.record_type), ['intent', 'policy_decision']);
    assert.equal(thirdLedger.list().length, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('evidence ledger skips a corrupt line and keeps valid JSONL records', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-evidence-ledger-'));
  const filePath = join(tempDir, 'evidence-ledger.jsonl');

  try {
    const first = createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-jsonl-4',
      record_type: 'intent',
      subject: 'governed.read',
      data: { request_id: 'req-jsonl-4a' },
      sequence: 1,
      created_at: '2026-06-28T00:00:00.000Z'
    });
    const second = createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-jsonl-4',
      record_type: 'policy_decision',
      subject: 'allow',
      data: { decision_id: 'decision-jsonl-4' },
      sequence: 2,
      created_at: '2026-06-28T00:00:01.000Z'
    });
    writeFileSync(filePath, JSON.stringify(first) + '\nthis is not json\n' + JSON.stringify(second) + '\n', 'utf8');

    const ledger = new InMemoryEvidenceLedger({ filePath });

    assert.deepEqual(ledger.listByCorrelation('corr-jsonl-4').map((record) => record.record_type), ['intent', 'policy_decision']);
    assert.equal(ledger.list().length, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('evidence ledger nextSequence comes from the highest loaded sequence', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-evidence-ledger-'));
  const filePath = join(tempDir, 'evidence-ledger.jsonl');

  try {
    const first = createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-jsonl-5',
      record_type: 'intent',
      subject: 'governed.read',
      data: { request_id: 'req-jsonl-5a' },
      sequence: 1,
      created_at: '2026-06-28T00:00:00.000Z'
    });
    const second = createEvidenceRecord({
      organization_id: 'org-acme',
      correlation_id: 'corr-jsonl-5',
      record_type: 'policy_decision',
      subject: 'allow',
      data: { decision_id: 'decision-jsonl-5' },
      sequence: 2,
      created_at: '2026-06-28T00:00:01.000Z'
    });
    writeFileSync(filePath, JSON.stringify(first) + '\n' + JSON.stringify(second) + '\n', 'utf8');

    const ledger = new InMemoryEvidenceLedger({ filePath });
    const stored = ledger.append(
      createEvidenceRecord({
        organization_id: 'org-acme',
        correlation_id: 'corr-jsonl-5',
        record_type: 'binding_created',
        subject: 'binding_created',
        data: { binding_id: 'binding-jsonl-5' }
      })
    );

    assert.equal(stored.sequence, 3);
    assert.deepEqual(readJsonlRecords(filePath).map((record) => record.sequence), [1, 2, 3]);
    assert.equal(readJsonlRecords(filePath).some((record) => Object.prototype.hasOwnProperty.call(record, 'nextSequence')), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
