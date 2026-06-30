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
    orchestrator: options.orchestrator ?? createMockOrchestrator({ now: () => new Date('2026-06-29T00:00:00.000Z') }),
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
