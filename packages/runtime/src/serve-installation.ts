import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadInstallationConfig } from './config';
import { startInstallationRuntime, type RuntimeStartResult } from './slice';

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

async function closeRuntime(start: RuntimeStartResult): Promise<void> {
  await start.runtime?.openwebuiServer?.close();
}

export async function serveInstallation(): Promise<number> {
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

  if (!start.runtime.openwebuiServer) {
    console.error('installation start blocked: openwebui-channel is required for serve-installation');
    await closeRuntime(start);
    return 1;
  }

  const port = await start.runtime.openwebuiServer.ready;
  console.log(
    JSON.stringify({
      status: 'ready',
      installation_id: loaded.config.installation_id,
      organization_id: loaded.config.organization.organization_id,
      openwebui_port: port
    })
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await closeRuntime(start);
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });
  process.once('SIGINT', () => {
    void shutdown();
  });

  await new Promise<never>(() => {
    // Keep the HTTP channel alive until the container receives a signal.
  });
  return 0;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  serveInstallation()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
