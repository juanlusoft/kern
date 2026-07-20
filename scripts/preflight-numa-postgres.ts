import { pathToFileURL } from 'node:url';

import pg from 'pg';

import { createPgConnectionConfigFromEnv } from '../packages/adapters/numa-postgres/src/index';

const { Client } = pg;

export const REQUIRED_NUMA_POSTGRES_RELATIONS = [
  'kern.employees',
  'kern.employee_punches',
  'core_punches',
  'core_persons',
  'core_punching_points',
  'org_employees',
  'org_employee_groups',
  'org_employee_groups_employees',
  'ta_requests',
  'ta_time_types'
] as const;

type TableInspection = {
  table_name: string;
  resolved_name: string | null;
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_truncate: boolean;
  can_references: boolean;
  can_trigger: boolean;
};

type RoleInspection = {
  transaction_read_only: string;
  can_create_database_objects: boolean;
  can_create_schema_objects: boolean;
  is_superuser: boolean;
  can_create_role: boolean;
  can_create_database: boolean;
  can_replicate: boolean;
  can_bypass_rls: boolean;
};

export type NumaPostgresPreflightResult = {
  passed: boolean;
  errors: string[];
  table_results: Array<{ table_name: string; passed: boolean }>;
};

const WRITE_PRIVILEGES: Array<keyof Pick<TableInspection, 'can_insert' | 'can_update' | 'can_delete' | 'can_truncate' | 'can_references' | 'can_trigger'>> = [
  'can_insert',
  'can_update',
  'can_delete',
  'can_truncate',
  'can_references',
  'can_trigger'
];

export function evaluateNumaPostgresPreflight(input: {
  tables: TableInspection[];
  role: RoleInspection;
}): NumaPostgresPreflightResult {
  const byName = new Map(input.tables.map((table) => [table.table_name, table]));
  const errors: string[] = [];
  const table_results = REQUIRED_NUMA_POSTGRES_RELATIONS.map((table_name) => {
    const table = byName.get(table_name);
    if (!table?.resolved_name) {
      errors.push(`${table_name}: not visible through the configured search_path`);
      return { table_name, passed: false };
    }
    if (!table.can_select) {
      errors.push(`${table_name}: configured role lacks SELECT`);
      return { table_name, passed: false };
    }
    const grantedWrites = WRITE_PRIVILEGES.filter((privilege) => table[privilege]);
    if (grantedWrites.length > 0) {
      errors.push(`${table_name}: configured role has write privileges (${grantedWrites.join(', ')})`);
      return { table_name, passed: false };
    }
    return { table_name, passed: true };
  });

  if (input.role.transaction_read_only !== 'on') {
    errors.push('preflight transaction is not read-only');
  }
  if (input.role.can_create_database_objects) {
    errors.push('configured role can CREATE in the database');
  }
  if (input.role.can_create_schema_objects) {
    errors.push('configured role can CREATE in a schema on its search_path');
  }
  if (input.role.is_superuser || input.role.can_create_role || input.role.can_create_database || input.role.can_replicate || input.role.can_bypass_rls) {
    errors.push('configured role has elevated PostgreSQL role attributes');
  }

  return { passed: errors.length === 0, errors, table_results };
}

async function inspectConfiguredDatabase(): Promise<NumaPostgresPreflightResult> {
  const connection = createPgConnectionConfigFromEnv(process.env);
  const client = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password ?? undefined,
    application_name: connection.application_name,
    ssl: connection.sslmode === 'disable' ? false : true
  });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SELECT set_config('statement_timeout', $1, true)", [`${connection.statement_timeout_ms ?? 5000}ms`]);
    const tableResult = await client.query<TableInspection>(`
      SELECT
        required.table_name,
        to_regclass(required.table_name)::text AS resolved_name,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'SELECT') END AS can_select,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'INSERT') END AS can_insert,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'UPDATE') END AS can_update,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'DELETE') END AS can_delete,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'TRUNCATE') END AS can_truncate,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'REFERENCES') END AS can_references,
        CASE WHEN to_regclass(required.table_name) IS NULL THEN false ELSE has_table_privilege(current_user, to_regclass(required.table_name), 'TRIGGER') END AS can_trigger
      FROM unnest($1::text[]) AS required(table_name)
      ORDER BY required.table_name
    `, [REQUIRED_NUMA_POSTGRES_RELATIONS]);
    const roleResult = await client.query<RoleInspection>(`
      SELECT
        current_setting('transaction_read_only') AS transaction_read_only,
        has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects,
        EXISTS (
          SELECT 1
          FROM unnest(current_schemas(false)) AS visible(schema_name)
          WHERE has_schema_privilege(current_user, visible.schema_name, 'CREATE')
        ) AS can_create_schema_objects,
        role.rolsuper AS is_superuser,
        role.rolcreaterole AS can_create_role,
        role.rolcreatedb AS can_create_database,
        role.rolreplication AS can_replicate,
        role.rolbypassrls AS can_bypass_rls
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    await client.query('ROLLBACK');
    const role = roleResult.rows[0];
    if (!role) {
      throw new Error('could not inspect configured PostgreSQL role');
    }
    return evaluateNumaPostgresPreflight({ tables: tableResult.rows, role });
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    const result = await inspectConfiguredDatabase();
    for (const table of result.table_results) {
      console.log(`${table.passed ? '[ok]' : '[failed]'} ${table.table_name}`);
    }
    if (!result.passed) {
      for (const error of result.errors) {
        console.error(`[failed] ${error}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log('[ok] configured PostgreSQL role is effective read-only for the required Numa HR schema');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[blocked] Numa PostgreSQL preflight could not run: ${message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
