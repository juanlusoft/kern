import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEvidenceRecord } from '../../contracts/src/index';
import { createSampleInstallationConfig, startInstallationRuntime } from '../src/index';

function buildEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    HOLDED_API_KEY: 'holded-secret',
    KERN_TELEGRAM_BOT_TOKEN: 'telegram-secret',
    KERN_MODEL_BASE_URL: 'https://model.example.test',
    KERN_MODEL_NAME: 'kern-qwen',
    KERN_MODEL_API_KEY: 'model-secret',
    ...overrides
  };
}

function buildConfig(options: { evidenceLedgerFilePath?: string | null; conversationMemoryFilePath?: string | null } = {}) {
  const config = createSampleInstallationConfig();
  config.runtime_options.evidence_ledger_file_path = options.evidenceLedgerFilePath ?? null;
  config.runtime_options.conversation_memory_file_path = options.conversationMemoryFilePath ?? null;
  return config;
}

function readJsonlRecords(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('runtime slice stays in-memory when no evidence path is configured', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-runtime-evidence-'));
  const config = buildConfig({ conversationMemoryFilePath: join(tempDir, 'conversation-memory.json') });
  const env = buildEnv();
  delete env.KERN_EVIDENCE_FILE_PATH;

  try {
    const runtimeResult = startInstallationRuntime({ rawConfig: config, env });
    assert.equal(runtimeResult.status, 'started');
    assert.equal(existsSync(join(tempDir, 'evidence.jsonl')), false);

    const appended = runtimeResult.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: 'org-pacoprint',
        correlation_id: 'corr-memory',
        record_type: 'intent',
        subject: 'governed.read',
        data: { request_id: 'req-memory' }
      })
    );

    assert.equal(appended.sequence > 0, true);
    assert.equal(existsSync(join(tempDir, 'evidence.jsonl')), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runtime slice uses KERN_EVIDENCE_FILE_PATH when config omits the ledger path', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-runtime-evidence-'));
  const ledgerPath = join(tempDir, 'evidence.jsonl');
  const config = buildConfig({ conversationMemoryFilePath: join(tempDir, 'conversation-memory.json') });
  const env = buildEnv({ KERN_EVIDENCE_FILE_PATH: ledgerPath });

  try {
    const runtimeResult = startInstallationRuntime({ rawConfig: config, env });
    assert.equal(runtimeResult.status, 'started');
    runtimeResult.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: 'org-pacoprint',
        correlation_id: 'corr-env',
        record_type: 'intent',
        subject: 'governed.read',
        data: { request_id: 'req-env' }
      })
    );

    assert.equal(existsSync(ledgerPath), true);
    const records = readJsonlRecords(ledgerPath);
    assert.equal(records.length > 0, true);
    assert.equal(records.some((record) => record.record_type === 'runtime_started'), true);
    assert.equal(records.some((record) => record.record_type === 'intent'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runtime slice prefers config evidence path over env', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'kern-runtime-evidence-'));
  const envPath = join(tempDir, 'env-evidence.jsonl');
  const configPath = join(tempDir, 'config-evidence.jsonl');
  const config = buildConfig({
    evidenceLedgerFilePath: configPath,
    conversationMemoryFilePath: join(tempDir, 'conversation-memory.json')
  });
  const env = buildEnv({ KERN_EVIDENCE_FILE_PATH: envPath });

  try {
    const runtimeResult = startInstallationRuntime({ rawConfig: config, env });
    assert.equal(runtimeResult.status, 'started');
    runtimeResult.evidenceLedger.append(
      createEvidenceRecord({
        organization_id: 'org-pacoprint',
        correlation_id: 'corr-config-wins',
        record_type: 'intent',
        subject: 'governed.read',
        data: { request_id: 'req-config-wins' }
      })
    );

    assert.equal(existsSync(configPath), true);
    assert.equal(existsSync(envPath), false);
    assert.equal(readJsonlRecords(configPath).some((record) => record.record_type === 'intent'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
