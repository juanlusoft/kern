import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadInstallationConfig } from './config';
import { startInstallationRuntime } from './slice';

export function resolveConfiguredEvidenceLedgerFilePath(env: NodeJS.ProcessEnv = process.env): string | null {
  const existing = typeof env.KERN_EVIDENCE_FILE_PATH === 'string' && env.KERN_EVIDENCE_FILE_PATH.trim().length > 0
    ? env.KERN_EVIDENCE_FILE_PATH.trim()
    : null;
  if (existing) {
    return existing;
  }
  return null;
}

function loadConfigFromProcess(): unknown {
  const jsonConfig = process.env.KERN_RUNTIME_CONFIG_JSON ?? null;
  if (typeof jsonConfig === 'string' && jsonConfig.trim().length > 0) {
    return JSON.parse(jsonConfig);
  }
  const configPath = process.env.KERN_RUNTIME_CONFIG_PATH ?? null;
  if (typeof configPath === 'string' && configPath.trim().length > 0) {
    return JSON.parse(readFileSync(resolve(configPath), 'utf8'));
  }
  throw new Error('KERN_RUNTIME_CONFIG_JSON or KERN_RUNTIME_CONFIG_PATH is required');
}

export function runInstallation(): number {
  resolveConfiguredEvidenceLedgerFilePath(process.env);
  const rawConfig = loadConfigFromProcess();
  const loaded = loadInstallationConfig(rawConfig);
  const start = startInstallationRuntime({
    rawConfig,
    env: process.env
  });
  if (start.status !== 'started' || !start.runtime) {
    console.error(`installation start blocked: ${start.reason ?? 'unknown'}`);
    return 1;
  }
  const batches = start.runtime.runLoop({ maxIterations: loaded.config.runtime_options.polling_iterations });
  if (batches.length === 0) {
    console.log('runtime idle');
  }
  return 0;
}

const entrypoint = process.argv[1] ? `file://${process.argv[1].replace(/\\/g, '/')}` : null;
if (entrypoint && import.meta.url === entrypoint) {
  const exitCode = runInstallation();
  process.exitCode = exitCode;
}
