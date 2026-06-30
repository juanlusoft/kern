import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockOrchestrator } from '../src/index';

test('mock orchestrator produces a proposal from clear keywords', () => {
  const orchestrator = createMockOrchestrator({
    now: () => new Date('2026-06-29T00:00:00.000Z')
  });

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
    correlation_id: 'corr-1'
  });

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.capability_key, 'mock.resource.read');
  assert.equal(outcome.proposal?.params.estimate_id, 'estimate-123');
  assert.equal(outcome.proposal?.params.customer_id, 'customer-001');
  assert.equal('result' in (outcome.proposal ?? {}), false);
  assert.equal('data' in (outcome.proposal ?? {}), false);
});

test('mock orchestrator returns no_proposal for ambiguous messages', () => {
  const orchestrator = createMockOrchestrator();
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
    correlation_id: 'corr-2'
  });

  assert.equal(outcome.status, 'no_proposal');
  assert.equal(outcome.proposal, null);
});

test('mock orchestrator force routes deterministically', () => {
  const orchestrator = createMockOrchestrator();
  const outcome = orchestrator.propose({
    request_id: 'request-3',
    user_message: 'irrelevant because routing is forced',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-3',
    context: {
      installation_id: 'install-acme',
      active_capabilities: ['mock.resource.read'],
      metadata: {},
      force_capability_key: 'mock.resource.read',
      force_params: {
        estimate_id: 'estimate-456',
        customer_id: 'customer-001'
      }
    }
  });

  assert.equal(outcome.status, 'proposal');
  assert.equal(outcome.proposal?.capability_key, 'mock.resource.read');
  assert.equal(outcome.proposal?.params.estimate_id, 'estimate-456');
  assert.equal(outcome.proposal?.params.customer_id, 'customer-001');
});

test('mock orchestrator proposal keeps business data out of the proposal shape', () => {
  const orchestrator = createMockOrchestrator();
  const outcome = orchestrator.propose({
    request_id: 'request-4',
    user_message: 'estimate-789 for customer customer-002',
    organization_id: 'org-acme',
    principal_id: 'human-001',
    actor: {
      principal_id: 'human-001',
      principal_type: 'human',
      delegated_identity: null
    },
    correlation_id: 'corr-4'
  });

  assert.equal(outcome.status, 'proposal');
  assert.equal('result' in (outcome.proposal ?? {}), false);
  assert.equal('answer' in (outcome.proposal ?? {}), false);
  assert.equal('data' in (outcome.proposal ?? {}), false);
  assert.equal('value' in (outcome.proposal ?? {}), false);
  assert.equal('output' in (outcome.proposal ?? {}), false);
  assert.equal('business_data' in (outcome.proposal ?? {}), false);
});
