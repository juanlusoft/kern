export type NumaCompanyIdByOrganizationId = Record<string, string>;

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeNumaCompanyIdByOrganizationId(value: unknown, field: string): NumaCompanyIdByOrganizationId {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(field + ' must be an object');
  }
  const mapping: NumaCompanyIdByOrganizationId = {};
  for (const [organizationId, companyIdValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedOrganizationId = normalizeString(organizationId);
    const normalizedCompanyId = normalizeString(companyIdValue);
    if (!normalizedOrganizationId) {
      throw new Error(field + ' keys must be non-empty strings');
    }
    if (!normalizedCompanyId) {
      throw new Error(field + '.' + organizationId + ' company_id must be a non-empty string');
    }
    mapping[normalizedOrganizationId] = normalizedCompanyId;
  }
  return mapping;
}

export function resolveNumaCompanyId(organizationId: string, mapping: NumaCompanyIdByOrganizationId): string {
  const normalizedOrganizationId = organizationId.trim();
  const companyId = normalizeString(mapping[normalizedOrganizationId]);
  if (!companyId) {
    throw new Error('Missing Numa company_id mapping for organization_id: ' + normalizedOrganizationId);
  }
  return companyId;
}