import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNodeFetchChatCompletionsTransport,
  createQwenOrchestrator,
  resolveChatCompletionsUrl,
  type QwenChatCompletionsRequest,
  type QwenChatCompletionsResponse,
  type QwenToolDefinition
} from '../src/index';

function buildToolCatalog(): QwenToolDefinition[] {
  const readTool: QwenToolDefinition = {
    capability_key: 'mock.resource.read',
    description:
      'Read governed estimates or invoices from the runtime by customer, exact document id, or year. For latest estimate or invoice of a named customer, always provide customer_id with the customer name from the user request. For latest N estimates or invoices of a customer, provide customer_id together with a positive integer limit. Use limit only with customer_id. For invoice payment-status lists, use resource_type="invoice" with payment_status="pending", "paid", or "overdue". For year-based document lists, provide year as a four-digit string like "2025" and do not compute date ranges or timestamps. Do not invent estimate_id or invoice_id. Only provide estimate_id or invoice_id if the user explicitly gave an exact estimate or document id.',
    parameters_schema: {
      type: 'object',
      required: ['resource_type'],
      additionalProperties: false,
      anyOf: [
        { required: ['customer_id'] },
        { required: ['customer_name'] },
        { required: ['contact_name'] },
        { required: ['contactName'] },
        { required: ['contact'] },
        { required: ['payment_status'] },
        { required: ['year'] },
        { required: ['estimate_id'] },
        { required: ['invoice_id'] },
        { required: ['resource_id'] }
      ],
      properties: {
        resource_type: {
          type: 'string',
          enum: ['estimate', 'invoice'],
          description: "Use 'estimate' for budget/estimate lookup and 'invoice' for invoice lookup."
        },
        estimate_id: {
          type: 'string',
          description: 'Known exact estimate/document id only if the user explicitly provided one.'
        },
        invoice_id: {
          type: 'string',
          description: 'Known exact invoice/document id only if the user explicitly provided one.'
        },
        limit: {
          type: 'integer',
          description: 'Number of latest documents to return when the user asks for the latest N documents of a customer.',
          minimum: 1,
          maximum: 20
        },
        payment_status: {
          type: 'string',
          enum: ['pending', 'paid', 'overdue'],
          description: 'Use only with resource_type="invoice" to list invoices by payment state.'
        },
        year: {
          type: 'string',
          description: 'Four-digit year from the user request. Use it for year-based document lists and let the runtime convert it to a UTC start/end range.',
          pattern: '^\\d{4}$'
        },
        customer_id: {
          type: 'string',
          description: "Customer name or search term extracted from the user's request."
        },
        customer_name: {
          type: 'string',
          description: 'Alias for customer_id when the user gave a customer name.'
        },
        contact_name: {
          type: 'string',
          description: 'Alias for customer_id when the user gave a contact name.'
        },
        contactName: {
          type: 'string',
          description: 'Alias for customer_id when the user gave a contact name.'
        },
        contact: {
          type: 'string',
          description: 'Alias for customer_id when the user gave a contact.'
        },
        resource_id: {
          type: 'string',
          description: 'Known resource id if the user explicitly provided one.'
        }
      }
    }
  };
  const pricingTool: QwenToolDefinition = {
    capability_key: 'pricing.quote_line',
    description: 'Propose a single governed PacoPrint line pricing request without inventing article ids or prices.',
    parameters_schema: {
      type: 'object',
      required: ['article'],
      additionalProperties: false,
      properties: {
        article: {
          type: 'string',
          description: 'Article name extracted from the user request.'
        },
        unidades: {
          type: 'number',
          description: 'Number of units requested by the user.',
          minimum: 1
        },
        alto: {
          type: 'number',
          description: 'Height in centimeters requested by the user.',
          minimum: 0
        },
        ancho: {
          type: 'number',
          description: 'Width in centimeters requested by the user.',
          minimum: 0
        },
        options: {
          type: 'object',
          description: 'Mentioned options from the user request.'
        }
      }
    }
  };
  const clarificationTool: QwenToolDefinition = {
    capability_key: 'request_clarification',
    description: 'Ask the user to clarify missing or unsupported details without inventing parameters.',
    parameters_schema: {
      type: 'object',
      required: ['missing', 'reason'],
      additionalProperties: false,
      properties: {
        missing: {
          type: 'string',
          enum: ['customer', 'document_id', 'ambiguous', 'unsupported', 'pricing'],
          description: 'What information is missing or unsupported.'
        },
        reason: {
          type: 'string',
          description: 'Short human-readable explanation to share with the user.'
        }
      }
    }
  };
  const emailTool: QwenToolDefinition = {
    capability_key: 'mock.email.send',
    description: 'Send governed emails from the runtime',
    parameters_schema: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
      properties: {
        to: {
          type: 'string'
        },
        subject: {
          type: 'string'
        },
        body: {
          type: 'string'
        }
      }
    }
  };
  return [readTool, pricingTool, clarificationTool, emailTool];
}

function buildRequest(overrides: Partial<QwenChatCompletionsRequest> = {}) {
  return {
    model: 'kern-vl',
    temperature: 0.1,
    tool_choice: 'auto' as const,
    tools: [],
    messages: [
      {
        role: 'system' as const,
        content: 'system'
      },
      {
        role: 'user' as const,
        content: 'Necesito el presupuesto estimate-123 del cliente customer-001'
      }
    ],
    ...overrides
  } satisfies QwenChatCompletionsRequest;
}

function buildOrchestratorForToolCall(toolCallArguments: unknown, content = '', toolName = 'mock.resource.read') {
  const requests: QwenChatCompletionsRequest[] = [];
  const orchestrator = createQwenOrchestrator({
    model: 'kern-vl',
    toolCatalog: buildToolCatalog(),
    chatCompletionsTransport: {
      chatCompletions(request) {
        requests.push(structuredClone(request));
        return {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content,
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments: toolCallArguments as never
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

  return { orchestrator, requests };
}

test('Qwen transport appends chat/completions to a base URL', () => {
  assert.equal(resolveChatCompletionsUrl('http://localhost:8002/v1'), 'http://localhost:8002/v1/chat/completions');
});

test('Qwen transport keeps a full completions URL stable and does not duplicate the path', () => {
  assert.equal(resolveChatCompletionsUrl('http://localhost:8002/v1/'), 'http://localhost:8002/v1/chat/completions');
  assert.equal(
    resolveChatCompletionsUrl('http://localhost:8002/v1/chat/completions'),
    'http://localhost:8002/v1/chat/completions'
  );
});

test('Qwen transport fails closed on transport errors without leaking the API key', () => {
  const orchestrator = createQwenOrchestrator({
    model: 'kern-vl',
    apiKey: 'model-secret',
    toolCatalog: buildToolCatalog(),
    chatCompletionsTransport: {
      chatCompletions() {
        throw new Error('qwen transport failed with status 404: Not Found');
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const outcome = orchestrator.propose({
    request_id: 'request-transport-failure',
    user_message: 'Necesito el presupuesto estimate-123 del cliente customer-001',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-transport-failure',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(outcome.status, 'error');
  assert.equal(JSON.stringify(outcome).includes('model-secret'), false);
  assert.equal(
    orchestrator
      .getEvidenceLedger()
      .listByCorrelation('corr-transport-failure')
      .some((record) => JSON.stringify(record).includes('model-secret')),
    false
  );
});

test('Qwen orchestrator proposes only active capabilities and parses tool calls', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall(
    JSON.stringify({
      estimate_id: 'estimate-123',
      customer_id: 'Granapublic',
      resource_type: 'estimate'
    })
  );

  const outcome = orchestrator.propose({
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
    }
  });
  const records = orchestrator.getEvidenceLedger().listByCorrelation('corr-1');

  assert.equal(requests.length, 1);
  assert.equal(requests[0].tools.length, 2);
  assert.equal(requests[0].tools[0].function.name, 'mock.resource.read');
  assert.equal(requests[0].tools[1].function.name, 'request_clarification');
  assert.equal(requests[0].tools[0].function.parameters.required?.includes('resource_type'), true);
  assert.equal(
    requests[0].tools[0].function.parameters.anyOf?.some(
      (candidate) => candidate.required?.includes('customer_id') && candidate.required?.length === 1
    ),
    true
  );
  assert.equal(requests[0].tools[0].function.parameters.properties?.limit?.type, 'integer');
  assert.equal(requests[0].tools[0].function.parameters.properties?.limit?.minimum, 1);
  assert.equal(requests[0].tools[0].function.parameters.properties?.limit?.maximum, 20);
  assert.equal(
    requests[0].tools[0].function.parameters.anyOf?.some((candidate) => candidate.required?.includes('limit')),
    false
  );
  assert.equal(
    requests[0].tools[0].function.parameters.anyOf?.some((candidate) => candidate.required?.includes('customer_id')),
    true
  );
  assert.equal(
    requests[0].tools[0].function.parameters.anyOf?.some(
      (candidate) => candidate.required?.includes('estimate_id') && candidate.required?.length === 1
    ),
    true
  );
  assert.equal(
    requests[0].tools[0].function.parameters.anyOf?.some(
      (candidate) => candidate.required?.includes('invoice_id') && candidate.required?.length === 1
    ),
    true
  );
  assert.equal(requests[0].tool_choice, 'auto');
  assert.equal(
    requests[0].messages[0].content?.includes('Do not output business results, answers, claims, prices, amounts, invoice totals, document contents, SourceEvidence, runtime results, CapabilityInvocationResult, or ResourceResult.'),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes('Extracting the customer name from the user\'s request as a tool parameter is not outputting business data.'),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes(
      'The customer name can be informal, lowercase, partial, or without a legal suffix (e.g. "granapublic", "toldos martos", "petroprix"). Treat any name the user gives after "de"/"of" as the customer and put it in customer_id EXACTLY as written.'
    ),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes(
      'Do NOT judge whether a customer name is real, valid, or recognized. That is the runtime job. Your job is only to extract the name into customer_id; the runtime will look it up and honestly report if it is not found.'
    ),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes('request_clarification instead of inventing params'),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes(
      'Use request_clarification with missing="customer" only when the user gives NO customer name AT ALL. If any name is present, use mock.resource.read.'
    ),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes(
      'If the user asks for "las ultimas de <cliente>" without saying facturas or presupuestos, default resource_type to "invoice".'
    ),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes('User: "ultimo presupuesto de ACME SL"'),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes('User: "dame las 3 ultimas de toldos martos"'),
    true
  );
  assert.equal(
    requests[0].messages[0].content?.includes('{ "resource_type": "invoice", "customer_id": "toldos martos", "limit": 3 }'),
    true
  );
  assert.equal(requests[0].messages[0].content?.includes('latest N estimates or invoices'), true);
  assert.equal(requests[0].messages[0].content?.includes('Use limit only with customer_id.'), true);
  assert.equal(requests[0].messages[0].content?.includes('{ "resource_type": "invoice", "customer_id": "ACME SL", "limit": 3 }'), true);
  assert.equal(requests[0].messages[0].content?.includes('pricing.quote_line'), true);
  assert.equal(requests[0].messages[0].content?.includes('Do not choose articulo_id or calculate price.'), true);
  assert.equal(requests[0].messages[0].content?.includes('If a PacoPrint pricing request is incomplete, keep the proposal minimal and let the runtime clarify missing details.'), true);
  assert.equal(requests[0].messages[0].content?.includes('Cliente Ejemplo SL'), true);
  assert.equal(requests[0].messages[0].content?.includes('Cliente Demo SL'), true);
  assert.equal(requests[0].messages[0].content?.includes('Granapublic'), false);
  assert.equal(requests[0].messages[0].content?.includes('Petroprix'), false);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.capability_key, 'mock.resource.read');
  assert.equal(outcome.proposal?.params.estimate_id, 'estimate-123');
  assert.equal(outcome.proposal?.params.customer_id, 'Granapublic');
  assert.equal(records.some((record) => record.record_type === 'model_orchestration_requested'), true);
  assert.equal(records.some((record) => record.record_type === 'model_tool_call_received'), true);
});

test('Qwen orchestrator allows customer extraction as tool params without inventing estimate ids', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall({
    resource_type: 'estimate',
    customer_id: 'Granapublic'
  });

  const outcome = orchestrator.propose({
    request_id: 'request-1b',
    user_message: 'ultimo presupuesto de Granapublic',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-1b',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].tools[0].function.parameters.anyOf?.some((candidate) => candidate.required?.includes('customer_id')), true);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.params.customer_id, 'Granapublic');
  assert.equal('estimate_id' in (outcome.proposal?.params ?? {}), false);
});

test('Qwen orchestrator proposes pricing.quote_line without inventing article ids or prices', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall(
    {
      article: 'lona',
      unidades: 2,
      alto: 100,
      ancho: 200,
      options: {
        ojales: true
      }
    },
    '',
    'pricing.quote_line'
  );

  const outcome = orchestrator.propose({
    request_id: 'request-pricing-1',
    user_message: 'precio de lona 100x200 2 unidades con ojales',
    organization_id: 'org-pacoprint',
    principal_id: 'human-pacoprint',
    actor: {
      principal_id: 'human-pacoprint',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-pricing-1',
    installation_id: 'install-pacoprint',
    context: {
      installation_id: 'install-pacoprint',
      active_capabilities: ['pricing.quote_line'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].tools.some((tool) => tool.function.name === 'pricing.quote_line'), true);
  assert.equal(requests[0].messages[0].content?.includes('pricing.quote_line'), true);
  assert.equal(requests[0].messages[0].content?.includes('Do not choose articulo_id or calculate price.'), true);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.capability_key, 'pricing.quote_line');
  assert.equal(outcome.proposal?.params.article, 'lona');
  assert.equal(outcome.proposal?.params.unidades, 2);
  assert.equal(outcome.proposal?.params.alto, 100);
  assert.equal(outcome.proposal?.params.ancho, 200);
  assert.deepEqual(outcome.proposal?.params.options, { ojales: true });
  assert.equal('articulo_id' in (outcome.proposal?.params ?? {}), false);
  assert.equal('price' in (outcome.proposal?.params ?? {}), false);
});

test('Qwen orchestrator can request clarification honestly without inventing params', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall(
    {
      missing: 'customer',
      reason: 'Falta el cliente para buscar el documento correcto.'
    },
    '',
    'request_clarification'
  );

  const outcome = orchestrator.propose({
    request_id: 'request-clarification',
    user_message: 'facturas',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-clarification',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].tools.some((tool) => tool.function.name === 'request_clarification'), true);
  assert.equal(requests[0].tool_choice, 'auto');
  assert.equal(outcome.status, 'no_proposal');
  assert.equal(outcome.proposal, null);
  assert.equal(outcome.response.message, 'Falta el cliente para buscar el documento correcto.');
  assert.equal((outcome.response.data as { kind?: string } | null)?.kind, 'request_clarification');
  assert.equal((outcome.response.data as { missing?: string } | null)?.missing, 'customer');
  assert.equal(
    (outcome.response.data as { reason?: string } | null)?.reason,
    'Falta el cliente para buscar el documento correcto.'
  );
});


test('Qwen orchestrator replays informal customer names into mock.resource.read', () => {
  const cases = [
    {
      user_message: 'ultima de granapublic',
      tool_call_arguments: {
        resource_type: 'invoice',
        customer_id: 'granapublic',
        limit: 1
      }
    },
    {
      user_message: 'dime las 4 ultimas de granapublic',
      tool_call_arguments: {
        resource_type: 'invoice',
        customer_id: 'granapublic',
        limit: 4
      }
    }
  ] as const;

  for (const scenario of cases) {
    const { orchestrator, requests } = buildOrchestratorForToolCall(scenario.tool_call_arguments);

    const outcome = orchestrator.propose({
      request_id: `request-${scenario.tool_call_arguments.limit}`,
      user_message: scenario.user_message,
      organization_id: 'org-acme',
      principal_id: 'human-001',
      actor: {
        principal_id: 'human-001',
        principal_type: 'human',
        delegated_identity: null
      },
      correlation_id: `corr-${scenario.tool_call_arguments.limit}`,
      installation_id: 'install-acme',
      context: {
        installation_id: 'install-acme',
        active_capabilities: ['mock.resource.read'],
        metadata: {},
        force_capability_key: null,
        force_params: null
      }
    });

    assert.equal(requests[0].tools.some((tool) => tool.function.name === 'request_clarification'), true);
    assert.equal(outcome.status, 'proposal');
    assert.equal(outcome.proposal?.capability_key, 'mock.resource.read');
    assert.equal(outcome.proposal?.params.resource_type, 'invoice');
    assert.equal(outcome.proposal?.params.customer_id, 'granapublic');
    assert.equal(outcome.proposal?.params.limit, scenario.tool_call_arguments.limit);
    assert.equal('estimate_id' in (outcome.proposal?.params ?? {}), false);
    assert.equal('invoice_id' in (outcome.proposal?.params ?? {}), false);
    assert.equal('customer_name' in (outcome.proposal?.params ?? {}), false);
  }
});

test('Qwen orchestrator replays missing-customer inputs into request_clarification', () => {
  const cases = ['ultimas', 'dame las ultimas de'] as const;

  for (const user_message of cases) {
    const { orchestrator, requests } = buildOrchestratorForToolCall(
      {
        missing: 'customer',
        reason: 'Falta el cliente para buscar el documento correcto.'
      },
      '',
      'request_clarification'
    );

    const outcome = orchestrator.propose({
      request_id: `request-${user_message}`,
      user_message,
      organization_id: 'org-acme',
      principal_id: 'human-001',
      actor: {
        principal_id: 'human-001',
        principal_type: 'human',
        delegated_identity: null
      },
      correlation_id: `corr-${user_message}`,
      installation_id: 'install-acme',
      context: {
        installation_id: 'install-acme',
        active_capabilities: ['mock.resource.read'],
        metadata: {},
        force_capability_key: null,
        force_params: null
      }
    });

    assert.equal(requests[0].tools.some((tool) => tool.function.name === 'request_clarification'), true);
    assert.equal(outcome.status, 'no_proposal');
    assert.equal(outcome.proposal, null);
    assert.equal((outcome.response.data as { kind?: string } | null)?.kind, 'request_clarification');
    assert.equal((outcome.response.data as { missing?: string } | null)?.missing, 'customer');
    assert.equal(outcome.response.message, 'Falta el cliente para buscar el documento correcto.');
  }
});

test('Qwen orchestrator replays ambiguous customer inputs into request_clarification', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall(
    {
      missing: 'ambiguous',
      reason: 'Hay varios clientes posibles; dime cuál quieres consultar.'
    },
    '',
    'request_clarification'
  );

  const outcome = orchestrator.propose({
    request_id: 'request-ambiguous',
    user_message: 'dame las ultimas de granapublic y petroprix',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-ambiguous',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].tools.some((tool) => tool.function.name === 'request_clarification'), true);
  assert.equal(outcome.status, 'no_proposal');
  assert.equal(outcome.proposal, null);
  assert.equal((outcome.response.data as { kind?: string } | null)?.kind, 'request_clarification');
  assert.equal((outcome.response.data as { missing?: string } | null)?.missing, 'ambiguous');
  assert.equal(outcome.response.message, 'Hay varios clientes posibles; dime cuál quieres consultar.');
});
test('Qwen orchestrator supports latest N customer document limits without inventing ids', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall({
    resource_type: 'invoice',
    customer_id: 'Granapublic',
    limit: 3
  });

  const outcome = orchestrator.propose({
    request_id: 'request-limit',
    user_message: 'Necesito las 3 últimas facturas de Granapublic',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-limit',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].messages[0].content?.includes('latest N estimates or invoices'), true);
  assert.equal(requests[0].messages[0].content?.includes('Use limit only with customer_id.'), true);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.params.customer_id, 'Granapublic');
  assert.equal(outcome.proposal?.params.limit, 3);
  assert.equal('estimate_id' in (outcome.proposal?.params ?? {}), false);
  assert.equal('invoice_id' in (outcome.proposal?.params ?? {}), false);
});

test('Qwen orchestrator extracts year as a tool param without computing ranges', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall({
    resource_type: 'invoice',
    year: '2025'
  });

  const outcome = orchestrator.propose({
    request_id: 'request-year',
    user_message: 'facturas del 2025',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-year',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(
    requests[0].tools[0].function.parameters.anyOf?.some((candidate) => candidate.required?.includes('year') && candidate.required?.length === 1),
    true
  );
  assert.equal(requests[0].messages[0].content?.includes('year-based document lists'), true);
  assert.equal(requests[0].messages[0].content?.includes('{ "resource_type": "invoice", "year": "2025" }'), true);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.capability_key, 'mock.resource.read');
  assert.equal(outcome.proposal?.params.resource_type, 'invoice');
  assert.equal(outcome.proposal?.params.year, '2025');
  assert.equal('customer_id' in (outcome.proposal?.params ?? {}), false);
});

test('Qwen orchestrator supports invoice payment-status lists and keeps estimate queries out of payment status mode', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall({
    resource_type: 'invoice',
    payment_status: 'overdue',
    customer_id: 'Granapublic'
  });

  const outcome = orchestrator.propose({
    request_id: 'request-invoice-status',
    user_message: 'facturas vencidas de Granapublic',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-invoice-status',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].messages[0].content?.includes('payment_status="pending", "paid", or "overdue"'), true);
  assert.equal(requests[0].messages[0].content?.includes('{ "resource_type": "invoice", "payment_status": "overdue" }'), true);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.params.resource_type, 'invoice');
  assert.equal(outcome.proposal?.params.payment_status, 'overdue');
  assert.equal(outcome.proposal?.params.customer_id, 'Granapublic');

  const blockedOrchestrator = createQwenOrchestrator({
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
                    id: 'tool-call-invalid-payment-status',
                    type: 'function',
                    function: {
                      name: 'mock.resource.read',
                      arguments: JSON.stringify({
                        resource_type: 'estimate',
                        payment_status: 'overdue'
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

  const blocked = blockedOrchestrator.propose({
    request_id: 'request-estimate-status',
    user_message: 'facturas vencidas de Granapublic',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-estimate-status',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(blocked.status, 'blocked');
});

test('Qwen orchestrator accepts invoice tool params without inventing invoice ids', () => {
  const { orchestrator, requests } = buildOrchestratorForToolCall({
    resource_type: 'invoice',
    customer_id: 'Granapublic'
  });

  const outcome = orchestrator.propose({
    request_id: 'request-invoice',
    user_message: 'Necesito la factura de Granapublic',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-invoice',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(requests[0].tools[0].function.parameters.properties?.resource_type?.enum?.includes('invoice'), true);
  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.params.customer_id, 'Granapublic');
  assert.equal(outcome.proposal?.params.resource_type, 'invoice');
  assert.equal('invoice_id' in (outcome.proposal?.params ?? {}), false);
});

test('Qwen orchestrator unwraps strings objects and wrappers safely', () => {
  const cases: Array<{
    name: string;
    arguments: unknown;
    expected: Record<string, unknown>;
  }> = [
    {
      name: 'string json',
      arguments: JSON.stringify({ resource_type: 'estimate', customer_id: 'Granapublic' }),
      expected: { resource_type: 'estimate', customer_id: 'Granapublic' }
    },
    {
      name: 'plain object',
      arguments: { resource_type: 'estimate', customer_id: 'Granapublic' },
      expected: { resource_type: 'estimate', customer_id: 'Granapublic' }
    },
    {
      name: 'wrapper name with object arguments',
      arguments: {
        name: 'mock.resource.read',
        arguments: { resource_type: 'estimate', customer_id: 'Granapublic' }
      },
      expected: { resource_type: 'estimate', customer_id: 'Granapublic' }
    },
    {
      name: 'wrapper function with object arguments',
      arguments: {
        function: {
          name: 'mock.resource.read',
          arguments: { resource_type: 'estimate', customer_id: 'Granapublic' }
        }
      },
      expected: { resource_type: 'estimate', customer_id: 'Granapublic' }
    },
    {
      name: 'wrapper name with string arguments',
      arguments: {
        name: 'mock.resource.read',
        arguments: JSON.stringify({ resource_type: 'estimate', customer_id: 'Granapublic' })
      },
      expected: { resource_type: 'estimate', customer_id: 'Granapublic' }
    },
    {
      name: 'nested wrapper',
      arguments: {
        name: 'mock.resource.read',
        arguments: {
          name: 'mock.resource.read',
          arguments: { resource_type: 'estimate', customer_id: 'Granapublic' }
        }
      },
      expected: { resource_type: 'estimate', customer_id: 'Granapublic' }
    }
  ];

  for (const testCase of cases) {
    const { orchestrator } = buildOrchestratorForToolCall(testCase.arguments);
    const outcome = orchestrator.propose({
      request_id: `request-${testCase.name}`,
      user_message: 'ultimo presupuesto de Granapublic',
      organization_id: 'org-acme',
      principal_id: 'human-001',
      actor: {
        principal_id: 'human-001',
        principal_type: 'human',
        delegated_identity: null
      },
      correlation_id: `corr-${testCase.name}`,
      installation_id: 'install-acme',
      context: {
        installation_id: 'install-acme',
        active_capabilities: ['mock.resource.read'],
        metadata: {},
        force_capability_key: null,
        force_params: null
      }
    });

    assert.equal(outcome.status, 'proposal', testCase.name);
    assert.deepEqual(outcome.proposal?.params, testCase.expected);
  }
});

test('Qwen orchestrator fails closed for malformed wrappers and missing required params', () => {
  const invalidCases: Array<{
    name: string;
    arguments: unknown;
  }> = [
    { name: 'array', arguments: [] },
    { name: 'null', arguments: null },
    { name: 'primitive', arguments: 42 },
    { name: 'wrapper without required params', arguments: { name: 'mock.resource.read', arguments: {} } },
    {
      name: 'wrapper with customer only',
      arguments: { function: { name: 'mock.resource.read', arguments: { customer_id: 'Granapublic' } } }
    },
    { name: 'malformed json', arguments: '{not-json}' }
  ];

  for (const testCase of invalidCases) {
    const { orchestrator } = buildOrchestratorForToolCall(testCase.arguments);
    const outcome = orchestrator.propose({
      request_id: `request-${testCase.name}`,
      user_message: 'Necesito el presupuesto de Granapublic',
      organization_id: 'org-acme',
      principal_id: 'human-001',
      actor: {
        principal_id: 'human-001',
        principal_type: 'human',
        delegated_identity: null
      },
      correlation_id: `corr-${testCase.name}`,
      installation_id: 'install-acme',
      context: {
        installation_id: 'install-acme',
        active_capabilities: ['mock.resource.read'],
        metadata: {},
        force_capability_key: null,
        force_params: null
      }
    });

    assert.equal(['blocked', 'denied', 'no_proposal', 'error'].includes(outcome.status), true, testCase.name);
  }
});

test('Qwen orchestrator ignores claimed result content and records the override', () => {
  const { orchestrator } = buildOrchestratorForToolCall(
    JSON.stringify({
      name: 'mock.resource.read',
      arguments: {
        resource_type: 'estimate',
        customer_id: 'Granapublic'
      }
    }),
    '{"price":999,"result":"invented"}'
  );

  const outcome = orchestrator.propose({
    request_id: 'request-2',
    user_message: 'Necesito el presupuesto estimate-123',
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

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.capability_key, 'mock.resource.read');
  assert.equal(outcome.proposal?.params.customer_id, 'Granapublic');
  assert.equal(records.some((record) => record.record_type === 'model_claimed_result_ignored'), true);
});

test('Qwen orchestrator returns no_proposal honestly when no tool call appears', () => {
  const orchestrator = createQwenOrchestrator({
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
    request_id: 'request-3',
    user_message: 'hola',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-3',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });
  const records = orchestrator.getEvidenceLedger().listByCorrelation('corr-3');

  assert.equal(outcome.status, 'no_proposal');
  assert.equal(outcome.proposal, null);
  assert.equal(records.some((record) => record.record_type === 'model_no_tool_call'), true);
});

test('Qwen orchestrator fails closed for invalid tool arguments and unknown capabilities', () => {
  const orchestrator = createQwenOrchestrator({
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
                          resource_type: 'estimate',
                          customer_id: 'Granapublic',
                          limit: 21
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

  const blocked = orchestrator.propose({
    request_id: 'request-4',
    user_message: 'Necesito el presupuesto estimate-123',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-4',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  const deniedOrchestrator = createQwenOrchestrator({
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
                    id: 'tool-call-2',
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

  const denied = deniedOrchestrator.propose({
    request_id: 'request-5',
    user_message: 'Necesito el presupuesto estimate-123',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-5',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['unknown.capability'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(blocked.status, 'blocked');
  assert.equal(['blocked', 'denied'].includes(denied.status), true);
});

test('Qwen orchestrator surfaces transport failures and keeps secrets out of outputs', () => {
  const orchestrator = createQwenOrchestrator({
    model: 'kern-vl',
    apiKey: 'model_secret_key_must_not_leak',
    toolCatalog: buildToolCatalog(),
    chatCompletionsTransport: {
      chatCompletions() {
        throw new Error('timeout');
      }
    },
    now: () => new Date('2026-06-30T00:00:00.000Z')
  });

  const outcome = orchestrator.propose({
    request_id: 'request-6',
    user_message: 'Necesito el presupuesto estimate-123',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-6',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(outcome.status, 'error');
  assert.equal(JSON.stringify(outcome).includes('model_secret_key_must_not_leak'), false);
  assert.equal(
    orchestrator
      .getEvidenceLedger()
      .listByCorrelation('corr-6')
      .some((record) => JSON.stringify(record).includes('model_secret_key_must_not_leak')),
    false
  );
});

test('Qwen live integration is opt-in only', { skip: !process.env.KERN_MODEL_BASE_URL }, () => {
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

  const outcome = orchestrator.propose({
    request_id: 'request-live',
    user_message: 'Necesito el presupuesto estimate-123',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-live',
    installation_id: 'install-acme',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: null,
      force_params: null
    }
  });

  assert.equal(typeof outcome.status, 'string');
  assert.equal(JSON.stringify(outcome).includes(process.env.KERN_MODEL_API_KEY ?? ''), false);
  assert.equal(JSON.stringify(outcome).includes('estimate-123'), outcome.status === 'proposal');
});
