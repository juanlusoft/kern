import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultEvidenceLedgerFilePath } from '../src/run-installation';

test('run-installation assigns the default evidence ledger path when env is absent', () => {
  const env: NodeJS.ProcessEnv = {};
  const cwd = 'C:/tmp/kern-runtime';

  const result = ensureDefaultEvidenceLedgerFilePath(env, cwd);

  assert.equal(result, 'C:/tmp/kern-runtime/evidence.jsonl');
  assert.equal(env.KERN_EVIDENCE_FILE_PATH, 'C:/tmp/kern-runtime/evidence.jsonl');
});

test('run-installation preserves an existing evidence ledger path', () => {
  const env: NodeJS.ProcessEnv = {
    KERN_EVIDENCE_FILE_PATH: 'C:/tmp/custom-ledger.jsonl'
  };

  const result = ensureDefaultEvidenceLedgerFilePath(env, 'C:/tmp/kern-runtime');

  assert.equal(result, 'C:/tmp/custom-ledger.jsonl');
  assert.equal(env.KERN_EVIDENCE_FILE_PATH, 'C:/tmp/custom-ledger.jsonl');
});
