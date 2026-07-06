import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoldedReadAdapter, type HoldedFetchResponse } from '../../adapters/holded/src/index';
import { MockOrchestrator, createMockOrchestrator } from '../../orchestrators/mock/src/index';
import { InMemoryOrchestrationBoundary, type OrchestrationBoundaryOptions } from '../src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import type { OrchestrationRequest } from '../../contracts/src/index';

function buildRequest(overrides: Partial<OrchestrationRequest> = {}): OrchestrationRequest {
  return {
    request_id: 'request-1',
    user_message: 'Necesito el presupuesto estimate-123 del cliente customer-001',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-1',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    },
    ...overrides
  };
}

function buildReadProposal(params: Record<string, unknown>, keywords: string[] = ['vencidas']) {
  return {
    keywords,
    capability_key: 'mock.resource.read',
    reason: 'invoice list route selected from message keywords',
    confidence: 1,
    buildParams: () => params
  } as const;
}

function buildHoldedFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = (url: string | URL | Request, init?: RequestInit): HoldedFetchResponse => {
    calls.push({ url: String(url), init });
    if (status === 0) {
      throw new Error('network down');
    }
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'ERROR',
      text: () => text,
      json: () => (typeof body === 'string' ? JSON.parse(body) : body),
      headers: { get: () => null }
    };
  };
  return { fetch, calls };
}

function buildBoundary(options: Partial<OrchestrationBoundaryOptions> = {}) {
  const runtime =
    options.workflowRuntime ??
    new InMemoryGovernedWorkflowRuntime({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      externalReadAdapter:
        options.orchestrator === null
          ? undefined
          : createHoldedReadAdapter({
              apiKey: 'token',
              fetch: buildHoldedFetch(200, {
                estimate_id: 'estimate-123',
                customer_id: 'customer-001',
                customer_name: 'Acme Customer',
                total_amount: 1210,
                currency: 'EUR'
              }).fetch,
              now: () => new Date('2026-06-29T00:00:00.000Z'),
              installation: {
                installation_id: 'install-acme',
                active_modules: ['holded-read']
              }
            })
    });

  return new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator:
      options.orchestrator ?? createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
    installationCapabilities: {
      'install-acme': ['mock.resource.read'],
      'install-email': ['mock.email.send']
    },
    ...options
  });
}

test('M8 executes a validated proposal through the governed read runtime and preserves SourceEvidence in runtime output', () => {
  const holded = buildHoldedFetch(200, {
    estimate_id: 'estimate-123',
    customer_id: 'customer-001',
    customer_name: 'Acme Customer',
    total_amount: 1210,
    currency: 'EUR'
  });
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: createHoldedReadAdapter({
      apiKey: 'token',
      fetch: holded.fetch,
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      installation: {
        installation_id: 'install-acme',
        active_modules: ['holded-read']
      }
    })
  });
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator: createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
    installationCapabilities: {
      'install-acme': ['mock.resource.read']
    }
  });

  const outcome = boundary.execute(buildRequest());
  const records = runtime.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  assert.equal(outcome.workflow_result?.capability_result?.status, 'executed');
  assert.equal(
    (outcome.workflow_result?.capability_result?.output?.result.data as { estimate_id?: string } | undefined)?.estimate_id,
    'estimate-123'
  );
  assert.ok(outcome.workflow_result?.capability_result?.output?.result.source_evidence);
  assert.equal(records.some((record) => record.record_type === 'orchestration_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_created'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_validated'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
});

test('M8 forwards invoice payment status through the orchestration boundary into runtime list output', () => {
  const invoiceHolded = buildHoldedFetch(200, [
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1930',
      docNumber: 'F26/1930',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      status: 0,
      paymentsPending: 1100,
      dueDate: '2024-03-09T00:00:00.000Z',
      total_amount: 1100,
      currency: 'EUR',
      date: '2024-03-09T00:00:00.000Z'
    },
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1931',
      docNumber: 'F26/1931',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      products: [{ name: 'MUPIS PAPEL' }],
      status: 0,
      paymentsPending: 1200,
      dueDate: '2024-07-03T00:00:00.000Z',
      total_amount: 1200,
      currency: 'EUR',
      date: '2024-07-03T00:00:00.000Z'
    },
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1932',
      docNumber: 'F26/1932',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      products: [{ name: 'Vinilo Monomérico Plus' }],
      status: 0,
      paymentsPending: 1300,
      dueDate: '2024-07-02T00:00:00.000Z',
      total_amount: 1300,
      currency: 'EUR',
      date: '2024-07-02T00:00:00.000Z'
    }
  ]);
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: createHoldedReadAdapter({
      apiKey: 'token',
      fetch: invoiceHolded.fetch,
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      installation: {
        installation_id: 'install-acme',
        active_modules: ['holded-read']
      }
    })
  });
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [
        {
          keywords: ['vencidas'],
          capability_key: 'mock.resource.read',
          reason: 'invoice list route selected from message keywords',
          confidence: 1,
          buildParams: () => ({
            resource_type: 'invoice',
            payment_status: 'overdue',
            customer_id: 'Granapublic'
          })
        }
      ]
    }),
    installationCapabilities: {
      'install-acme': ['mock.resource.read']
    }
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'Necesito las facturas vencidas de Granapublic',
      correlation_id: 'corr-invoice-list'
    })
  );

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  const responseData = outcome.response.data as
    | {
        kind?: string;
        payment_status?: string;
        aggregate?: { count?: number; paymentsPendingTotal?: number };
        records?: Array<{ invoice_id?: string }>;
      }
    | null
    | undefined;
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.payment_status, 'overdue');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.paymentsPendingTotal, 3600);
  assert.equal(responseData?.records?.[0]?.invoice_id, 'F26/1931');
  assert.equal(responseData?.records?.[1]?.invoice_id, 'F26/1932');
  assert.equal(responseData?.records?.[2]?.invoice_id, 'F26/1930');
});

test('M8 accepts invoice payment-status proposals without a customer', () => {
  const invoiceHolded = buildHoldedFetch(200, [
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1930',
      docNumber: 'F26/1930',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      status: 0,
      paymentsPending: 1100,
      dueDate: '2024-03-09T00:00:00.000Z',
      total_amount: 1100,
      currency: 'EUR',
      date: '2024-03-09T00:00:00.000Z'
    },
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1931',
      docNumber: 'F26/1931',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      products: [{ name: 'MUPIS PAPEL' }],
      status: 0,
      paymentsPending: 1200,
      dueDate: '2024-07-03T00:00:00.000Z',
      total_amount: 1200,
      currency: 'EUR',
      date: '2024-07-03T00:00:00.000Z'
    },
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1932',
      docNumber: 'F26/1932',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      products: [{ name: 'Vinilo Monomérico Plus' }],
      status: 0,
      paymentsPending: 1300,
      dueDate: '2024-07-02T00:00:00.000Z',
      total_amount: 1300,
      currency: 'EUR',
      date: '2024-07-02T00:00:00.000Z'
    }
  ]);
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: createHoldedReadAdapter({
      apiKey: 'token',
      fetch: invoiceHolded.fetch,
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      installation: {
        installation_id: 'install-acme',
        active_modules: ['holded-read']
      }
    })
  });
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        payment_status: 'overdue'
      }, ['vencidas'])]
    }),
    installationCapabilities: {
      'install-acme': ['mock.resource.read']
    }
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'Necesito las facturas vencidas',
      correlation_id: 'corr-invoice-list-no-customer'
    })
  );

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  const responseData = outcome.response.data as
    | {
        kind?: string;
        payment_status?: string;
        aggregate?: { count?: number; paymentsPendingTotal?: number };
        records?: Array<{ invoice_id?: string }>;
      }
    | null
    | undefined;
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.payment_status, 'overdue');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.paymentsPendingTotal, 3600);
  assert.equal(responseData?.records?.[0]?.invoice_id, 'F26/1931');
  assert.equal(responseData?.records?.[1]?.invoice_id, 'F26/1932');
  assert.equal(responseData?.records?.[2]?.invoice_id, 'F26/1930');
});

test('M8 blocks invoice payment-status proposals that use estimate resource type', () => {
  const boundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'estimate',
        payment_status: 'overdue'
      }, ['vencidas'])]
    })
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'facturas vencidas',
      correlation_id: 'corr-estimate-payment-status'
    })
  );

  const records = boundary.getEvidenceLedger().listByCorrelation('corr-estimate-payment-status');
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'proposal params invalid');
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_blocked'), true);
});

test('M8 validates invoice payment-status proposals for pending and paid without a customer', () => {
  const pendingBoundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        payment_status: 'pending'
      }, ['pendientes'])]
    })
  });
  const paidBoundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        payment_status: 'paid'
      }, ['pagadas'])]
    })
  });

  const pendingOutcome = pendingBoundary.execute(
    buildRequest({
      user_message: 'facturas pendientes',
      correlation_id: 'corr-invoice-pending'
    })
  );
  const paidOutcome = paidBoundary.execute(
    buildRequest({
      user_message: 'facturas pagadas',
      correlation_id: 'corr-invoice-paid'
    })
  );

  assert.equal(pendingOutcome.status, 'proposal');
  assert.equal(pendingOutcome.validation?.status, 'proposal');
  assert.equal(paidOutcome.status, 'proposal');
  assert.equal(paidOutcome.validation?.status, 'proposal');
});

test('M8 accepts latest N invoice proposals with a customer and forwards the limit into runtime results', () => {
  const invoiceHolded = buildHoldedFetch(200, [
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1930',
      docNumber: 'F26/1930',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      status: 0,
      paymentsPending: 1100,
      dueDate: '2024-03-09T00:00:00.000Z',
      total_amount: 1100,
      currency: 'EUR',
      date: '2024-03-09T00:00:00.000Z'
    },
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1931',
      docNumber: 'F26/1931',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      products: [{ name: 'MUPIS PAPEL' }],
      status: 0,
      paymentsPending: 1200,
      dueDate: '2024-07-03T00:00:00.000Z',
      total_amount: 1200,
      currency: 'EUR',
      date: '2024-07-03T00:00:00.000Z'
    },
    {
      resource_type: 'invoice',
      source_system: 'Holded',
      invoice_id: 'F26/1932',
      docNumber: 'F26/1932',
      customer_id: 'granapublic',
      customer_name: 'Granapublic Xx Sl',
      contact: 'contact-granapublic',
      contactName: 'Granapublic Xx Sl',
      products: [{ name: 'Vinilo Monomérico Plus' }],
      status: 0,
      paymentsPending: 1300,
      dueDate: '2024-07-02T00:00:00.000Z',
      total_amount: 1300,
      currency: 'EUR',
      date: '2024-07-02T00:00:00.000Z'
    }
  ]);
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: createHoldedReadAdapter({
      apiKey: 'token',
      fetch: invoiceHolded.fetch,
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      installation: {
        installation_id: 'install-acme',
        active_modules: ['holded-read']
      }
    })
  });
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        customer_id: 'Granapublic',
        limit: 3
      }, ['facturas', '3'])]
    }),
    installationCapabilities: {
      'install-acme': ['mock.resource.read']
    }
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'Necesito las 3 últimas facturas de Granapublic',
      correlation_id: 'corr-invoice-latest-n'
    })
  );

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  const responseData = outcome.response.data as
    | {
        kind?: string;
        lookup_mode?: string;
        aggregate?: { count?: number; totalAmount?: number };
        records?: Array<{ invoice_id?: string }>;
      }
    | null
    | undefined;
  assert.equal(responseData?.kind, 'list');
  assert.equal(responseData?.lookup_mode, 'latest_n');
  assert.equal(responseData?.aggregate?.count, 3);
  assert.equal(responseData?.aggregate?.totalAmount, 3600);
  assert.equal(responseData?.records?.[0]?.invoice_id, 'F26/1931');
  assert.equal(responseData?.records?.[1]?.invoice_id, 'F26/1932');
  assert.equal(responseData?.records?.[2]?.invoice_id, 'F26/1930');
});

test('M8 rejects latest N proposals that omit a customer or misuse limit', () => {
  const missingCustomerBoundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        limit: 3
      }, ['últimas'])]
    })
  });
  const badLimitBoundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        customer_id: 'Granapublic',
        payment_status: 'overdue',
        limit: 3
      }, ['últimas'])]
    })
  });

  const missingCustomerOutcome = missingCustomerBoundary.execute(
    buildRequest({
      user_message: 'Necesito las 3 últimas facturas',
      correlation_id: 'corr-missing-customer-limit'
    })
  );
  const badLimitOutcome = badLimitBoundary.execute(
    buildRequest({
      user_message: 'Necesito las 3 facturas vencidas de Granapublic',
      correlation_id: 'corr-limit-with-status'
    })
  );

  assert.equal(missingCustomerOutcome.status, 'blocked');
  assert.equal(missingCustomerOutcome.reason, 'proposal params invalid');
  assert.equal(badLimitOutcome.status, 'no_proposal');
  assert.equal(badLimitOutcome.reason, 'no proposal');
});

test('M8 validates invoice year proposals without a customer', () => {
  const boundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        year: '2024'
      }, ['2024'])]
    })
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'facturas de 2024',
      correlation_id: 'corr-invoice-year'
    })
  );

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.validation?.status, 'proposal');
});

test('M8 blocks invalid invoice year proposals', () => {
  const boundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        year: '20a4'
      }, ['2024'])]
    })
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'facturas de 2024',
      correlation_id: 'corr-invoice-year-invalid'
    })
  );

  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'proposal params invalid');
});

test('M8 blocks empty proposals and unknown invoice payment status', () => {
  const emptyBoundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({ resource_type: 'estimate' }, ['estimate'])]
    })
  });
  const unknownStatusBoundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [buildReadProposal({
        resource_type: 'invoice',
        payment_status: 'unknown'
      }, ['facturas'])]
    })
  });

  const emptyOutcome = emptyBoundary.execute(
    buildRequest({
      user_message: 'estimate',
      correlation_id: 'corr-empty-proposal'
    })
  );
  const unknownStatusOutcome = unknownStatusBoundary.execute(
    buildRequest({
      user_message: 'facturas',
      correlation_id: 'corr-unknown-payment-status'
    })
  );

  assert.equal(emptyOutcome.status, 'blocked');
  assert.equal(emptyOutcome.reason, 'proposal params invalid');
  assert.equal(unknownStatusOutcome.status, 'blocked');
  assert.equal(unknownStatusOutcome.reason, 'proposal params invalid');
});

test('M8 ignores claimed results from the orchestrator proposal', () => {
  const boundary = buildBoundary({
    orchestrator: createMockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      unsafe_claimed_result: { estimate_id: 'invented' }
    })
  });

  const outcome = boundary.execute(buildRequest());
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.data?.estimate_id, 'estimate-123');
  assert.equal(outcome.response.data?.invented, undefined);
  assert.equal(
    records.some((record) => record.record_type === 'orchestration_claimed_result_ignored'),
    true
  );
});

test('M8 denies a capability that is not active for the installation', () => {
  const boundary = buildBoundary({
    installationCapabilities: {
      'install-acme': []
    }
  });

  const outcome = boundary.execute(buildRequest());
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.status, 'denied');
  assert.equal(outcome.response.response_source, 'workflow_blocked');
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), false);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_denied'), true);
});

test('M8 returns no_proposal honestly when the message is ambiguous', () => {
  const boundary = buildBoundary({ orchestrator: createMockOrchestrator() });
  const outcome = boundary.execute(
    buildRequest({
      user_message: 'hola',
      correlation_id: 'corr-ambiguous'
    })
  );
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-ambiguous');

  assert.equal(outcome.status, 'no_proposal');
  assert.equal(outcome.response.message, 'no puedo determinar qué hacer');
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), false);
  assert.equal(records.some((record) => record.record_type === 'orchestration_no_proposal'), true);
});

test('M8 blocks invalid proposal params without inventing capability output', () => {
  const boundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      routes: [
        {
          keywords: ['estimate'],
          capability_key: 'mock.resource.read',
          reason: 'forced read route',
          confidence: 1,
          buildParams: () => ({})
        }
      ]
    })
  });

  const outcome = boundary.execute(
    buildRequest({
      user_message: 'estimate',
      correlation_id: 'corr-invalid'
    })
  );
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-invalid');

  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.response.response_source, 'workflow_blocked');
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), false);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_blocked'), true);
});

test('M8 surfaces runtime error unavailable and error without inventing data', () => {
  const notFoundHolded = buildHoldedFetch(404, '');
  const unavailableHolded = buildHoldedFetch(0, '');
  const errorHolded = buildHoldedFetch(500, 'boom');

  const notFoundBoundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      externalReadAdapter: createHoldedReadAdapter({
        apiKey: 'token',
        fetch: notFoundHolded.fetch,
        now: () => new Date('2026-06-29T00:00:00.000Z'),
        installation: {
          installation_id: 'install-acme',
          active_modules: ['holded-read']
        }
      })
    }),
    orchestrator: createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
    installationCapabilities: { 'install-acme': ['mock.resource.read'] }
  });
  const unavailableBoundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      externalReadAdapter: createHoldedReadAdapter({
        apiKey: 'token',
        fetch: unavailableHolded.fetch,
        now: () => new Date('2026-06-29T00:00:00.000Z'),
        installation: {
          installation_id: 'install-acme',
          active_modules: ['holded-read']
        }
      })
    }),
    orchestrator: createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
    installationCapabilities: { 'install-acme': ['mock.resource.read'] }
  });
  const errorBoundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      externalReadAdapter: createHoldedReadAdapter({
        apiKey: 'token',
        fetch: errorHolded.fetch,
        now: () => new Date('2026-06-29T00:00:00.000Z'),
        installation: {
          installation_id: 'install-acme',
          active_modules: ['holded-read']
        }
      })
    }),
    orchestrator: createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
    installationCapabilities: { 'install-acme': ['mock.resource.read'] }
  });

  const notFound = notFoundBoundary.execute(
    buildRequest({
      correlation_id: 'corr-not-found',
      user_message: 'estimate estimate-missing'
    })
  );
  const unavailable = unavailableBoundary.execute(
    buildRequest({
      correlation_id: 'corr-unavailable',
      user_message: 'estimate estimate-offline'
    })
  );
  const error = errorBoundary.execute(
    buildRequest({
      correlation_id: 'corr-error',
      user_message: 'estimate estimate-error'
    })
  );

  assert.equal(notFound.response.status, 'error');
  assert.equal(notFound.response.data, null);
  assert.equal(notFound.workflow_result?.capability_result?.status, 'error');
  assert.equal(unavailable.response.status, 'unavailable');
  assert.equal(unavailable.response.data, null);
  assert.equal(unavailable.workflow_result?.capability_result?.status, 'unavailable');
  assert.equal(error.response.status, 'error');
  assert.equal(error.response.data, null);
  assert.equal(error.workflow_result?.capability_result?.status, 'error');
});

test('M8 blocks mock email proposals until approval is explicitly provided', () => {
  const boundary = buildBoundary({
    orchestrator: new MockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z')
    })
  });

  const outcome = boundary.execute(
    buildRequest({
      installation_id: 'install-email',
      user_message: 'Enviar correo a ventas@example.com',
      correlation_id: 'corr-email-no-approval'
    })
  );

  const records = boundary.getEvidenceLedger().listByCorrelation('corr-email-no-approval');

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'workflow_blocked');
  assert.equal(outcome.response.message, 'approval missing');
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_created'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), true);
});
