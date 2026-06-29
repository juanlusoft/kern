import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentityContext, resolveOrganizationContext } from '../src/index';
import type { CoreRequestPayload } from '../../contracts/src/index';

function createPayload(
  overrides: Partial<CoreRequestPayload> = {},
  flags: Partial<CoreRequestPayload['flags']> = {}
): CoreRequestPayload {
  return {
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
      agent_selected_organization: false,
      ...flags
    },
    ...overrides
  };
}

test('organization resolver resolves a valid active organization for an authorized principal', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'acme',
    principal_hint: 'human-001',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'resolved');
  assert.equal(organizationContext.organization_id, 'org-acme');
});

test('organization resolver fails closed when organization is missing', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: null,
    principal_hint: 'human-001',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when organization is ambiguous', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'shared',
    principal_hint: 'human-001',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when organization is inactive', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'archived',
    principal_hint: 'human-001',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when a principal is not a member of the organization', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'acme',
    principal_hint: 'human-foreign',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when a principal cannot act in the organization', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'acme',
    principal_hint: 'human-limited',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when an agent selects an organization outside membership', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'foreign',
    principal_hint: 'agent-001',
    payload: createPayload({}, { agent_selected_organization: true })
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when the hint is not authorized for the principal', () => {
  const organizationContext = resolveOrganizationContext({
    organization_hint: 'foreign',
    principal_hint: 'human-001',
    payload: createPayload()
  });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

const organizationContext = resolveOrganizationContext({
  organization_hint: 'acme',
  principal_hint: 'human-001',
  payload: createPayload()
});

test('identity resolver resolves a valid human identity', () => {
  const identityContext = resolveIdentityContext(
    {
      principal_hint: 'human-001',
      payload: createPayload()
    },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'resolved');
  assert.equal(identityContext.principal_type, 'human');
});

test('identity resolver fails closed when identity is missing', () => {
  const identityContext = resolveIdentityContext({ principal_hint: null, payload: createPayload() }, organizationContext);
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when identity is revoked', () => {
  const identityContext = resolveIdentityContext(
    { principal_hint: 'revoked-human', payload: createPayload() },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when required scope is missing', () => {
  const identityContext = resolveIdentityContext(
    {
      principal_hint: 'human-001',
      payload: createPayload({ requested_scope: 'missing:scope' })
    },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when an agent attempts to impersonate a human', () => {
  const identityContext = resolveIdentityContext(
    {
      principal_hint: 'agent-001',
      payload: createPayload({}, { attempt_human_impersonation: true })
    },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when delegated identity exceeds principal authority', () => {
  const identityContext = resolveIdentityContext(
    {
      principal_hint: 'service-overreach',
      payload: createPayload({}, { delegated_identity_exceeds_principal: true })
    },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});
