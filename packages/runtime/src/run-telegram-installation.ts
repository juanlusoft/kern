import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadInstallationConfig } from './config';
import { startInstallationRuntime } from './slice';

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

export function runTelegramInstallation(): void {
  const rawConfig = loadConfigFromProcess();
  const loaded = loadInstallationConfig(rawConfig);
  const start = startInstallationRuntime({
    rawConfig,
    env: process.env
  });
  if (start.status !== 'started' || !start.runtime) {
    throw new Error(`installation start blocked: ${start.reason ?? 'unknown'}`);
  }
  if (!loaded.config.active_modules.includes('telegram-channel')) {
    throw new Error('telegram-channel is required for run-telegram-installation');
  }

  const intervalMs = Math.max(1_000, loaded.config.runtime_options.telegram_poll_timeout_ms);
  let polling = false;
  let stopped = false;

  const poll = () => {
    if (polling || stopped) {
      return;
    }
    polling = true;
    try {
      start.runtime?.runLoop({ maxIterations: 1 });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      polling = false;
    }
  };

  console.log(
    JSON.stringify({
      status: 'ready',
      installation_id: loaded.config.installation_id,
      organization_id: loaded.config.organization.organization_id,
      channel: 'telegram',
      poll_interval_ms: intervalMs
    })
  );

  poll();
  const timer = setInterval(poll, intervalMs);

  const shutdown = () => {
    stopped = true;
    clearInterval(timer);
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  runTelegramInstallation();
}
