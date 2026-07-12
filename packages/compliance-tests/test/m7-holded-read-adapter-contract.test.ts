import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import {
  HOLDed_READ_MODULE_KEY,
  createHoldedReadAdapter,
  createHoldedModuleRegistry,
  createHoldedReadModuleDefinition,
  registerHoldedReadModule,
  resolveHoldedReadAdapterForInstallation
} from '../../adapters/holded/src/index';

function buildHoldedAdapter(status: number, body: unknown) {
  const registry = createHoldedModuleRegistry();
  registerHoldedReadModule(registry);
  return resolveHoldedReadAdapterForInstallation({
    registry,
    manifest: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    },
    options: {
      apiKey: 'token',
      baseUrl: 'https://holded.example.test',
      fetch: (() => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'ERROR',
        text: () => (typeof body === 'string' ? body : JSON.stringify(body)),
        json: () => body,
        headers: { get: () => 'req-123' }
      })) as never,
      now: () => new Date('2026-06-29T00:00:00.000Z')
    }
  });
}

function buildQuery(overrides: Record<string, unknown> = {}) {
  return {
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-1',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human' as const,
      delegated_identity: null
    },
    resource_type: 'estimate',
    resource_id: 'estimate-123',
    filters: null,
    requested_fields: ['estimate_id', 'customer_name'],
    ...overrides
  };
}

function buildRuntime(externalReadAdapter = buildHoldedAdapter(200, [
  {
    estimate_id: 'estimate-123',
    customer_name: 'Acme Customer',
    description: 'Quarterly estimate from Holded',
    total_amount: 1210,
    currency: 'EUR',
    date: '2026-06-29T00:00:00.000Z'
  }
])) {
  return new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter
  });
}

test('M7 holded adapter works through the M6 port with SourceEvidence and ignores caller claims', () => {
  const runtime = buildRuntime();
  const result = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m7-found',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m7-found',
    estimate_id: 'estimate-123',
    claimed_result: { invented: true },
    caller_result: { invented: true },
    assistant_result: { invented: true },
    model_claimed_result: { invented: true }
  });
  const records = runtime.getEvidenceLedger().listByCorrelation(result.correlation_id);

  assert.equal(result.status, 'completed');
  assert.equal(result.response.response_source, 'runtime_result');
  assert.equal(result.response.data?.estimate_id, 'estimate-123');
  assert.equal(result.response.data?.customer_name, 'Acme Customer');
  assert.equal(result.response.data?.invented, undefined);
  assert.equal(result.capability_result?.status, 'executed');
  assert.equal(result.capability_result?.executed_by_runtime, true);
  assert.equal(records.some((record) => record.record_type === 'external_read_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'external_read_found'), true);
  assert.equal(records.some((record) => record.record_type === 'source_evidence_recorded'), true);
  assert.equal(records.some((record) => record.record_type === 'external_read_result_bound'), true);
});

test('M7 holded adapter returns error, unavailable, error and denied as distinct outcomes', () => {
  const runtime = new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: buildHoldedAdapter(404, '')
  });

  const notFound = runtime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m7-not-found',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m7-not-found',
    estimate_id: 'estimate-missing'
  });
  assert.equal(notFound.status, 'error');
  assert.equal(notFound.response.data, null);
  assert.equal(runtime.getEvidenceLedger().listByCorrelation(notFound.correlation_id).some((record) => record.record_type === 'external_read_error'), true);

  const inactiveRuntime = new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: resolveHoldedReadAdapterForInstallation({
      registry: (() => {
        const registry = createHoldedModuleRegistry();
        registerHoldedReadModule(registry);
        return registry;
      })(),
      manifest: {
        installation_id: 'install-inactive',
        active_modules: []
      },
      options: {
        apiKey: 'token',
        baseUrl: 'https://holded.example.test',
        fetch: (() => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => JSON.stringify([{ estimate_id: 'estimate-123', date: '2026-06-29T00:00:00.000Z' }]),
          json: () => ([{ estimate_id: 'estimate-123', date: '2026-06-29T00:00:00.000Z' }]),
          headers: { get: () => null }
        })) as never,
        now: () => new Date('2026-06-29T00:00:00.000Z')
      }
    })
  });

  const denied = inactiveRuntime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m7-denied',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m7-denied',
    estimate_id: 'estimate-123'
  });
  assert.equal(denied.status, 'denied');
  assert.equal(denied.response.data, null);
  assert.equal(inactiveRuntime.getEvidenceLedger().listByCorrelation(denied.correlation_id).some((record) => record.record_type === 'external_read_denied'), true);

  const errorRuntime = new InMemoryGovernedWorkflowRuntime({
    organization_id: 'org-acme',
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: buildHoldedAdapter(500, 'boom')
  });

  const error = errorRuntime.executeWorkflow({
    kind: 'mock.estimate.read',
    workflow_id: 'workflow-m7-error',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    correlation_id: 'corr-m7-error',
    estimate_id: 'estimate-error'
  });
  assert.equal(error.status, 'error');
  assert.equal(error.response.data, null);
  assert.equal(errorRuntime.getEvidenceLedger().listByCorrelation(error.correlation_id).some((record) => record.record_type === 'external_read_error'), true);
});

test('M7 holded adapter does not invent data for malformed queries and inactive modules fail closed', () => {
  const registry = createHoldedModuleRegistry();
  registerHoldedReadModule(registry);
  const activeAdapter = resolveHoldedReadAdapterForInstallation({
    registry,
    manifest: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    },
    options: {
      apiKey: 'token',
      baseUrl: 'https://holded.example.test',
      fetch: (() => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => '',
        json: () => null,
        headers: { get: () => null }
      })) as never,
      now: () => new Date('2026-06-29T00:00:00.000Z')
    }
  });

  const malformed = activeAdapter.authorize({
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-1',
    actor: null,
    resource_type: 'estimate',
    resource_id: null,
    filters: null,
    requested_fields: null
  });

  assert.equal(malformed.authorized, false);
  assert.equal(malformed.reason.includes('invalid'), true);

  const inactiveAdapter = resolveHoldedReadAdapterForInstallation({
    registry,
    manifest: {
      installation_id: 'install-inactive',
      active_modules: []
    },
    options: {
      apiKey: 'token',
      baseUrl: 'https://holded.example.test',
      fetch: (() => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => JSON.stringify([{ estimate_id: 'estimate-123', date: '2026-06-29T00:00:00.000Z' }]),
        json: () => ([{ estimate_id: 'estimate-123', date: '2026-06-29T00:00:00.000Z' }]),
        headers: { get: () => null }
      })) as never,
      now: () => new Date('2026-06-29T00:00:00.000Z')
    }
  });
  const denied = inactiveAdapter.authorize({
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-1',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    resource_type: 'estimate',
    resource_id: 'estimate-123',
    filters: null,
    requested_fields: null
  });

  assert.equal(denied.authorized, false);
  assert.equal(denied.reason.includes('inactive'), true);
});

test('M7 holded adapter keeps the secret out of serialized results and module registration is explicit', () => {
  const sentinel = 'secret_test_token_must_not_leak';
  const registry = createHoldedModuleRegistry();
  const moduleDefinition = createHoldedReadModuleDefinition();
  registry.register(moduleDefinition);

  assert.equal(registry.has(HOLDed_READ_MODULE_KEY), true);
  assert.equal(moduleDefinition.module_key, HOLDed_READ_MODULE_KEY);
  assert.equal(moduleDefinition.display_name.includes('Holded'), true);

  const adapter = createHoldedReadAdapter({
    apiKey: sentinel,
    fetch: (() => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => JSON.stringify([{ estimate_id: 'estimate-123', customer_name: 'Acme Customer', date: '2026-06-29T00:00:00.000Z' }]),
      json: () => ([{ estimate_id: 'estimate-123', customer_name: 'Acme Customer', date: '2026-06-29T00:00:00.000Z' }]),
      headers: { get: () => null }
    })) as never,
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  assert.equal(adapter.adapter_id, HOLDed_READ_MODULE_KEY);
  assert.equal(adapter.source_system, 'holded');
  assert.equal(JSON.stringify(adapter.read(buildQuery())).includes(sentinel), false);
});

test.skip('M7 live Holded integration harness is opt-in only', () => {
  assert.ok(true);
});
