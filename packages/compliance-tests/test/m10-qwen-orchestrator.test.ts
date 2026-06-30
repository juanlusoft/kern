import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createNodeFetchChatCompletionsTransport,
  createQwenOrchestrator
} from '../../orchestrators/qwen/src/index';
import { createHoldedReadAdapter, type HoldedFetchResponse } from '../../adapters/holded/src/index';
import { InMemoryOrchestrationBoundary } from '../../orchestration/src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import type { OrchestrationRequest } from '../../contracts/src/index';

function buildToolCatalog(): Array<{
  capability_key: string;
  description: string;
  parameters_schema: {
    type: 'object';
    required: string[];
    additionalProperties: false;
    properties: {
      estimate_id: { type: 'string' };
      customer_id: { type: 'string' };
      resource_type: { type: 'string' };
    };
  };
}> {
  return [
    {
      capability_key: 'mock.resource.read',
      description: 'Read governed estimates from the runtime',
      parameters_schema: {
        type: 'object',
        required: ['estimate_id'],
        additionalProperties: false,
        properties: {
          estimate_id: { type: 'string' },
          customer_id: { type: 'string' },
          resource_type: { type: 'string' }
        }
      }
    }
  ];
}

function buildHoldedFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = (url: string | URL | Request, init?: RequestInit): HoldedFetchResponse => {
    calls.push({ url: String(url), init });
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

function buildBoundary(overrides: {
  orchestrator?: ReturnType<typeof createQwenOrchestrator>;
  activeCapabilities?: string[];
  fetchStatus?: number;
  fetchBody?: unknown;
  installationCapabilities?: Record<string, string[]>;
} = {}) {
  const orchestrator =
    overrides.orchestrator ??
    createQwenOrchestrator({
      model: 'kern-vl',
      toolCatalog: buildToolCatalog(),
      chatCompletionsTransport: {
        chatCompletions() {
          return {
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'tool-call-1',
                      type: 'function',
                      function: {
                        name: 'mock.resource.read',
                        arguments: JSON.stringify({
                          estimate_id: 'estimate-123',
                          customer_id: 'customer-001',
                          resource_type: 'estimate'
                        })
                      }
                    }
                  ]
                }
              }
            ]
          };
        }
      },
      now: () => new Date('2026-06-30T00:00:00.000Z')
    });

  const runtime =
    overrides.fetchStatus === undefined
      ? new InMemoryGovernedWorkflowRuntime({
          now: () => new Date('2026-06-30T00:00:00.000Z')
        })
      : new InMemoryGovernedWorkflowRuntime({
          now: () => new Date('2026-06-30T00:00:00.000Z'),
          externalReadAdapter: createHoldedReadAdapter({
            apiKey: 'token',
            fetch: buildHoldedFetch(overrides.fetchStatus, overrides.fetchBody ?? {}).fetch,
            now: () => new Date('2026-06-30T00:00:00.000Z'),
            installation: {
              installation_id: 'install-acme',
              active_modules: ['holded-read']
            }
          })
        });

  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-30T00:00:00.000Z'),
    workflowRuntime: runtime,
    orchestrator,
    installationCapabilities: {
      'install-acme': overrides.activeCapabilities ?? ['mock.resource.read'],
      ...overrides.installationCapabilities
    }
  });

  return { boundary, orchestrator, runtime };
}

function buildRequest(overrides: Record<string, unknown> = {}): OrchestrationRequest {
  return {
    request_id: 'request-1',
    user_message: 'Necesito el presupuesto estimate-123 del cliente customer-001',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human' as const,
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

test('M10 keeps Qwen out of Core and remains offline/deterministic', () => {
  const coreSource = readFileSync('packages/core/src/index.ts', 'utf8');
  assert.equal(coreSource.includes('Qwen'), false);
  assert.equal(coreSource.includes('KERN_MODEL_BASE_URL'), false);
  assert.equal(coreSource.includes('KERN_MODEL_API_KEY'), false);

  const { boundary, orchestrator } = buildBoundary();
  const outcome = boundary.execute(buildRequest());
  const qwenRecords = orchestrator.getEvidenceLedger().listByCorrelation('corr-1');
  const records = boundary.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.response.response_source, 'runtime_result');
  assert.equal(outcome.response.status, 'completed');
  assert.equal(outcome.response.data?.estimate_id, 'estimate-123');
  assert.equal(
    qwenRecords.some((record) => record.record_type === 'model_orchestration_requested'),
    true
  );
  assert.equal(qwenRecords.some((record) => record.record_type === 'model_tool_call_received'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_created'), true);
  assert.equal(records.some((record) => record.record_type === 'orchestration_proposal_validated'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_invocation_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'workflow_response_created'), true);
});

test('M10 ignores claimed model content and records the override', () => {
  const orchestrator = createQwenOrchestrator({
    model: 'kern-vl',
    toolCatalog: [
      {
        capability_key: 'mock.resource.read',
        description: 'Read governed estimates from the runtime',
        parameters_schema: {
          type: 'object',
          required: ['estimate_id'],
          additionalProperties: false,
          properties: {
            estimate_id: { type: 'string' }
          }
        }
      }
    ],
    chatCompletionsTransport: {
      chatCompletions() {
        return {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '{"price":999,"result":"invented"}',
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: 'mock.resource.read',
                      arguments: JSON.stringify({
                        estimate_id: 'estimate-123'
                      })
                    }
                  }
                ]
              }
            }
          ]
        };
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const boundary = new InMemoryOrchestrationBoundary({
    now: () => new Date('2026-06-30T00:00:00.000Z'),
    workflowRuntime: new InMemoryGovernedWorkflowRuntime({
      now: () => new Date('2026-06-30T00:00:00.000Z'),
      externalReadAdapter: createHoldedReadAdapter({
        apiKey: 'token',
        fetch: buildHoldedFetch(200, {
          estimate_id: 'estimate-123',
          customer_id: 'customer-001',
          customer_name: 'Acme Customer',
          total_amount: 1210,
          currency: 'EUR'
        }).fetch,
        now: () => new Date('2026-06-30T00:00:00.000Z'),
        installation: {
          installation_id: 'install-acme',
          active_modules: ['holded-read']
        }
      })
    }),
    orchestrator,
    installationCapabilities: {
      'install-acme': ['mock.resource.read']
    }
  });

  const outcome = boundary.execute(buildRequest());
  const qwenRecords = orchestrator.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(outcome.response.data?.estimate_id, 'estimate-123');
  assert.equal(JSON.stringify(outcome).includes('invented'), false);
  assert.equal(qwenRecords.some((record) => record.record_type === 'model_claimed_result_ignored'), true);
});

test('M10 returns no_proposal honestly when the model emits no tool call', () => {
  const orchestrator = createQwenOrchestrator({
    model: 'kern-vl',
    toolCatalog: [],
    chatCompletionsTransport: {
      chatCompletions() {
        return {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'hola'
              }
            }
          ]
        };
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const outcome = orchestrator.propose({
    request_id: 'request-2',
    user_message: 'hola',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-2',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });
  const records = orchestrator.getEvidenceLedger().listByCorrelation('corr-2');

  assert.equal(outcome.status, 'no_proposal');
  assert.equal(records.some((record) => record.record_type === 'model_no_tool_call'), true);
});

test('M10 fails closed for transport failure, invalid params and unknown capabilities', () => {
  const transportFailure = createQwenOrchestrator({
    model: 'kern-vl',
    toolCatalog: [
      {
        capability_key: 'mock.resource.read',
        description: 'Read governed estimates from the runtime',
        parameters_schema: {
          type: 'object',
          required: ['estimate_id'],
          additionalProperties: false,
          properties: {
            estimate_id: { type: 'string' }
          }
        }
      }
    ],
    chatCompletionsTransport: {
      chatCompletions() {
        throw new Error('timeout');
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const invalidParams = createQwenOrchestrator({
    model: 'kern-vl',
    toolCatalog: [
      {
        capability_key: 'mock.resource.read',
        description: 'Read governed estimates from the runtime',
        parameters_schema: {
          type: 'object',
          required: ['estimate_id'],
          additionalProperties: false,
          properties: {
            estimate_id: { type: 'string' }
          }
        }
      }
    ],
    chatCompletionsTransport: {
      chatCompletions() {
        return {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: 'mock.resource.read',
                      arguments: JSON.stringify({
                        customer_id: 'customer-001'
                      })
                    }
                  }
                ]
              }
            }
          ]
        };
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const unknownCapability = createQwenOrchestrator({
    model: 'kern-vl',
    toolCatalog: [
      {
        capability_key: 'mock.resource.read',
        description: 'Read governed estimates from the runtime',
        parameters_schema: {
          type: 'object',
          required: ['estimate_id'],
          additionalProperties: false,
          properties: {
            estimate_id: { type: 'string' }
          }
        }
      }
    ],
    chatCompletionsTransport: {
      chatCompletions() {
        return {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: 'unknown.capability',
                      arguments: JSON.stringify({
                        estimate_id: 'estimate-123'
                      })
                    }
                  }
                ]
              }
            }
          ]
        };
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const transportOutcome = transportFailure.propose(buildRequest({ correlation_id: 'corr-transport' }));
  const invalidOutcome = invalidParams.propose(buildRequest({ correlation_id: 'corr-invalid' }));
  const unknownOutcome = unknownCapability.propose(
    buildRequest({
      correlation_id: 'corr-unknown',
      context: {
        installation_id: 'install-acme',
        active_capabilities: ['unknown.capability'],
        metadata: {},
        force_capability_key: null,
        force_params: null
      }
    })
  );

  assert.equal(transportOutcome.status, 'error');
  assert.equal(invalidOutcome.status, 'blocked');
  assert.equal(unknownOutcome.status, 'blocked');
});

test('M10 live integration remains opt-in', { skip: !process.env.KERN_MODEL_BASE_URL }, () => {
  const transport = createNodeFetchChatCompletionsTransport({
    baseUrl: process.env.KERN_MODEL_BASE_URL as string,
    apiKey: process.env.KERN_MODEL_API_KEY ?? null,
    timeoutMs: 10_000
  });
  const orchestrator = createQwenOrchestrator({
    baseUrl: process.env.KERN_MODEL_BASE_URL,
    model: process.env.KERN_MODEL_NAME ?? 'kern-vl',
    apiKey: process.env.KERN_MODEL_API_KEY ?? null,
    toolCatalog: buildToolCatalog(),
    chatCompletionsTransport: transport,
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const outcome = orchestrator.propose(buildRequest());

  assert.equal(typeof outcome.status, 'string');
  assert.equal(JSON.stringify(outcome).includes(process.env.KERN_MODEL_API_KEY ?? ''), false);
});
