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
import { normalizeResourceQuery, type ResourceListResultData, type ResourceQuery } from '../../../contracts/src/index';

function buildQuery(
  resource_type_or_overrides: 'estimate' | 'invoice' | Partial<ResourceQuery> = 'estimate',
  overrides: Partial<ResourceQuery> = {}
): ResourceQuery {
  const resource_type =
    typeof resource_type_or_overrides === 'string' ? resource_type_or_overrides : 'estimate';
  const mergedOverrides =
    typeof resource_type_or_overrides === 'string' ? overrides : resource_type_or_overrides;
  return normalizeResourceQuery({
    query_id: 'query-1',
    organization_id: 'org-acme',
    correlation_id: 'corr-1',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    resource_type,
    resource_id: 'estimate-123',
    filters: null,
    requested_fields: ['estimate_id', 'customer_name', 'total_amount'],
    ...mergedOverrides
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

function createPagedFetchStub(pages: Record<number, unknown[]>, responseStatus = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchStub = (url: string | URL | Request, init?: RequestInit): HoldedFetchResponse => {
    calls.push({ url: String(url), init });
    const requestUrl = new URL(String(url));
    const page = Number(requestUrl.searchParams.get('page') ?? '1');
    const body = pages[page] ?? [];
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      statusText: responseStatus === 200 ? 'OK' : 'ERROR',
      text: () => JSON.stringify(body),
      json: () => body,
      headers: {
        get(name: string) {
          return null;
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

test('Holded adapter reads invoices with the same governed pattern as estimates', () => {
  const sentinel = 'secret_test_token_must_not_leak';
  const { fetchStub, calls } = createFetchStub({
    status: 200,
    body: [
      {
        invoice_id: 'F26/1931',
        docNumber: 'F26/1931',
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

  const result = adapter.read(buildQuery('invoice', { resource_id: 'F26/1931' }));
  const serialized = JSON.stringify(result);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /holded\.example\.test\/api\/invoicing\/v1\/documents\/invoice/);
  assert.equal((calls[0].init?.headers as Record<string, string> | undefined)?.key, sentinel);
  assert.equal(result.status, 'found');
  assert.equal(result.produced_by_adapter, true);
  assert.equal(result.data?.resource_type, 'invoice');
  assert.equal(result.data?.invoice_id, 'F26/1931');
  assert.equal(result.data?.customer_name, 'Acme Customer');
  assert.ok(result.source_evidence);
  assert.ok(result.source_evidence.length > 0);
  assert.equal(result.source_evidence[0].source_type, 'invoice');
  assert.equal(result.source_evidence[0].resource_id, 'F26/1931');
  assert.equal(result.source_evidence[0].correlation_id, 'corr-1');
  assert.equal(serialized.includes(sentinel), false);
});

test('Holded adapter returns invoice payment-status lists with aggregate and SourceEvidence', () => {
  const sentinel = 'secret_test_token_must_not_leak';
  const { fetchStub, calls } = createFetchStub({
    status: 200,
    body: [
      {
        invoice_id: 'F26/1930',
        docNumber: 'F26/1930',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        paymentsPending: 1100,
        dueDate: '2024-03-09T00:00:00.000Z',
        total_amount: 1100,
        currency: 'EUR',
        date: '2024-03-09T00:00:00.000Z'
      },
      {
        invoice_id: 'F26/1931',
        docNumber: 'F26/1931',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'MUPIS PAPEL' }],
        paymentsPending: 1200,
        dueDate: '2024-07-03T00:00:00.000Z',
        total_amount: 1200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        invoice_id: 'F26/1932',
        docNumber: 'F26/1932',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'Vinilo Monomérico Plus' }],
        paymentsPending: 1300,
        dueDate: '2024-07-02T00:00:00.000Z',
        total_amount: 1300,
        currency: 'EUR',
        date: '2024-07-02T00:00:00.000Z'
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

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );
  const serialized = JSON.stringify(result);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /holded\.example\.test\/api\/invoicing\/v1\/documents\/invoice/);
  assert.equal((calls[0].init?.headers as Record<string, string> | undefined)?.key, sentinel);
  assert.equal(result.status, 'found');
  assert.equal(result.produced_by_adapter, true);
  const listData = result.data as unknown as ResourceListResultData;
  assert.equal(listData.kind, 'list');
  assert.equal(listData.result_mode, 'list');
  assert.equal(listData.resource_type, 'invoice');
  assert.equal(listData.payment_status, 'overdue');
  assert.equal(listData.lookup_mode, 'by_customer');
  assert.equal(listData.records.length, 3);
  assert.equal(listData.records[0]?.record_id, 'F26/1931');
  assert.equal(listData.records[1]?.record_id, 'F26/1932');
  assert.equal(listData.records[2]?.record_id, 'F26/1930');
  assert.equal(listData.aggregate.count, 3);
  assert.equal(listData.aggregate.paymentsPendingTotal, 3600);
  assert.ok(result.source_evidence);
  assert.ok(result.source_evidence.length > 0);
  assert.equal(result.source_evidence[0].source_system, 'holded');
  assert.equal(result.source_evidence[0].resource_id, 'F26/1931');
  assert.equal(result.source_evidence[0].correlation_id, 'corr-1');
  assert.equal(serialized.includes(sentinel), false);
});

test('Holded adapter paginates invoice list queries across pages and aggregates deduplicated records', () => {
  const makeRecord = (index: number) => ({
    invoice_id: `F26/${String(index).padStart(4, '0')}`,
    docNumber: `F26/${String(index).padStart(4, '0')}`,
    customer_id: 'granapublic',
    customer_name: 'Granapublic Xx Sl',
    contactName: 'Granapublic Xx Sl',
    paymentsPending: 10,
    dueDate: '2024-03-09T00:00:00.000Z',
    total_amount: 10,
    currency: 'EUR',
    date: '2024-03-09T00:00:00.000Z'
  });
  const page1 = Array.from({ length: 500 }, (_, index) => makeRecord(index + 1));
  const page2 = Array.from({ length: 500 }, (_, index) => makeRecord(index + 501));
  const page3 = Array.from({ length: 120 }, (_, index) => makeRecord(index + 1001));
  const { fetchStub, calls } = createPagedFetchStub({ 1: page1, 2: page2, 3: page3 });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0].url).searchParams.get('page'), '1');
  assert.equal(new URL(calls[1].url).searchParams.get('page'), '2');
  assert.equal(new URL(calls[2].url).searchParams.get('page'), '3');
  assert.equal(new URL(calls[0].url).searchParams.get('customer_id'), 'granapublic');
  assert.equal(result.status, 'found');
  const listData = result.data as unknown as ResourceListResultData & { truncated?: boolean };
  assert.equal(listData.records.length, 1120);
  assert.equal(listData.aggregate.count, 1120);
  assert.equal(listData.aggregate.paymentsPendingTotal, 11200);
  assert.equal(listData.truncated, undefined);
  assert.equal(listData.records[0]?.record_id, 'F26/1120');
  assert.equal(listData.records[listData.records.length - 1]?.record_id, 'F26/0001');
});

test('Holded adapter stops after a short page and does not ask for the next page', () => {
  const makeRecord = (index: number) => ({
    invoice_id: `F26/${String(index).padStart(4, '0')}`,
    docNumber: `F26/${String(index).padStart(4, '0')}`,
    customer_id: 'granapublic',
    customer_name: 'Granapublic Xx Sl',
    contactName: 'Granapublic Xx Sl',
    paymentsPending: 10,
    dueDate: '2024-03-09T00:00:00.000Z',
    total_amount: 10,
    currency: 'EUR',
    date: '2024-03-09T00:00:00.000Z'
  });
  const { fetchStub, calls } = createPagedFetchStub({ 1: Array.from({ length: 120 }, (_, index) => makeRecord(index + 1)) });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('page'), '1');
  assert.equal(new URL(calls[0].url).searchParams.get('customer_id'), 'granapublic');
  assert.equal(result.status, 'found');
  const listData = result.data as unknown as ResourceListResultData & { truncated?: boolean };
  assert.equal(listData.records.length, 120);
  assert.equal(listData.aggregate.count, 120);
  assert.equal(listData.aggregate.paymentsPendingTotal, 1200);
  assert.equal(listData.truncated, undefined);
});

test('Holded adapter marks invoice lists as truncated when MAX_PAGES is reached with a full page', () => {
  const makeRecord = (index: number) => ({
    invoice_id: `F26/${String(index).padStart(4, '0')}`,
    docNumber: `F26/${String(index).padStart(4, '0')}`,
    customer_id: 'granapublic',
    customer_name: 'Granapublic Xx Sl',
    contactName: 'Granapublic Xx Sl',
    paymentsPending: 10,
    dueDate: '2024-03-09T00:00:00.000Z',
    total_amount: 10,
    currency: 'EUR',
    date: '2024-03-09T00:00:00.000Z'
  });
  const { fetchStub, calls } = createPagedFetchStub({
    1: [makeRecord(1), makeRecord(2)],
    2: [makeRecord(3), makeRecord(4)],
    3: [makeRecord(5), makeRecord(6)]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    page_size: 2,
    max_pages: 3,
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[2].url).searchParams.get('page'), '3');
  assert.equal(result.status, 'found');
  const listData = result.data as unknown as ResourceListResultData & { truncated?: boolean };
  assert.equal(listData.records.length, 6);
  assert.equal(listData.aggregate.count, 6);
  assert.equal(listData.aggregate.paymentsPendingTotal, 60);
  assert.equal(listData.truncated, true);
});

test('Holded adapter deduplicates invoice records by id across pages', () => {
  const makeRecord = (id: string, amount: number) => ({
    invoice_id: id,
    docNumber: id,
    customer_id: 'granapublic',
    customer_name: 'Granapublic Xx Sl',
    contactName: 'Granapublic Xx Sl',
    paymentsPending: amount,
    dueDate: '2024-03-09T00:00:00.000Z',
    total_amount: amount,
    currency: 'EUR',
    date: '2024-03-09T00:00:00.000Z'
  });
  const { fetchStub, calls } = createPagedFetchStub({
    1: [makeRecord('F26/5001', 10), makeRecord('F26/5002', 20)],
    2: [makeRecord('F26/5002', 20), makeRecord('F26/5003', 30)],
    3: []
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    page_size: 2,
    max_pages: 3,
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(calls.length, 3);
  assert.equal(result.status, 'found');
  const listData = result.data as unknown as ResourceListResultData & { truncated?: boolean };
  assert.equal(listData.records.length, 3);
  assert.equal(listData.aggregate.count, 3);
  assert.equal(listData.aggregate.paymentsPendingTotal, 60);
  assert.equal(listData.truncated, undefined);
  assert.equal(listData.records[0]?.record_id, 'F26/5003');
  assert.equal(listData.records[1]?.record_id, 'F26/5002');
  assert.equal(listData.records[2]?.record_id, 'F26/5001');
});

test('Holded adapter preserves list query params while paginating', () => {
  const { fetchStub, calls } = createPagedFetchStub({
    1: [
      {
        invoice_id: 'F26/6001',
        docNumber: 'F26/6001',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        contactName: 'Granapublic Xx Sl',
        paymentsPending: 10,
        dueDate: '2024-03-09T00:00:00.000Z',
        total_amount: 10,
        currency: 'EUR',
        date: '2024-03-09T00:00:00.000Z'
      }
    ],
    2: []
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    page_size: 1,
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: {
        customer_id: 'granapublic',
        starttmp: '2024-01-01',
        endtmp: '2024-12-31'
      },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(calls.length, 2);
  const requestUrl = new URL(calls[0].url);
  assert.equal(requestUrl.searchParams.get('page'), '1');
  assert.equal(requestUrl.searchParams.get('customer_id'), 'granapublic');
  assert.equal(requestUrl.searchParams.get('starttmp'), '2024-01-01');
  assert.equal(requestUrl.searchParams.get('endtmp'), '2024-12-31');
  assert.equal(result.status, 'found');
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).searchParams.get('page'), '2');
  assert.equal(new URL(calls[1].url).searchParams.get('customer_id'), 'granapublic');
  assert.equal(new URL(calls[1].url).searchParams.get('starttmp'), '2024-01-01');
  assert.equal(new URL(calls[1].url).searchParams.get('endtmp'), '2024-12-31');
});

test('Holded adapter keeps direct lookup by id on a single fetch path', () => {
  const { fetchStub, calls } = createFetchStub({
    status: 200,
    body: [
      {
        invoice_id: 'F26/7001',
        docNumber: 'F26/7001',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        paymentsPending: 10,
        dueDate: '2024-03-09T00:00:00.000Z',
        total_amount: 10,
        currency: 'EUR',
        date: '2024-03-09T00:00:00.000Z'
      }
    ]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(buildQuery('invoice', { resource_id: 'F26/7001' }));

  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('page'), null);
  assert.equal(result.status, 'found');
  assert.equal(result.data?.invoice_id, 'F26/7001');
});

test('Holded adapter normalizes due dates from seconds milliseconds and ISO strings', () => {
  const cases = [
    {
      resource_id: 'F26/2001',
      dueDate: Date.parse('2024-07-01T00:00:00.000Z') / 1000,
      expected_dueDate: Date.parse('2024-07-01T00:00:00.000Z')
    },
    {
      resource_id: 'F26/2002',
      dueDate: Date.parse('2024-07-02T00:00:00.000Z'),
      expected_dueDate: Date.parse('2024-07-02T00:00:00.000Z')
    },
    {
      resource_id: 'F26/2003',
      dueDate: '2024-07-03T00:00:00.000Z',
      expected_dueDate: Date.parse('2024-07-03T00:00:00.000Z')
    }
  ] as const;

  for (const testCase of cases) {
    const { fetchStub } = createFetchStub({
      status: 200,
      body: [
        {
          invoice_id: testCase.resource_id,
          docNumber: testCase.resource_id,
          customer_id: 'granapublic',
          customer_name: 'Granapublic Xx Sl',
          paymentsPending: 1200,
          dueDate: testCase.dueDate,
          total_amount: 1200,
          currency: 'EUR',
          date: '2024-07-03T00:00:00.000Z'
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

    const result = adapter.read(buildQuery('invoice', { resource_id: testCase.resource_id }));

    assert.equal(result.status, 'found');
    assert.equal(result.data?.invoice_id, testCase.resource_id);
    assert.equal(result.data?.dueDate, testCase.expected_dueDate);
  }
});

test('Holded adapter keeps pending and paid semantics unchanged while normalizing due dates', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        invoice_id: 'F26/3001',
        docNumber: 'F26/3001',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        status: 0,
        paymentsPending: 1100,
        dueDate: Date.parse('2024-07-01T00:00:00.000Z') / 1000,
        total_amount: 1100,
        currency: 'EUR',
        date: '2024-07-02T00:00:00.000Z'
      },
      {
        invoice_id: 'F26/3002',
        docNumber: 'F26/3002',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        status: 1,
        paymentsPending: 0,
        dueDate: Date.parse('2024-07-03T00:00:00.000Z'),
        total_amount: 1200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
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

  const pendingResult = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'pending',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );
  const paidResult = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'paid',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(pendingResult.status, 'found');
  assert.equal(paidResult.status, 'found');
  assert.equal((pendingResult.data as unknown as ResourceListResultData).records[0]?.record_id, 'F26/3001');
  assert.equal((paidResult.data as unknown as ResourceListResultData).records[0]?.record_id, 'F26/3002');
});

test('Holded adapter only treats genuinely overdue invoices as overdue when due dates are normalized', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        invoice_id: 'F26/4001',
        docNumber: 'F26/4001',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        paymentsPending: 1100,
        dueDate: Date.parse('2024-07-01T00:00:00.000Z') / 1000,
        total_amount: 1100,
        currency: 'EUR',
        date: '2024-07-01T00:00:00.000Z'
      },
      {
        invoice_id: 'F26/4002',
        docNumber: 'F26/4002',
        customer_id: 'granapublic',
        customer_name: 'Granapublic Xx Sl',
        paymentsPending: 1200,
        dueDate: Date.parse('2024-07-03T00:00:00.000Z') / 1000,
        total_amount: 1200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      }
    ]
  });
  const adapter = createHoldedReadAdapter({
    apiKey: 'token',
    fetch: fetchStub,
    now: () => new Date('2024-07-02T00:00:00.000Z'),
    baseUrl: 'https://holded.example.test',
    installation: {
      installation_id: 'install-acme',
      active_modules: [HOLDed_READ_MODULE_KEY]
    }
  }) as ReturnType<typeof createHoldedReadAdapter>;

  const result = adapter.read(
    buildQuery('invoice', {
      resource_id: null,
      payment_status: 'overdue',
      filters: { customer_id: 'granapublic' },
      requested_fields: ['invoice_id', 'customer_name', 'paymentsPending', 'dueDate', 'total_amount']
    })
  );

  assert.equal(result.status, 'found');
  const listData = result.data as unknown as ResourceListResultData;
  assert.equal(listData.aggregate.count, 1);
  assert.equal(listData.aggregate.paymentsPendingTotal, 1100);
  assert.equal(listData.records[0]?.record_id, 'F26/4001');
  assert.equal(listData.records[0]?.dueDate, Date.parse('2024-07-01T00:00:00.000Z'));
});

test('Holded adapter prefers customer lookup over invented ids and matches normalized names', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'P26/04366',
        docNumber: 'P26/04366',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'Producto antiguo' }],
        total_amount: 2100,
        currency: 'EUR',
        date: '2024-03-09T00:00:00.000Z'
      },
      {
        estimate_id: 'P26/04367',
        docNumber: 'P26/04367',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'Vinilo Monomerico' }],
        total_amount: 2200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'P26/04368',
        docNumber: 'P26/04368',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'Vinilo Monomérico Plus' }],
        total_amount: 2300,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-other',
        contact: 'contact-other',
        contactName: 'Other Customer',
        products: [{ name: 'Otro producto' }],
        total_amount: 1800,
        currency: 'EUR',
        date: '2024-08-15T00:00:00.000Z'
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

  const customerLookupQueries = [
    buildQuery({
      resource_id: 'estimate-12345',
      filters: { customer_id: 'granapublic' }
    }),
    buildQuery({
      resource_id: 'estimate-12345',
      filters: { customer_name: 'Granapublic' }
    }),
    buildQuery({
      resource_id: 'estimate-12345',
      filters: { contact_name: 'granapublic' }
    }),
    buildQuery({
      resource_id: 'estimate-12345',
      filters: { contactName: 'GRANAPUBLIC' }
    }),
    buildQuery({
      resource_id: 'estimate-12345',
      filters: { contact: 'granapublic' }
    })
  ];

  for (const query of customerLookupQueries) {
    const result = adapter.read(query);
    const resultData = result.data as { products?: Array<{ name?: string }>; contactName?: string } | null;
    assert.equal(result.status, 'found');
    assert.equal(result.data?.estimate_id, 'P26/04368');
    assert.equal((result.data as { docNumber?: string } | null)?.docNumber, 'P26/04368');
    assert.equal(result.data?.contactName, 'Granapublic Xx Sl');
    assert.equal(result.data?.lookup_mode, 'by_customer');
    assert.equal(resultData?.products?.[0]?.name, 'Vinilo Monomérico Plus');
    assert.equal(result.source_evidence?.[0]?.record_id, 'P26/04368');
  }
});

test('Holded adapter chooses the latest estimate by date before comparing document numbers', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'P26/04366',
        docNumber: 'P26/04366',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 2100,
        currency: 'EUR',
        date: '2024-07-02T00:00:00.000Z'
      },
      {
        estimate_id: 'P26/04368',
        docNumber: 'P26/04368',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 2300,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'P26/04367',
        docNumber: 'P26/04367',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 2200,
        currency: 'EUR',
        date: '2024-07-04T00:00:00.000Z'
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
      filters: { customer_id: 'granapublic' }
    })
  );

  assert.equal(result.status, 'found');
  assert.equal(result.data?.estimate_id, 'P26/04367');
  assert.equal((result.data as { docNumber?: string } | null)?.docNumber, 'P26/04367');
  assert.equal(result.source_evidence?.[0]?.record_id, 'P26/04367');
});

test('Holded adapter chooses the latest estimate by normalized date before comparing document numbers', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-seconds-old',
        docNumber: 'P26/010',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 1000,
        currency: 'EUR',
        date: Date.parse('2024-07-01T00:00:00.000Z') / 1000
      },
      {
        estimate_id: 'estimate-iso-middle',
        docNumber: 'P26/011',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 1100,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-ms-new',
        docNumber: 'P26/012',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 1200,
        currency: 'EUR',
        date: Date.parse('2024-07-04T00:00:00.000Z')
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
      filters: { customer_name: 'Granapublic' }
    })
  );

  assert.equal(result.status, 'found');
  assert.equal(result.data?.estimate_id, 'estimate-ms-new');
  assert.equal((result.data as { docNumber?: string } | null)?.docNumber, 'P26/012');
  assert.equal(result.source_evidence?.[0]?.record_id, 'estimate-ms-new');
});

test('Holded adapter compares document numbers naturally when dates match', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-9',
        docNumber: 'P26/9',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 900,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-10',
        docNumber: 'P26/10',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 1000,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-2',
        docNumber: 'P26/2',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
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
      filters: { customer_name: 'Granapublic' }
    })
  );

  assert.equal(result.status, 'found');
  assert.equal(result.data?.estimate_id, 'estimate-10');
  assert.equal((result.data as { docNumber?: string } | null)?.docNumber, 'P26/10');
  assert.equal(result.source_evidence?.[0]?.record_id, 'estimate-10');
});

test('Holded adapter uses id as the final tie-break when dates and document numbers match', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-001',
        docNumber: 'P26/04368',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 2100,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
      },
      {
        estimate_id: 'estimate-002',
        docNumber: 'P26/04368',
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        total_amount: 2300,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
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
      filters: { customer_name: 'Granapublic' }
    })
  );

  assert.equal(result.status, 'found');
  assert.equal(result.data?.estimate_id, 'estimate-002');
  assert.equal((result.data as { docNumber?: string } | null)?.docNumber, 'P26/04368');
  assert.equal(result.source_evidence?.[0]?.record_id, 'estimate-002');
});

test('Holded adapter returns not_found for customer searches with no matching documents and does not invent ids', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        estimate_id: 'estimate-other',
        contact: 'contact-other',
        contactName: 'Other Customer',
        products: [{ name: 'Otro producto' }],
        total_amount: 1800,
        currency: 'EUR',
        date: '2024-08-15T00:00:00.000Z'
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
      resource_id: 'estimate-12345',
      filters: { customer_id: 'granapublic' }
    })
  );

  assert.equal(result.status, 'not_found');
  assert.equal(result.data, null);
  assert.equal(result.source_evidence, null);
  assert.equal(result.error, 'Holded estimate not found');
});

test('Holded adapter returns error when a matching customer record has no real id', () => {
  const { fetchStub } = createFetchStub({
    status: 200,
    body: [
      {
        contact: 'contact-granapublic',
        contactName: 'Granapublic Xx Sl',
        products: [{ name: 'Vinilo Monomerico' }],
        total_amount: 2200,
        currency: 'EUR',
        date: '2024-07-03T00:00:00.000Z'
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
      resource_id: 'estimate-12345',
      filters: { customer_id: 'granapublic' }
    })
  );

  assert.equal(result.status, 'error');
  assert.equal(result.data, null);
  assert.equal(result.source_evidence, null);
  assert.equal(result.error, 'Holded estimate missing id');
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
