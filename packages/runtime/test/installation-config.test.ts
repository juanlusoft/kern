import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSampleInstallationConfig,
  loadInstallationConfig,
  RuntimeConfigError,
  validateInstallationConfig
} from '../src/index';

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

test('runtime config sample validates and resolves secrets', () => {
  const sample = createSampleInstallationConfig();
  const loaded = loadInstallationConfig(sample, buildEnv());

  assert.equal(loaded.config.installation_id, 'paco-print-installation');
  assert.deepEqual(loaded.config.active_modules, ['telegram-channel', 'qwen-orchestrator', 'holded-read']);
  assert.deepEqual(loaded.config.active_capabilities, ['mock.resource.read']);
  assert.equal(loaded.config.runtime_options.evidence_ledger_file_path, null);
  assert.deepEqual(loaded.config.runtime_options.numa_hr?.time_type_by_label, {
    vacaciones: [5],
    'asuntos propios': [34]
  });
  assert.deepEqual(loaded.config.runtime_options.numa_hr?.annual_quota_by_time_type, {
    5: 22,
    34: 6
  });
  assert.deepEqual(loaded.config.runtime_options.numa_hr?.company_id_by_organization_id, {
    'org-pacoprint': 'company-pacoprint'
  });
  assert.equal(loaded.config.organization.organization_id, 'org-pacoprint');
  assert.equal(loaded.secrets.HOLDED_API_KEY, 'holded-secret');
  assert.equal(loaded.secrets.KERN_TELEGRAM_BOT_TOKEN, 'telegram-secret');
  assert.equal(loaded.secrets.KERN_MODEL_BASE_URL, 'https://model.example.test');
  assert.equal(loaded.secrets.KERN_MODEL_NAME, 'kern-qwen');
  assert.equal(loaded.secrets.KERN_MODEL_API_KEY, 'model-secret');
});

test('runtime config fails closed on a missing env secret', () => {
  const sample = createSampleInstallationConfig();
  assert.throws(
    () =>
      loadInstallationConfig(
        sample,
        buildEnv({
          KERN_TELEGRAM_BOT_TOKEN: undefined
        })
      ),
    RuntimeConfigError
  );
});

test('runtime config rejects unsupported module keys', () => {
  const sample = createSampleInstallationConfig();
  assert.throws(
    () =>
      validateInstallationConfig({
        ...sample,
        active_modules: [...sample.active_modules, 'unknown-module']
      }),
    RuntimeConfigError
  );
});
test('runtime config accepts numa-postgres-read module key', () => {
  const sample = createSampleInstallationConfig();
  const loaded = loadInstallationConfig(
    {
      ...sample,
      active_modules: [...sample.active_modules, 'numa-postgres-read']
    },
    buildEnv()
  );

  assert.equal(loaded.config.active_modules.includes('numa-postgres-read'), true);
});
