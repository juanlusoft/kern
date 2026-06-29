import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryDecisionBindingStore } from '../../bindings/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import {
  InMemoryCapabilityRegistry,
  InMemoryCapabilityRuntime,
  createMockResourceReadCapability
} from '../src/index';
import { createMockExternalReadAdapter } from '../../external-read-adapters/src/index';
import { evaluatePolicy } from '../../policy/src/index';
import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';
import type { CapabilityDefinition, CapabilityInvocationRequest, CoreRequest, ResourceResult } from '../../contracts/src/index';

function createRequest(overrides: Partial<CoreRequest> = {}): CoreRequest {
  return {
    request_id: 'cap-request',
    organization_hint: 'acme',
    principal_hint: 'human-001',
    action: 'capability.run',
    purpose: 'invoke governed capability',
    payload: {
      resource: 'documents/quarterly',
      operation: 'read',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1,
      flags: {
        force_policy_deny: false,
        force_policy_defer: false,
        missing_critical_attribute: false,
        obligation_incomplete: false,
        attempt_human_impersonation: false,
        delegated_identity_exceeds_principal: false,
        agent_selected_organization: false
      }
    },
    requires_binding: true,
    correlation_id: 'corr-capability',
    ...overrides
  };
}

function createInvocation(overrides: Partial<CapabilityInvocationRequest> = {}): CapabilityInvocationRequest {
  return {
    capability_id: 'cap-governed-read',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    correlation_id: 'corr-capability',
    input: {
      purpose: 'invoke governed capability',
      requested_scope: ['read:knowledge'],
      payload: {
        resource: 'documents/quarterly',
        operation: 'read'
      }
    },
    binding_id: null,
    decision_binding_id: null,
    policy_decision_id: 'decision-1',
    approval_requirement: {
      required: true,
      reason: 'binding required',
      binding_required: true
    },
    evidence_reference: 'evidence-1',
    requested_at: '2026-06-29T00:00:00.000Z',
    ...overrides
  };
}

function createCapabilityDefinition(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    capability_id: 'cap-governed-read',
    organization_id: 'org-acme',
    title: 'Governed Read',
    description: 'Read a governed document through the capability runtime skeleton.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: {
      required: false,
      reason: 'read only',
      binding_required: false
    },
    mock: {
      invoke(input) {
        const resource = String(input.input.payload.resource ?? '');
        if (resource === 'documents/quarterly') {
          return {
            status: 'executed',
            output: {
              capability_id: input.capability_id,
              status: 'executed',
              result: {
                resource,
                mode: input.input.payload.mode ?? 'default',
                requested_scope: [...input.input.requested_scope]
              },
              processed_at: '2026-06-29T00:00:00.000Z'
            },
            error: null
          };
        }
        if (resource === 'missing-resource') {
          return {
            status: 'not_found',
            output: null,
            error: 'resource missing'
          };
        }
        if (resource === 'offline-resource') {
          return {
            status: 'unavailable',
            output: null,
            error: 'resource unavailable'
          };
        }
        if (resource === 'boom-resource') {
          return {
            status: 'error',
            output: null,
            error: 'runtime boom'
          };
        }
        return {
          status: 'denied',
          output: null,
          error: 'mock denied'
        };
      }
    },
    ...overrides
  };
}

function createEffectfulCapabilityDefinition(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    ...createCapabilityDefinition({
      capability_id: 'cap-governed-write',
      kind: 'effectful',
      approval_requirement: {
        required: true,
        reason: 'binding required',
        binding_required: true
      },
      mock: {
        invoke(input) {
          const resource = String(input.input.payload.resource ?? '');
          if (resource === 'missing-resource') {
            return {
              status: 'not_found',
              output: null,
              error: 'resource missing'
            };
          }
          if (resource === 'offline-resource') {
            return {
              status: 'unavailable',
              output: null,
              error: 'resource unavailable'
            };
          }
          if (resource === 'boom-resource') {
            return {
              status: 'error',
              output: null,
              error: 'runtime boom'
            };
          }
          return {
            status: 'executed',
            output: {
              capability_id: input.capability_id,
              status: 'executed',
              result: {
                resource,
                binding_id: input.decision_binding_id ?? input.binding_id ?? null,
                approved_capability_id: input.capability_id
              },
              processed_at: '2026-06-29T00:00:00.000Z'
            },
            error: null
          };
        }
      }
    }),
    ...overrides
  };
}

function createResourceInvocation(overrides: Partial<CapabilityInvocationRequest> = {}): CapabilityInvocationRequest {
  return {
    capability_id: 'mock.resource.read',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    correlation_id: 'corr-resource',
    input: {
      purpose: 'read governed resource',
      requested_scope: ['read:knowledge'],
      payload: {
        query_id: 'query-1',
        organization_id: 'org-acme',
        correlation_id: 'corr-resource',
        actor: {
          principal_id: 'human-001',
          principal_type: 'human',
          delegated_identity: null
        },
        resource_type: 'estimate',
        resource_id: 'estimate-123',
        filters: null,
        requested_fields: ['estimate_id', 'customer_name'],
        claimed_result: { injected: true },
        model_claimed_result: { injected: true },
        caller_result: { injected: true },
        assistant_result: { injected: true }
      }
    },
    binding_id: null,
    decision_binding_id: null,
    policy_decision_id: null,
    approval_requirement: {
      required: false,
      reason: 'read only',
      binding_required: false
    },
    evidence_reference: 'evidence-resource-1',
    requested_at: '2026-06-29T00:00:00.000Z',
    ...overrides
  };
}

function buildRuntime(): {
  ledger: InMemoryEvidenceLedger;
  bindingStore: InMemoryDecisionBindingStore;
  runtime: InMemoryCapabilityRuntime;
} {
  const ledger = new InMemoryEvidenceLedger();
  const bindingStore = new InMemoryDecisionBindingStore();
  const runtime = new InMemoryCapabilityRuntime({
    evidenceLedger: ledger,
    bindingStore,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });
  return { ledger, bindingStore, runtime };
}

test('capability registry clones definitions and preserves approval requirements', () => {
  const registry = new InMemoryCapabilityRegistry();
  const registered = registry.register(createCapabilityDefinition());

  assert.equal(registered.capability_id, 'cap-governed-read');
  assert.equal(registry.has('cap-governed-read'), true);
  assert.equal(registry.list()[0].approval_requirement?.binding_required, false);
  assert.notEqual(registry.get('cap-governed-read'), registered);
});

test('capability invocation result keeps runtime fields and evidence links', () => {
  const { ledger, bindingStore, runtime } = buildRuntime();
  runtime.registerCapability(createCapabilityDefinition());

  const request = createInvocation();
  const organizationContext = resolveOrganizationContext(createRequest());
  const identityContext = resolveIdentityContext(createRequest(), organizationContext);
  const policyDecision = evaluatePolicy({ request: createRequest(), organizationContext, identityContext });
  const binding = bindingStore.createBinding({
    request: createRequest({
      capability_invocation: request
    }),
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-1',
    capabilityInvocation: request,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const result = runtime.invokeCapability({
    ...request,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id,
    claimed_result: { fake: true },
    claimed_output: { fake: true },
    caller_result: { fake: true },
    assistant_result: { fake: true },
    model_claimed_result: { fake: true }
  });

  assert.equal(result.status, 'executed');
  assert.equal(result.executed_by_runtime, true);
  assert.ok(result.created_at);
  assert.ok(result.evidence_links.length >= 4);
  assert.equal(result.output?.result.resource, 'documents/quarterly');
  assert.equal(result.binding_id, binding.binding_id);
  assert.equal(result.error, null);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_requested'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_started'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_completed'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_result_bound'), true);
});

test('capability invocation ignores caller claimed results and uses the registered mock output', () => {
  const { runtime } = buildRuntime();
  runtime.registerCapability(createCapabilityDefinition());

  const result = runtime.invokeCapability({
    ...createInvocation(),
    claimed_result: { not: 'used' },
    claimed_output: { not: 'used' },
    caller_result: { not: 'used' },
    assistant_result: { not: 'used' },
    model_claimed_result: { not: 'used' }
  });

  assert.equal(result.output?.result.resource, 'documents/quarterly');
  assert.equal(result.output?.result.mode, 'default');
  assert.equal((result as { claimed_result?: unknown }).claimed_result, undefined);
});

test('generic resource read capability uses the external read adapter and rejects invalid found results', () => {
  const { runtime } = buildRuntime();
  const adapter = createMockExternalReadAdapter();
  runtime.registerCapability(createMockResourceReadCapability(adapter));

  const result = runtime.invokeCapability(createResourceInvocation());
  const resourceResult = result.output?.result as ResourceResult | undefined;
  const sourceEvidence = (resourceResult as { source_evidence?: unknown[] } | undefined)?.source_evidence;
  assert.equal(result.status, 'executed');
  assert.equal(resourceResult?.status, 'found');
  assert.equal((resourceResult as { data?: { estimate_id?: string } } | undefined)?.data?.estimate_id, 'estimate-123');
  assert.equal((sourceEvidence?.length ?? 0) > 0, true);

  const denied = runtime.invokeCapability(
    createResourceInvocation({
      input: {
        purpose: 'read governed resource',
        requested_scope: ['read:knowledge'],
        payload: {
          query_id: 'query-2',
          organization_id: 'org-acme',
          correlation_id: 'corr-resource-2',
          actor: {
            principal_id: 'human-001',
            principal_type: 'human',
            delegated_identity: null
          },
          resource_type: 'estimate',
          resource_id: 'estimate-missing-source-evidence',
          filters: null,
          requested_fields: ['estimate_id']
        }
      }
    })
  );

  assert.equal(denied.status, 'error');
  assert.equal(denied.output, null);
  assert.equal(denied.error, 'found result requires source evidence and data');
});

test('unknown capability is denied without calling any mock', () => {
  const { runtime } = buildRuntime();
  let called = false;
  runtime.registerCapability({
    ...createCapabilityDefinition(),
    capability_id: 'cap-known',
    mock: {
      invoke() {
        called = true;
        return {
          status: 'executed',
          output: {
            capability_id: 'cap-known',
            status: 'executed',
            result: { ok: true },
            processed_at: '2026-06-29T00:00:00.000Z'
          },
          error: null
        };
      }
    }
  });

  const result = runtime.invokeCapability({
    ...createInvocation({ capability_id: 'mock.unknown.action' }),
    claimed_result: { fake: true }
  });

  assert.equal(result.status, 'denied');
  assert.equal(result.executed_by_runtime, true);
  assert.equal(called, false);
  assert.equal(result.evidence_links.some((link) => typeof link === 'string'), true);
  assert.equal(result.error, 'capability unknown or not authorized');
});

test('disabled capability is denied without calling its mock', () => {
  const { runtime } = buildRuntime();
  let called = false;
  runtime.registerCapability({
    ...createCapabilityDefinition({
      enabled: false,
      mock: {
        invoke() {
          called = true;
          return {
            status: 'executed',
            output: null,
            error: null
          };
        }
      }
    }),
    capability_id: 'cap-disabled'
  });

  const result = runtime.invokeCapability({
    ...createInvocation({ capability_id: 'cap-disabled' })
  });

  assert.equal(result.status, 'denied');
  assert.equal(called, false);
});

test('read_only capability executes without binding and records evidence', () => {
  const { ledger, runtime } = buildRuntime();
  runtime.registerCapability(createCapabilityDefinition());

  const result = runtime.invokeCapability(createInvocation({ binding_id: null, decision_binding_id: null }));

  assert.equal(result.status, 'executed');
  assert.equal(result.executed_by_runtime, true);
  assert.equal(result.binding_id, null);
  assert.equal(result.decision_binding_id, null);
  assert.equal(result.evidence_links.some((link) => typeof link === 'string'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_requested'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_started'), true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_completed'), true);
});

test('read_only capability returns not_found only when the registered mock cannot find a resource', () => {
  const { ledger, runtime } = buildRuntime();
  runtime.registerCapability(createCapabilityDefinition());

  const result = runtime.invokeCapability(
    createInvocation({
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['read:knowledge'],
        payload: {
          resource: 'missing-resource'
        }
      }
    })
  );

  assert.equal(result.status, 'not_found');
  assert.equal(result.executed_by_runtime, true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_not_found'), true);
});

test('read_only capability propagates unavailable and error without turning them into executed', () => {
  const { runtime } = buildRuntime();
  runtime.registerCapability(createCapabilityDefinition());

  const unavailableResult = runtime.invokeCapability(
    createInvocation({
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['read:knowledge'],
        payload: {
          resource: 'offline-resource'
        }
      }
    })
  );
  const errorResult = runtime.invokeCapability(
    createInvocation({
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['read:knowledge'],
        payload: {
          resource: 'boom-resource'
        }
      }
    })
  );

  assert.equal(unavailableResult.status, 'unavailable');
  assert.equal(unavailableResult.executed_by_runtime, true);
  assert.equal(errorResult.status, 'error');
  assert.equal(errorResult.executed_by_runtime, true);
});

test('effectful capability requires binding and consumes it when executed', () => {
  const { ledger, bindingStore, runtime } = buildRuntime();
  runtime.registerCapability(createEffectfulCapabilityDefinition());

  const baseRequest = createRequest({
    action: 'capability.write',
    payload: {
      resource: 'documents/quarterly',
      operation: 'write',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1,
      flags: {
        force_policy_deny: false,
        force_policy_defer: false,
        missing_critical_attribute: false,
        obligation_incomplete: false,
        attempt_human_impersonation: false,
        delegated_identity_exceeds_principal: false,
        agent_selected_organization: false
      }
    },
    requires_binding: true,
    capability_invocation: createInvocation({
      capability_id: 'cap-governed-write',
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['write:knowledge'],
        payload: {
          resource: 'documents/quarterly',
          operation: 'write'
        }
      }
    })
  });
  const organizationContext = resolveOrganizationContext(baseRequest);
  const identityContext = resolveIdentityContext(baseRequest, organizationContext);
  const policyDecision = evaluatePolicy({ request: baseRequest, organizationContext, identityContext });
  const binding = bindingStore.createBinding({
    request: baseRequest,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-effectful',
    capabilityInvocation: baseRequest.capability_invocation,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const result = runtime.invokeCapability({
    ...baseRequest.capability_invocation!,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id
  });

  assert.equal(result.status, 'executed');
  assert.equal(result.executed_by_runtime, true);
  assert.equal(result.binding_id, binding.binding_id);
  assert.equal(bindingStore.get(binding.binding_id)?.binding_state, 'consumed');
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_result_bound'), true);
});

test('effectful capability is denied without a binding or with an invalid binding', () => {
  const { bindingStore, runtime } = buildRuntime();
  runtime.registerCapability(createEffectfulCapabilityDefinition());
  const baseRequest = createRequest({
    action: 'capability.write',
    payload: {
      resource: 'documents/quarterly',
      operation: 'write',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1,
      flags: {
        force_policy_deny: false,
        force_policy_defer: false,
        missing_critical_attribute: false,
        obligation_incomplete: false,
        attempt_human_impersonation: false,
        delegated_identity_exceeds_principal: false,
        agent_selected_organization: false
      }
    },
    requires_binding: true,
    capability_invocation: createInvocation({
      capability_id: 'cap-governed-write',
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['write:knowledge'],
        payload: {
          resource: 'documents/quarterly',
          operation: 'write'
        }
      }
    })
  });
  const organizationContext = resolveOrganizationContext(baseRequest);
  const identityContext = resolveIdentityContext(baseRequest, organizationContext);
  const policyDecision = evaluatePolicy({ request: baseRequest, organizationContext, identityContext });
  const binding = bindingStore.createBinding({
    request: baseRequest,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-effectful',
    capabilityInvocation: baseRequest.capability_invocation,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  assert.equal(
    runtime.invokeCapability({
      ...baseRequest.capability_invocation!,
      binding_id: null,
      decision_binding_id: null
    }).status,
    'denied'
  );
  assert.equal(
    runtime.invokeCapability({
      ...baseRequest.capability_invocation!,
      binding_id: binding.binding_id,
      decision_binding_id: binding.binding_id
    }).status,
    'executed'
  );
  assert.equal(
    runtime.invokeCapability({
      ...baseRequest.capability_invocation!,
      binding_id: binding.binding_id,
      decision_binding_id: binding.binding_id,
      organization_id: 'org-foreign'
    }).status,
    'denied'
  );
});

test('effectful capability denies bindings with mismatched capability, fingerprint, or state', () => {
  const { bindingStore, runtime } = buildRuntime();
  runtime.registerCapability(createEffectfulCapabilityDefinition());
  runtime.registerCapability({
    ...createEffectfulCapabilityDefinition({
      capability_id: 'cap-other',
      mock: {
        invoke() {
          return {
            status: 'executed',
            output: null,
            error: null
          };
        }
      }
    })
  });

  const baseRequest = createRequest({
    action: 'capability.write',
    payload: {
      resource: 'documents/quarterly',
      operation: 'write',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1,
      flags: {
        force_policy_deny: false,
        force_policy_defer: false,
        missing_critical_attribute: false,
        obligation_incomplete: false,
        attempt_human_impersonation: false,
        delegated_identity_exceeds_principal: false,
        agent_selected_organization: false
      }
    },
    requires_binding: true,
    capability_invocation: createInvocation({
      capability_id: 'cap-governed-write',
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['write:knowledge'],
        payload: {
          resource: 'documents/quarterly',
          operation: 'write'
        }
      }
    })
  });
  const organizationContext = resolveOrganizationContext(baseRequest);
  const identityContext = resolveIdentityContext(baseRequest, organizationContext);
  const policyDecision = evaluatePolicy({ request: baseRequest, organizationContext, identityContext });
  const binding = bindingStore.createBinding({
    request: baseRequest,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-effectful',
    capabilityInvocation: baseRequest.capability_invocation,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const wrongCapability = runtime.invokeCapability({
    ...baseRequest.capability_invocation!,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id,
    capability_id: 'cap-other'
  });
  const wrongFingerprint = runtime.invokeCapability({
    ...baseRequest.capability_invocation!,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id,
    input: {
      ...baseRequest.capability_invocation!.input,
      payload: {
        resource: 'documents/changed'
      }
    }
  });

  bindingStore.consumeBinding(binding.binding_id);

  const consumed = runtime.invokeCapability({
    ...baseRequest.capability_invocation!,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id
  });
  const revokedBinding = bindingStore.revokeBinding(binding.binding_id);
  const revoked = runtime.invokeCapability({
    ...baseRequest.capability_invocation!,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id
  });

  assert.equal(wrongCapability.status, 'denied');
  assert.equal(wrongFingerprint.status, 'denied');
  assert.equal(consumed.status, 'denied');
  assert.equal(revoked.status, 'denied');
  assert.equal(revokedBinding?.binding_state, 'revoked');
});

test('effectful capability returns not_found only when the registered mock cannot find a resource', () => {
  const { ledger, bindingStore, runtime } = buildRuntime();
  runtime.registerCapability(createEffectfulCapabilityDefinition());

  const baseRequest = createRequest({
    action: 'capability.write',
    payload: {
      resource: 'documents/quarterly',
      operation: 'write',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1,
      flags: {
        force_policy_deny: false,
        force_policy_defer: false,
        missing_critical_attribute: false,
        obligation_incomplete: false,
        attempt_human_impersonation: false,
        delegated_identity_exceeds_principal: false,
        agent_selected_organization: false
      }
    },
    requires_binding: true,
    capability_invocation: createInvocation({
      capability_id: 'cap-governed-write',
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['read:knowledge'],
        payload: {
          resource: 'missing-resource',
          operation: 'write'
        }
      }
    })
  });
  const organizationContext = resolveOrganizationContext(baseRequest);
  const identityContext = resolveIdentityContext(baseRequest, organizationContext);
  const policyDecision = evaluatePolicy({ request: baseRequest, organizationContext, identityContext });
  const binding = bindingStore.createBinding({
    request: baseRequest,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-effectful',
    capabilityInvocation: baseRequest.capability_invocation,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  const result = runtime.invokeCapability({
    ...baseRequest.capability_invocation!,
    binding_id: binding.binding_id,
    decision_binding_id: binding.binding_id
  });

  assert.equal(result.status, 'not_found');
  assert.equal(result.executed_by_runtime, true);
  assert.equal(ledger.list().some((record) => record.record_type === 'capability_invocation_not_found'), true);
});

test('unavailable and error do not become executed', () => {
  const { runtime } = buildRuntime();
  runtime.registerCapability(
    createCapabilityDefinition({
      capability_id: 'cap-unavailable',
      mock: {
        invoke() {
          return {
            status: 'unavailable',
            output: null,
            error: 'mock unavailable'
          };
        }
      }
    })
  );
  runtime.registerCapability(
    createCapabilityDefinition({
      capability_id: 'cap-error',
      mock: {
        invoke() {
          return {
            status: 'error',
            output: null,
            error: 'mock error'
          };
        }
      }
    })
  );

  assert.equal(
    runtime.invokeCapability({
      ...createInvocation({ capability_id: 'cap-unavailable' }),
      capability_id: 'cap-unavailable'
    }).status,
    'unavailable'
  );
  assert.equal(
    runtime.invokeCapability({
      ...createInvocation({ capability_id: 'cap-error' }),
      capability_id: 'cap-error'
    }).status,
    'error'
  );
});

test('binding metadata captures approved capability and input fingerprint', () => {
  const { bindingStore } = buildRuntime();
  const request = createRequest({
    capability_invocation: createInvocation({
      capability_id: 'cap-governed-write',
      input: {
        purpose: 'invoke governed capability',
        requested_scope: ['write:knowledge'],
        payload: {
          resource: 'documents/quarterly',
          operation: 'write'
        }
      }
    })
  });
  const organizationContext = resolveOrganizationContext(request);
  const identityContext = resolveIdentityContext(request, organizationContext);
  const policyDecision = evaluatePolicy({ request, organizationContext, identityContext });
  const binding = bindingStore.createBinding({
    request,
    organizationContext,
    identityContext,
    policyDecision,
    evidence_reference: 'evidence-effectful',
    capabilityInvocation: request.capability_invocation,
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

  assert.equal(binding.approved_capability_id, 'cap-governed-write');
  assert.ok(binding.approved_input_fingerprint);
});
