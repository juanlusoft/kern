import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHoldedReadAdapter, type HoldedFetchResponse } from '../../adapters/holded/src/index';
import { createMockOrchestrator } from '../../orchestrators/mock/src/index';
import { InMemoryOrchestrationBoundary } from '../../orchestration/src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import type { OrchestrationRequest } from '../../contracts/src/index';

function buildHoldedFetch(status: number, body: unknown) {
  return (url: string | URL | Request, init?: RequestInit): HoldedFetchResponse => {
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
}

function buildBoundary(status: number, body: unknown, options: { unsafe_claimed_result?: unknown } = {}) {
  const runtime = new InMemoryGovernedWorkflowRuntime({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    externalReadAdapter: createHoldedReadAdapter({
      apiKey: 'token',
      fetch: buildHoldedFetch(status, body),
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
    orchestrator: createMockOrchestrator({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      unsafe_claimed_result: options.unsafe_claimed_result
    }),
    installationCapabilities: {
      'install-acme': ['mock.resource.read']
    }
  });
}

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

test('M8 happy path returns a proposal and runtime data only', () => {
  const boundary = buildBoundary(200, {
    estimate_id: 'estimate-123',
    customer_id: 'customer-001',
    customer_name: 'Acme Customer',
    total_amount: 1210,
    currency: 'EUR'
  });

  const outcome = boundary.execute(buildRequest());
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  assert.equal(outcome.workflow_result?.capability_result?.status, 'executed');
  assert.ok(outcome.workflow_result?.capability_result?.output?.result.source_evidence);
  assert.equal(records.some((record) => record.record_type === 'orchestration_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_created'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_validated'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
  assert.equal(outcome.response.data?.estimate_id, 'estimate-123');
});

test('M8 claimed result is ignored end to end', () => {
  const boundary = buildBoundary(200, {
    estimate_id: 'estimate-123',
    customer_id: 'customer-001',
    customer_name: 'Acme Customer',
    total_amount: 1210,
    currency: 'EUR'
  }, {
    unsafe_claimed_result: { estimate_id: 'invented' }
  });

  const outcome = boundary.execute(buildRequest());
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.response.data?.estimate_id, 'estimate-123');
  assert.equal(outcome.response.data?.invented, undefined);
  assert.equal(records.some((record) => record.record_type === 'orchestration_claimed_result_ignored'), true);
});

test('M8 capability inactive in the installation fails closed', () => {
  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-29T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      now: () => new Date('2026-06-29T00:00:00.000Z'),
      externalReadAdapter: createHoldedReadAdapter({
        apiKey: 'token',
        fetch: buildHoldedFetch(200, {
          estimate_id: 'estimate-123'
        }),
        now: () => new Date('2026-06-29T00:00:00.000Z'),
        installation: {
          installation_id: 'install-acme',
          active_modules: ['holded-read']
        }
      })
    }),
    orchestrator: createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
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

test('M8 returns error unavailable and error without inventing data', () => {
  const notFound = buildBoundary(404, '');
  const unavailable = buildBoundary(0, '');
  const error = buildBoundary(500, 'boom');

  const notFoundOutcome = notFound.execute(
    buildRequest({
      correlation_id: 'corr-not-found',
      user_message: 'estimate estimate-missing'
    })
  );
  const unavailableOutcome = unavailable.execute(
    buildRequest({
      correlation_id: 'corr-unavailable',
      user_message: 'estimate estimate-offline'
    })
  );
  const errorOutcome = error.execute(
    buildRequest({
      correlation_id: 'corr-error',
      user_message: 'estimate estimate-error'
    })
  );

  assert.equal(notFoundOutcome.response.status, 'error');
  assert.equal(notFoundOutcome.response.data, null);
  assert.equal(notFoundOutcome.workflow_result?.capability_result?.status, 'error');
  assert.equal(unavailableOutcome.response.status, 'unavailable');
  assert.equal(unavailableOutcome.response.data, null);
  assert.equal(unavailableOutcome.workflow_result?.capability_result?.status, 'unavailable');
  assert.equal(errorOutcome.response.status, 'error');
  assert.equal(errorOutcome.response.data, null);
  assert.equal(errorOutcome.workflow_result?.capability_result?.status, 'error');
});

test('M8 source scan keeps Holded, Qwen and Telegram out of core packages', () => {
  const files = [
    'packages/core/src/index.ts',
  ];
  const forbidden = ['Holded', 'holded', 'KERN_HOLDED_API_KEY', 'Qwen', 'Telegram'];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const snippet of forbidden) {
      assert.equal(source.includes(snippet), false, `${file} should not mention ${snippet}`);
    }
  }
});
