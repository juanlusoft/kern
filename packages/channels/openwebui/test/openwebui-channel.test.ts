import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryEvidenceLedger } from '../../../evidence/src/index';
import { InMemoryOrchestrationBoundary } from '../../../orchestration/src/index';
import type { OrchestrationOutcome } from '../../../contracts/src/index';
import {
  createOpenWebUIChannelAdapter,
  createOpenWebUIChannelServer,
  type OpenWebUIChatCompletionsRequest,
  type OpenWebUIInstallationConfig
} from '../src/index';

function buildInstallation(port = 0): OpenWebUIInstallationConfig {
  return {
    channel: 'openwebui',
    installation_id: 'install-openwebui-test',
    active: true,
    host: '127.0.0.1',
    port,
    request_body_limit_bytes: 100_000,
    identity_mappings: [
      {
        openwebui_user_id: 'openwebui-user-1',
        organization_id: 'org-openwebui-test',
        principal_id: 'principal-openwebui-test',
        active: true,
        display_name: 'Open WebUI Demo User'
      }
    ]
  };
}

function buildSourceEvidence() {
  return [
    {
      source_id: 'source-1',
      source_type: 'row',
      source_system: 'kern',
      resource_id: 'resource-1',
      record_id: 'record-1',
      field_path: 'core_punches.stamp',
      observed_at: '2026-07-08T00:00:00.000Z',
      correlation_id: 'corr-demo'
    }
  ];
}

function buildOutcome(overrides: Partial<OrchestrationOutcome> = {}): OrchestrationOutcome {
  return {
    request_id: 'request-1',
    organization_id: 'org-openwebui-test',
    principal_id: 'principal-openwebui-test',
    correlation_id: 'corr-demo',
    installation_id: 'install-openwebui-test',
    status: 'blocked',
    proposal: null,
    validation: null,
    workflow_kind: null,
    workflow_result: null,
    response: {
      response_source: 'runtime_result',
      workflow_kind: 'numa.hr.read',
      status: 'blocked',
      message: 'Dias vacaciones: 2',
      data: {
        kind: 'presence-demo',
        source_evidence: buildSourceEvidence()
      }
    },
    evidence_links: ['evidence-1'],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    reason: 'demo',
    ...overrides
  } as OrchestrationOutcome;
}

function buildBoundary(calls: Array<unknown>, outcome = buildOutcome()) {
  const ledger = new InMemoryEvidenceLedger();
  return {
    execute(request: unknown) {
      calls.push(request);
      return outcome;
    },
    getEvidenceLedger() {
      return ledger;
    }
  } as unknown as InMemoryOrchestrationBoundary;
}

test('Open WebUI adapter resolves identity, preserves correlation id and returns kern metadata', () => {
  const calls: Array<unknown> = [];
  const adapter = createOpenWebUIChannelAdapter({
    installation: buildInstallation(),
    orchestrationBoundary: buildBoundary(calls)
  });

  const result = adapter.handleChatCompletionRequest({
    model: 'kern-numa',
    messages: [
      { role: 'system', content: 'Context' },
      { role: 'user', content: 'Dias vacaciones del trabajador Eugenio Moya' }
    ],
    user: 'openwebui-user-1',
    kern: {
      correlation_id: 'corr-demo'
    },
  } satisfies OpenWebUIChatCompletionsRequest);

  assert.equal(result.http_status, 200);
  assert.equal(result.status, 'sent');
  assert.equal(result.correlation_id, 'corr-demo');
  assert.equal(result.organization_id, 'org-openwebui-test');
  assert.equal(result.principal_id, 'principal-openwebui-test');
  const successBody = result.body as {
    object: 'chat.completion';
    choices: Array<{ message: { role: 'assistant'; content: string } }>;
    kern: {
      channel: 'openwebui';
      correlation_id: string;
      organization_id: string | null;
      principal_id: string | null;
      sources: string[];
      source_evidence?: Array<{ source_id?: string }> | null;
    };
  };
  assert.equal(successBody.object, 'chat.completion');
  assert.equal(successBody.choices[0].message.role, 'assistant');
  assert.equal(successBody.choices[0].message.content.includes('Dias vacaciones'), true);
  assert.equal(successBody.kern.channel, 'openwebui');
  assert.equal(successBody.kern.correlation_id, 'corr-demo');
  assert.equal(successBody.kern.organization_id, 'org-openwebui-test');
  assert.equal(successBody.kern.principal_id, 'principal-openwebui-test');
  assert.equal(successBody.kern.sources.includes('source-1'), true);
  assert.equal(Array.isArray(successBody.kern.source_evidence), true);
  assert.equal(successBody.kern.source_evidence?.[0]?.source_id, 'source-1');
  assert.equal(calls.length, 1);
  const request = calls[0] as { organization_id?: string; principal_id?: string; correlation_id?: string; context?: { metadata?: { channel?: string; user_id?: string } } };
  assert.equal(request.organization_id, 'org-openwebui-test');
  assert.equal(request.principal_id, 'principal-openwebui-test');
  assert.equal(request.correlation_id, 'corr-demo');
  assert.equal(request.context?.metadata?.channel, 'openwebui');
  assert.equal(request.context?.metadata?.user_id, 'openwebui-user-1');
});

test('Open WebUI server serves OpenAI-style JSON and supports error handling', async () => {
  const calls: Array<unknown> = [];
  const server = createOpenWebUIChannelServer({
    installation: buildInstallation(0),
    orchestrationBoundary: buildBoundary(calls),
    now: () => new Date('2026-07-08T00:00:00.000Z')
  });

  const port = await server.ready;
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'kern-numa',
        messages: [{ role: 'user', content: 'A que hora ha fichado esta manana Eugenio Moya' }],
        user: 'openwebui-user-1',
        kern: { correlation_id: 'corr-http' }
      })
    });
    const json = (await response.json()) as {
      object?: string;
      kern?: { correlation_id?: string; channel?: string; sources?: string[] };
      choices?: Array<{ message?: { content?: string } }>;
    };

    assert.equal(response.status, 200);
    assert.equal(json.object, 'chat.completion');
    assert.equal(json.kern?.channel, 'openwebui');
    assert.equal(json.kern?.correlation_id, 'corr-http');
    assert.equal(json.kern?.sources?.includes('source-1'), true);
    assert.equal(json.choices?.[0]?.message?.content?.includes('Dias vacaciones'), true);

    const badJsonResponse = await fetch('http://127.0.0.1:' + port + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: '{'
    });
    assert.equal(badJsonResponse.status, 400);

    const methodResponse = await fetch('http://127.0.0.1:' + port + '/v1/chat/completions', {
      method: 'GET'
    });
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get('allow'), 'POST');

    const notFoundResponse = await fetch('http://127.0.0.1:' + port + '/v1/other', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(notFoundResponse.status, 404);
  } finally {
    await server.close();
  }
});

test('Open WebUI adapter fails closed for unknown users', () => {
  const adapter = createOpenWebUIChannelAdapter({
    installation: buildInstallation(),
    orchestrationBoundary: buildBoundary([])
  });

  const result = adapter.handleChatCompletionRequest({
    messages: [{ role: 'user', content: 'Dias vacaciones del trabajador Eugenio Moya' }],
    user: 'unknown-user'
  } satisfies OpenWebUIChatCompletionsRequest);

  assert.equal(result.http_status, 403);
  assert.equal(result.status, 'denied');
  const errorBody = result.body as { error: { type: 'authentication_error' }; kern: { channel: 'openwebui' } };
  assert.equal(errorBody.error.type, 'authentication_error');
  assert.equal(errorBody.kern.channel, 'openwebui');
  assert.equal(result.orchestration_outcome, null);
});
