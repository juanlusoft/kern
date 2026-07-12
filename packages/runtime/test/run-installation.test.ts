import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfiguredEvidenceLedgerFilePath } from '../src/run-installation';

test('run-installation leaves evidence ledger in-memory when env is absent', () => {
  const env: NodeJS.ProcessEnv = {};

  const result = resolveConfiguredEvidenceLedgerFilePath(env);

  assert.equal(result, null);
  assert.equal(env.KERN_EVIDENCE_FILE_PATH, undefined);
});

test('run-installation resolves an existing evidence ledger path', () => {
  const env: NodeJS.ProcessEnv = {
    KERN_EVIDENCE_FILE_PATH: 'C:/tmp/custom-ledger.jsonl'
  };

  const result = resolveConfiguredEvidenceLedgerFilePath(env);

  assert.equal(result, 'C:/tmp/custom-ledger.jsonl');
  assert.equal(env.KERN_EVIDENCE_FILE_PATH, 'C:/tmp/custom-ledger.jsonl');
});
