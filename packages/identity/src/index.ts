import {
  type CoreRequest,
  type IdentityContext,
  type OrganizationContext,
  type PrincipalType,
  type ResolutionState,
  createDeterministicId
} from '../../contracts/src/index';

interface OrganizationFixture {
  organization_id: string;
  aliases: string[];
  organization_state: 'active' | 'inactive';
  isolation_boundary: string;
  revocation_version: number;
}

interface PrincipalFixture {
  principal_id: string;
  principal_type: PrincipalType;
  auth_method: string;
  delegated_identity: string | null;
  delegated_scopes: string[];
  revocation_version: number;
  active: boolean;
  scopes: string[];
}

interface OrganizationMembershipFixture {
  principal_id: string;
  organization_id: string;
  can_act: boolean;
  agent_can_select: boolean;
}

const ORGANIZATION_FIXTURES: OrganizationFixture[] = [
  {
    organization_id: 'org-acme',
    aliases: ['acme', 'org-acme'],
    organization_state: 'active',
    isolation_boundary: 'boundary:org-acme',
    revocation_version: 1
  },
  {
    organization_id: 'org-foreign',
    aliases: ['foreign', 'org-foreign'],
    organization_state: 'active',
    isolation_boundary: 'boundary:org-foreign',
    revocation_version: 2
  },
  {
    organization_id: 'org-archived',
    aliases: ['archived', 'org-archived'],
    organization_state: 'inactive',
    isolation_boundary: 'boundary:org-archived',
    revocation_version: 7
  },
  {
    organization_id: 'org-shared-a',
    aliases: ['shared', 'org-shared-a'],
    organization_state: 'active',
    isolation_boundary: 'boundary:org-shared-a',
    revocation_version: 3
  },
  {
    organization_id: 'org-shared-b',
    aliases: ['shared', 'org-shared-b'],
    organization_state: 'active',
    isolation_boundary: 'boundary:org-shared-b',
    revocation_version: 4
  }
];

const PRINCIPAL_FIXTURES: PrincipalFixture[] = [
  {
    principal_id: 'human-001',
    principal_type: 'human',
    auth_method: 'mfa',
    delegated_identity: null,
    delegated_scopes: [],
    revocation_version: 1,
    active: true,
    scopes: ['request:governed', 'approve:binding', 'read:knowledge']
  },
  {
    principal_id: 'human-limited',
    principal_type: 'human',
    auth_method: 'mfa',
    delegated_identity: null,
    delegated_scopes: [],
    revocation_version: 1,
    active: true,
    scopes: ['request:governed']
  },
  {
    principal_id: 'human-foreign',
    principal_type: 'human',
    auth_method: 'mfa',
    delegated_identity: null,
    delegated_scopes: [],
    revocation_version: 1,
    active: true,
    scopes: ['request:governed']
  },
  {
    principal_id: 'service-001',
    principal_type: 'service',
    auth_method: 'service-token',
    delegated_identity: 'service-001/delegated-worker',
    delegated_scopes: ['request:governed'],
    revocation_version: 1,
    active: true,
    scopes: ['request:governed', 'process:jobs']
  },
  {
    principal_id: 'agent-001',
    principal_type: 'agent',
    auth_method: 'agent-session',
    delegated_identity: 'service-001',
    delegated_scopes: ['request:governed'],
    revocation_version: 1,
    active: true,
    scopes: ['request:governed', 'read:knowledge']
  },
  {
    principal_id: 'agent-foreign',
    principal_type: 'agent',
    auth_method: 'agent-session',
    delegated_identity: 'service-foreign',
    delegated_scopes: ['request:governed'],
    revocation_version: 2,
    active: true,
    scopes: ['request:governed']
  },
  {
    principal_id: 'service-overreach',
    principal_type: 'service',
    auth_method: 'service-token',
    delegated_identity: 'service-overreach/delegated',
    delegated_scopes: ['request:governed', 'read:knowledge'],
    revocation_version: 2,
    active: true,
    scopes: ['request:governed']
  },
  {
    principal_id: 'revoked-human',
    principal_type: 'human',
    auth_method: 'mfa',
    delegated_identity: null,
    delegated_scopes: [],
    revocation_version: 9,
    active: false,
    scopes: ['request:governed']
  }
];

const MEMBERSHIP_FIXTURES: OrganizationMembershipFixture[] = [
  { principal_id: 'human-001', organization_id: 'org-acme', can_act: true, agent_can_select: false },
  { principal_id: 'human-limited', organization_id: 'org-acme', can_act: false, agent_can_select: false },
  { principal_id: 'human-foreign', organization_id: 'org-foreign', can_act: true, agent_can_select: false },
  { principal_id: 'service-001', organization_id: 'org-acme', can_act: true, agent_can_select: false },
  { principal_id: 'agent-001', organization_id: 'org-acme', can_act: true, agent_can_select: true },
  { principal_id: 'agent-foreign', organization_id: 'org-foreign', can_act: true, agent_can_select: true },
  { principal_id: 'service-overreach', organization_id: 'org-acme', can_act: true, agent_can_select: false },
  { principal_id: 'revoked-human', organization_id: 'org-acme', can_act: false, agent_can_select: false }
];

function buildFailedClosedOrganizationContext(failure_reason: string, source: string): OrganizationContext {
  return {
    organization_id: null,
    organization_state: 'failed_closed',
    source,
    resolved_at: new Date().toISOString(),
    isolation_boundary: null,
    revocation_version: null,
    resolution_state: 'failed_closed',
    failure_reason
  };
}

function buildResolvedOrganizationContext(fixture: OrganizationFixture): OrganizationContext {
  return {
    organization_id: fixture.organization_id,
    organization_state: fixture.organization_state,
    source: 'fixture',
    resolved_at: new Date().toISOString(),
    isolation_boundary: fixture.isolation_boundary,
    revocation_version: fixture.revocation_version,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

function buildFailedClosedIdentityContext(failure_reason: string): IdentityContext {
  return {
    principal_id: null,
    principal_type: null,
    delegated_identity: null,
    scopes: [],
    auth_method: null,
    resolved_at: new Date().toISOString(),
    revocation_version: null,
    resolution_state: 'failed_closed',
    failure_reason
  };
}

function buildResolvedIdentityContext(fixture: PrincipalFixture): IdentityContext {
  return {
    principal_id: fixture.principal_id,
    principal_type: fixture.principal_type,
    delegated_identity: fixture.delegated_identity,
    scopes: [...fixture.scopes],
    auth_method: fixture.auth_method,
    resolved_at: new Date().toISOString(),
    revocation_version: fixture.revocation_version,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

function normalizeHint(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function findPrincipalFixture(principal_hint: string | null | undefined): PrincipalFixture | undefined {
  const hint = normalizeHint(principal_hint);
  return PRINCIPAL_FIXTURES.find((candidate) => normalizeHint(candidate.principal_id) === hint);
}

function findOrganizationFixture(organization_hint: string | null | undefined): OrganizationFixture | undefined {
  const hint = normalizeHint(organization_hint);
  if (!hint) {
    return undefined;
  }
  return ORGANIZATION_FIXTURES.find((fixture) => {
    return fixture.aliases.some((alias) => normalizeHint(alias) === hint) || normalizeHint(fixture.organization_id) === hint;
  });
}

function findMembership(principal_id: string, organization_id: string): OrganizationMembershipFixture | undefined {
  return MEMBERSHIP_FIXTURES.find((membership) => membership.principal_id === principal_id && membership.organization_id === organization_id);
}

export function resolveOrganizationContext(request: Pick<CoreRequest, 'organization_hint' | 'principal_hint' | 'payload'>): OrganizationContext {
  const principal = findPrincipalFixture(request.principal_hint);
  if (!principal) {
    return buildFailedClosedOrganizationContext('principal hint missing or unresolved', 'principal-missing');
  }

  if (!principal.active) {
    return buildFailedClosedOrganizationContext('principal is revoked', 'principal-revoked');
  }

  const organization = findOrganizationFixture(request.organization_hint);
  if (!organization) {
    return buildFailedClosedOrganizationContext('organization hint did not match any governed organization', 'unresolved');
  }

  if (organization.organization_state !== 'active') {
    return buildFailedClosedOrganizationContext('organization is inactive', 'inactive');
  }

  const membership = findMembership(principal.principal_id, organization.organization_id);
  if (!membership) {
    return buildFailedClosedOrganizationContext('principal does not belong to the resolved organization', 'membership-missing');
  }

  if (!membership.can_act) {
    return buildFailedClosedOrganizationContext('principal cannot act inside this organization', 'membership-denied');
  }

  if (request.payload.flags.agent_selected_organization === true && principal.principal_type === 'agent' && !membership.agent_can_select) {
    return buildFailedClosedOrganizationContext('agent cannot select organization arbitrarily', 'agent-selected-organization');
  }

  if (principal.principal_type === 'agent' && normalizeHint(request.organization_hint) !== normalizeHint(organization.organization_id)) {
    return buildFailedClosedOrganizationContext('agent organization hint does not match authorized membership', 'agent-organization-mismatch');
  }

  return buildResolvedOrganizationContext(organization);
}

function getRequiredScopes(request: Pick<CoreRequest, 'payload'>): string[] {
  const requiredScope = request.payload.requested_scope;
  if (Array.isArray(requiredScope)) {
    return requiredScope.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0);
  }
  if (typeof requiredScope === 'string' && requiredScope.trim().length > 0) {
    return [requiredScope];
  }
  return [];
}

export function resolveIdentityContext(
  request: Pick<CoreRequest, 'principal_hint' | 'payload'>,
  organizationContext: OrganizationContext
): IdentityContext {
  const hint = normalizeHint(request.principal_hint);
  if (!hint) {
    return buildFailedClosedIdentityContext('principal hint missing');
  }

  if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
    return buildFailedClosedIdentityContext('organization context must be resolved before identity');
  }

  const fixture = PRINCIPAL_FIXTURES.find((candidate) => normalizeHint(candidate.principal_id) === hint);
  if (!fixture) {
    return buildFailedClosedIdentityContext('principal hint did not match any governed identity');
  }

  if (!fixture.active) {
    return buildFailedClosedIdentityContext('principal is revoked');
  }

  const membership = findMembership(fixture.principal_id, organizationContext.organization_id);
  if (!membership) {
    return buildFailedClosedIdentityContext('principal does not belong to the resolved organization');
  }

  if (!membership.can_act) {
    return buildFailedClosedIdentityContext('principal cannot act inside this organization');
  }

  const requiredScopes = getRequiredScopes(request);
  const missingScope = requiredScopes.find((scope) => !fixture.scopes.includes(scope));
  if (missingScope) {
    return buildFailedClosedIdentityContext(`required scope missing: ${missingScope}`);
  }

  if (request.payload.flags.attempt_human_impersonation === true && fixture.principal_type !== 'human') {
    return buildFailedClosedIdentityContext('agent cannot impersonate human');
  }

  if (request.payload.flags.delegated_identity_exceeds_principal === true) {
    return buildFailedClosedIdentityContext('delegated identity exceeds principal authority');
  }

  if (fixture.delegated_identity && fixture.delegated_scopes.some((scope) => !fixture.scopes.includes(scope))) {
    return buildFailedClosedIdentityContext('delegated identity exceeds principal authority');
  }

  return buildResolvedIdentityContext(fixture);
}

export function getIdentityFixtures(): readonly string[] {
  return PRINCIPAL_FIXTURES.map((fixture) => fixture.principal_id);
}

export function getOrganizationFixtures(): readonly string[] {
  return ORGANIZATION_FIXTURES.map((fixture) => fixture.organization_id);
}

export function createIdentityResolutionSeed(input: {
  request: Pick<CoreRequest, 'principal_hint' | 'payload'>;
  organization_id: string;
}): string {
  return createDeterministicId('identity-resolution', {
    principal_hint: normalizeHint(input.request.principal_hint),
    organization_id: input.organization_id,
    payload: input.request.payload
  });
}
