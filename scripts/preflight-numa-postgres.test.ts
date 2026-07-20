import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateNumaPostgresPreflight, REQUIRED_NUMA_POSTGRES_RELATIONS } from './preflight-numa-postgres';

function safeRole() {
  return {
    transaction_read_only: 'on',
    can_create_database_objects: false,
    can_create_schema_objects: false,
    is_superuser: false,
    can_create_role: false,
    can_create_database: false,
    can_replicate: false,
    can_bypass_rls: false
  };
}

function safeTables() {
  return REQUIRED_NUMA_POSTGRES_RELATIONS.map((table_name) => ({
    table_name,
    resolved_name: `public.${table_name}`,
    can_select: true,
    can_insert: false,
    can_update: false,
    can_delete: false,
    can_truncate: false,
    can_references: false,
    can_trigger: false
  }));
}

test('Numa PostgreSQL preflight accepts all ten visible SELECT-only relations', () => {
  const result = evaluateNumaPostgresPreflight({ tables: safeTables(), role: safeRole() });
  assert.equal(result.passed, true);
  assert.equal(result.table_results.length, 10);
  assert.deepEqual(result.errors, []);
});

test('Numa PostgreSQL preflight rejects missing tables and effective write privileges', () => {
  const tables = safeTables();
  tables[0] = { ...tables[0], resolved_name: null };
  tables[1] = { ...tables[1], can_update: true };
  const result = evaluateNumaPostgresPreflight({ tables, role: safeRole() });
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /not visible/);
  assert.match(result.errors.join('\n'), /can_update/);
});

test('Numa PostgreSQL preflight rejects create and elevated role privileges', () => {
  const result = evaluateNumaPostgresPreflight({
    tables: safeTables(),
    role: { ...safeRole(), can_create_schema_objects: true, is_superuser: true }
  });
  assert.equal(result.passed, false);
  assert.match(result.errors.join('\n'), /CREATE in a schema/);
  assert.match(result.errors.join('\n'), /elevated PostgreSQL role attributes/);
});
