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

interface IdentityFixture {
  principal_id: string;
  principal_type: PrincipalType;
  organization_id: string;
  scopes: string[];
  auth_method: string;
  delegated_identity: string | null;
  delegated_scopes: string[];
  revocation_version: number;
  active: boolean;
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
    revocation_version: 2
  },
  {
    organization_id: 'org-shared-b',
    aliases: ['shared', 'org-shared-b'],
    organization_state: 'active',
    isolation_boundary: 'boundary:org-shared-b',
    revocation_version: 4
  }
];

const IDENTITY_FIXTURES: IdentityFixture[] = [
  {
    principal_id: 'human-001',
    principal_type: 'human',
    organization_id: 'org-acme',
    scopes: ['request:governed', 'approve:binding', 'read:knowledge'],
    auth_method: 'mfa',
    delegated_identity: null,
    delegated_scopes: [],
    revocation_version: 1,
    active: true
  },
  {
    principal_id: 'service-001',
    principal_type: 'service',
    organization_id: 'org-acme',
    scopes: ['request:governed', 'process:jobs'],
    auth_method: 'service-token',
    delegated_identity: 'service-001/delegated-worker',
    delegated_scopes: ['request:governed'],
    revocation_version: 1,
    active: true
  },
  {
    principal_id: 'agent-001',
    principal_type: 'agent',
    organization_id: 'org-acme',
    scopes: ['request:governed', 'read:knowledge'],
    auth_method: 'agent-session',
    delegated_identity: 'service-001',
    delegated_scopes: ['request:governed'],
    revocation_version: 1,
    active: true
  },
  {
    principal_id: 'service-overreach',
    principal_type: 'service',
    organization_id: 'org-acme',
    scopes: ['request:governed'],
    auth_method: 'service-token',
    delegated_identity: 'service-overreach/delegated',
    delegated_scopes: ['request:governed', 'read:knowledge'],
    revocation_version: 2,
    active: true
  },
  {
    principal_id: 'revoked-human',
    principal_type: 'human',
    organization_id: 'org-acme',
    scopes: ['request:governed'],
    auth_method: 'mfa',
    delegated_identity: null,
    delegated_scopes: [],
    revocation_version: 9,
    active: false
  }
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

function buildResolvedIdentityContext(fixture: IdentityFixture): IdentityContext {
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

export function resolveOrganizationContext(request: Pick<CoreRequest, 'organization_hint'>): OrganizationContext {
  const hint = normalizeHint(request.organization_hint);
  if (!hint) {
    return buildFailedClosedOrganizationContext('organization hint missing', 'missing');
  }

  const matches = ORGANIZATION_FIXTURES.filter((fixture) => {
    return fixture.aliases.some((alias) => normalizeHint(alias) === hint) || normalizeHint(fixture.organization_id) === hint;
  });

  if (matches.length === 0) {
    return buildFailedClosedOrganizationContext('organization hint did not match any governed organization', 'unresolved');
  }

  if (matches.length > 1) {
    return buildFailedClosedOrganizationContext('organization hint is ambiguous', 'ambiguous');
  }

  const fixture = matches[0];
  if (fixture.organization_state !== 'active') {
    return buildFailedClosedOrganizationContext('organization is inactive', 'inactive');
  }

  return buildResolvedOrganizationContext(fixture);
}

function getRequiredScopes(request: Pick<CoreRequest, 'payload'>): string[] {
  const requiredScopes = request.payload.required_scopes;
  if (Array.isArray(requiredScopes)) {
    return requiredScopes.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0);
  }
  const requiredScope = request.payload.required_scope;
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

  const fixture = IDENTITY_FIXTURES.find((candidate) => normalizeHint(candidate.principal_id) === hint);
  if (!fixture) {
    return buildFailedClosedIdentityContext('principal hint did not match any governed identity');
  }

  if (!fixture.active) {
    return buildFailedClosedIdentityContext('principal is revoked');
  }

  if (fixture.organization_id !== organizationContext.organization_id) {
    return buildFailedClosedIdentityContext('principal does not belong to the resolved organization');
  }

  const claimedPrincipalType = request.payload.claimed_principal_type;
  if (typeof claimedPrincipalType === 'string' && claimedPrincipalType !== fixture.principal_type) {
    return buildFailedClosedIdentityContext('claimed principal type does not match governed identity');
  }

  if (request.payload.impersonate_human === true && fixture.principal_type !== 'human') {
    return buildFailedClosedIdentityContext('agent cannot impersonate human');
  }

  const requiredScopes = getRequiredScopes(request);
  const missingScope = requiredScopes.find((scope) => !fixture.scopes.includes(scope));
  if (missingScope) {
    return buildFailedClosedIdentityContext(`required scope missing: ${missingScope}`);
  }

  if (fixture.delegated_identity && fixture.delegated_scopes.some((scope) => !fixture.scopes.includes(scope))) {
    return buildFailedClosedIdentityContext('delegated identity exceeds principal authority');
  }

  if (fixture.principal_type === 'agent' && request.payload.claimed_principal_type === 'human') {
    return buildFailedClosedIdentityContext('agent attempted to impersonate human');
  }

  return buildResolvedIdentityContext(fixture);
}

export function getIdentityFixtures(): readonly string[] {
  return IDENTITY_FIXTURES.map((fixture) => fixture.principal_id);
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
