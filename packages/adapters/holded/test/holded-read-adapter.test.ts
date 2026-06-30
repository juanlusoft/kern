import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLDed_READ_MODULE_KEY,
  createHoldedReadAdapter,
  createHoldedModuleRegistry,
  createHoldedReadModuleDefinition,
  registerHoldedReadModule,
  resolveHoldedReadAdapterForInstallation,
  type HoldedFetchResponse
} from '../src/index';
import { normalizeResourceQuery, type ResourceQuery } from '../../../contracts/src/index';

function buildQuery(overrides: Partial<ResourceQuery> = {}): ResourceQuery {
  return normalizeResourceQuery({
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
    requested_fields: ['estimate_id', 'customer_name', 'total_amount'],
    ...overrides
  });
}

function createFetchStub(response: { status: number; body: unknown; headers?: Record<string, string> }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchStub = (url: string | URL | Request, init?: RequestInit): HoldedFetchResponse => {
    calls.push({ url: String(url), init });
    const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'ERROR',
      text: () => body,
      json: () => (typeof response.body === 'string' ? JSON.parse(response.body) : response.body),
      headers: {
        get(name: string) {
          return response.headers?.[name.toLowerCase()] ?? null;
        }
      }
    };
  };
  return { fetchStub, calls };
}

test('Holded adapter returns found with SourceEvidence and hides API key from outputs', () => {
  const sentinel = 'secret_test_token_must_not_leak';
  const { fetchStub, calls } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-123',
        customer_id: 'customer-001',
        customer_name: 'Acme Customer',
        total_amount: 1210,
        currency: 'EUR',
        date: '2026-06-29T00:00:00.000Z'
      }
    ]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: sentinel,
    fetch: fetchStub,
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(buildQuery());
  const serialized = JSON.stringify(result);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /holded\.example\.test\/api\/invoicing\/v1\/documents\/estimate/);
  assert.equal((calls[0].init?.headers as Record<string, string> | undefined)?.key, sentinel);
  assert.equal(result.status, 'found');
  assert.equal(result.produced_by_adapter, true);
  assert.equal(result.data?.estimate_id, 'estimate-123');
  assert.equal(result.data?.customer_name, 'Acme Customer');
  assert.ok(result.source_evidence);
  assert.ok(result.source_evidence.length > 0);
  assert.equal(result.source_evidence[0].source_system, 'holded');
  assert.equal(result.source_evidence[0].resource_id, 'estimate-123');
  assert.equal(result.source_evidence[0].correlation_id, 'corr-1');
  assert.equal(serialized.includes(sentinel), false);
});

test('Holded adapter supports customer lookup when the query fits ResourceQuery naturally', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-456-old',
        customer_id: 'customer-001',
        customer_name: 'Acme Customer',
        total_amount: 2100,
        currency: 'EUR',
        date: '2026-06-28T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-456',
        customer_id: 'customer-001',
        customer_name: 'Acme Customer',
        total_amount: 2200,
        currency: 'EUR',
        date: '2026-06-29T00:00:00.000Z'
      }
    ]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery({
      resource_id: null,
      filters: { customer_id: 'customer-001' }
    })
  );

  assert.equal(result.status, 'found');
  assert.equal(result.data?.estimate_id, 'estimate-456');
  assert.equal(result.data?.customer_id, 'customer-001');
});

test('Holded adapter supports contact lookup and chooses the latest estimate by date', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-contact-old',
        contact_id: 'contact-001',
        contact_name: 'Acme Contact',
        total_amount: 1000,
        currency: 'EUR',
        date: '2026-06-28T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-contact-new',
        contact_id: 'contact-001',
        contact_name: 'Acme Contact',
        total_amount: 1100,
        currency: 'EUR',
        date: '2026-06-29T00:00:00.000Z'
      }
    ]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery({
      resource_id: null,
      filters: { contact_name: 'Acme Contact' }
    })
  );

  assert.equal(result.status, 'found');
  assert.equal(result.data?.estimate_id, 'estimate-contact-new');
  assert.equal(result.data?.contact_name, 'Acme Contact');
});

test('Holded adapter distinguishes error unavailable error denied and blocked', () => {
  const notFound = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => '',
      json: () => null,
      headers: { get: () => null }
    }),
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;
  const unavailable = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: () => {
      throw new TypeError('network down');
    },
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;
  const error = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: () => 'boom',
      json: () => ({ message: 'boom' }),
      headers: { get: () => null }
    }),
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;
  const blocked = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: () => {
      throw new Error('malformed query should not reach transport');
    },
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const notFoundResult = notFound.read(buildQuery({ resource_id: 'estimate-missing' }));
  const unavailableResult = unavailable.read(buildQuery({ resource_id: 'estimate-offline' }));
  const errorResult = error.read(buildQuery({ resource_id: 'estimate-error' }));
  const blockedResult = blocked.read(
    buildQuery({
      resource_id: null,
      filters: null
    })
  );

  assert.equal(notFoundResult.status, 'error');
  assert.equal(unavailableResult.status, 'unavailable');
  assert.equal(errorResult.status, 'error');
  assert.equal(blockedResult.status, 'blocked');
});

test('Holded adapter rejects payloads without source evidence and caller/model claims are ignored', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-123',
        customer_name: 'Acme Customer',
        date: '2026-06-29T00:00:00.000Z'
      }
    ]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read({
    ...buildQuery(),
    claimed_result: { estimate_id: 'invented' },
    caller_result: { estimate_id: 'invented' },
    assistant_result: { estimate_id: 'invented' },
    model_claimed_result: { estimate_id: 'invented' }
  });

  assert.equal(result.status, 'found');
  assert.ok(result.source_evidence);
  assert.equal(result.source_evidence.length > 0, true);
  assert.equal(result.data?.estimate_id, 'estimate-123');
  assert.equal(JSON.stringify(result).includes('invented'), false);
});

test('Holded module registry resolves installation activation per installation', () => {
  const registry = createHoldedModuleRegistry();
  registerHoldedReadModule(registry);
  let inactiveCalls = 0;

  const activeAdapter = resolveHoldedReadAdapterForInstallation({
    registry,
    manifest: {
      installation_id: 'install-active',
      active_modules: [HOLDed_READ_MODULE_KEY]
    },
    options: {
      apiKey: 'token',
      fetch: () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => '',
        json: () => null,
        headers: { get: () => null }
      }),
      now: () => new Date('2026-06-29T00:00:00.000Z')
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;
  const inactiveAdapter = resolveHoldedReadAdapterForInstallation({
    registry,
    manifest: {
      installation_id: 'install-inactive',
      active_modules: []
    },
    options: {
      apiKey: 'token',
      fetch: () => {
        inactiveCalls += 1;
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => '',
          json: () => null,
          headers: { get: () => null }
        };
      },
      now: () => new Date('2026-06-29T00:00:00.000Z')
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  assert.equal(activeAdapter.adapter_id, HOLDed_READ_MODULE_KEY);
  assert.equal(inactiveAdapter.adapter_id, HOLDed_READ_MODULE_KEY);
  assert.equal(inactiveCalls, 0);
  const inactiveResult = inactiveAdapter.read(buildQuery());
  assert.equal(inactiveCalls, 0);
  assert.equal(inactiveResult.status, 'denied');
  assert.equal(inactiveAdapter.authorize(buildQuery()).authorized, false);
  assert.equal(inactiveAdapter.authorize(buildQuery()).reason.includes('inactive'), true);
});

test('Holded adapter keeps the secret out of serialized results', () => {
  const sentinel = 'secret_test_token_must_not_leak';
  const registry = createHoldedModuleRegistry();
  const moduleDefinition = createHoldedReadModuleDefinition();
  registry.register(moduleDefinition);

  assert.equal(registry.has(HOLDed_READ_MODULE_KEY), true);
  assert.equal(moduleDefinition.module_key, HOLDed_READ_MODULE_KEY);
  assert.equal(moduleDefinition.display_name.includes('Holded'), true);

  const adapter = createHoldedReadAdapter({
    apiKey: sentinel,
    fetch: () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => JSON.stringify([{ estimate_id: 'estimate-123', customer_name: 'Acme Customer', date: '2026-06-29T00:00:00.000Z' }]),
      json: () => ([{ estimate_id: 'estimate-123', customer_name: 'Acme Customer', date: '2026-06-29T00:00:00.000Z' }]),
      headers: { get: () => null }
    }),
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

// Live integration remains opt-in by documentation; the default test suite stays offline and deterministic.
