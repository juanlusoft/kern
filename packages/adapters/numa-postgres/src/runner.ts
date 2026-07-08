import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from 'node:child_process';

import type {
  PgConnectionConfig,
  PgPresenceQueryRunner,
  PgReadOnlyTransactionPlan,
  PgQueryId,
  PgSqlStatement
} from './index';

const DEFAULT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export const PG_SYNC_QUERY_RUNNER_SCRIPT = `
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const connection = input.connection ?? {};
const transaction = input.transaction ?? {};
const timeoutMs = Number.isFinite(transaction.statement_timeout_ms) && transaction.statement_timeout_ms > 0
  ? Math.trunc(transaction.statement_timeout_ms)
  : 15000;
const client = new Client({
  host: connection.host,
  port: connection.port,
  database: connection.database,
  user: connection.user,
  password: connection.password ?? undefined,
  application_name: connection.application_name ?? undefined,
  ssl: connection.sslmode === 'disable' ? false : true
});

const toMessage = (error) => error instanceof Error ? (error.stack ?? error.message) : String(error);

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query(\`SET LOCAL statement_timeout = '\${timeoutMs}ms'\`);
  const result = await client.query(input.statement.text, input.statement.values ?? []);
  await client.query('COMMIT');
  process.stdout.write(JSON.stringify({ rows: result.rows ?? [] }));
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {}
  process.stderr.write(toMessage(error));
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
`;

export interface PgSyncQueryRunnerOptions {
  connection: PgConnectionConfig;
  spawnSyncImpl?: (command: string, args?: readonly string[], options?: SpawnSyncOptions) => SpawnSyncReturns<Buffer | NonSharedBuffer>;
  maxBufferBytes?: number;
}

function parseRowsOutput(stdout: string): unknown[] {
  if (!stdout || stdout.trim().length === 0) {
    throw new Error('pg sync query runner returned no rows payload');
  }
  const parsed = JSON.parse(stdout) as { rows?: unknown };
  if (!parsed || !Array.isArray(parsed.rows)) {
    throw new Error('pg sync query runner returned an invalid rows payload');
  }
  return parsed.rows;
}

export class PgSyncQueryRunner implements PgPresenceQueryRunner {
  private readonly connection: PgConnectionConfig;
  private readonly spawnSyncImpl: NonNullable<PgSyncQueryRunnerOptions['spawnSyncImpl']>;
  private readonly maxBufferBytes: number;

  constructor(options: PgSyncQueryRunnerOptions) {
    this.connection = { ...options.connection };
    this.spawnSyncImpl = (options.spawnSyncImpl ?? spawnSync) as NonNullable<PgSyncQueryRunnerOptions['spawnSyncImpl']>;
    this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  }

  query<TRecord = Record<string, unknown>>(input: {
    query_id: PgQueryId;
    statement: PgSqlStatement;
    connection: PgConnectionConfig;
    transaction: PgReadOnlyTransactionPlan;
  }): TRecord[] {
    const child = this.spawnSyncImpl(process.execPath, ['--input-type=module', '--eval', PG_SYNC_QUERY_RUNNER_SCRIPT], {
      input: JSON.stringify({
        query_id: input.query_id,
        statement: input.statement,
        connection: input.connection ?? this.connection,
        transaction: input.transaction
      }),
      encoding: 'utf8',
      maxBuffer: this.maxBufferBytes
    } satisfies SpawnSyncOptions);

    if (child.error) {
      throw child.error;
    }
    const stdout = String(child.stdout ?? '');
    const stderr = String(child.stderr ?? '');
    if (child.status !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `pg sync query runner failed for ${input.query_id}`);
    }

    const rows = parseRowsOutput(stdout);
    return rows as TRecord[];
  }
}

export function createPgSyncQueryRunner(options: PgSyncQueryRunnerOptions): PgSyncQueryRunner {
  return new PgSyncQueryRunner(options);
}




