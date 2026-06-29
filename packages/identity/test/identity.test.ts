import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentityContext, resolveOrganizationContext } from '../src/index';

test('organization resolver resolves a valid active organization', () => {
  const organizationContext = resolveOrganizationContext({ organization_hint: 'acme' });
  assert.equal(organizationContext.resolution_state, 'resolved');
  assert.equal(organizationContext.organization_id, 'org-acme');
});

test('organization resolver fails closed when organization is missing', () => {
  const organizationContext = resolveOrganizationContext({ organization_hint: null });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when organization is ambiguous', () => {
  const organizationContext = resolveOrganizationContext({ organization_hint: 'shared' });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

test('organization resolver fails closed when organization is inactive', () => {
  const organizationContext = resolveOrganizationContext({ organization_hint: 'archived' });
  assert.equal(organizationContext.resolution_state, 'failed_closed');
});

const organizationContext = resolveOrganizationContext({ organization_hint: 'acme' });

test('identity resolver resolves a valid human identity', () => {
  const identityContext = resolveIdentityContext(
    { principal_hint: 'human-001', payload: { required_scope: 'approve:binding' } },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'resolved');
  assert.equal(identityContext.principal_type, 'human');
});

test('identity resolver fails closed when identity is missing', () => {
  const identityContext = resolveIdentityContext({ principal_hint: null, payload: {} }, organizationContext);
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when identity is revoked', () => {
  const identityContext = resolveIdentityContext({ principal_hint: 'revoked-human', payload: {} }, organizationContext);
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when required scope is missing', () => {
  const identityContext = resolveIdentityContext(
    { principal_hint: 'human-001', payload: { required_scope: 'missing:scope' } },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when an agent claims to be human', () => {
  const identityContext = resolveIdentityContext(
    { principal_hint: 'agent-001', payload: { claimed_principal_type: 'human' } },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});

test('identity resolver fails closed when delegated identity exceeds principal authority', () => {
  const identityContext = resolveIdentityContext(
    { principal_hint: 'service-overreach', payload: {} },
    organizationContext
  );
  assert.equal(identityContext.resolution_state, 'failed_closed');
});
