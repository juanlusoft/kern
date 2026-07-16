import type { ChannelIdentityMapping, PrincipalType } from '../../contracts/src/index';

export type RuntimeModuleKey =
  | 'telegram-channel'
  | 'qwen-orchestrator'
  | 'holded-read'
  | 'pacoprint-catalog'
  | 'numa-postgres-read'
  | 'openwebui-channel';

export interface RuntimeNumaHrConfig {
  time_type_by_label: Record<string, number[]>;
  annual_quota_by_time_type: Record<number, number>;
  company_id_by_organization_id?: Record<string, string>;
}

export interface RuntimeOpenWebUIUserConfig {
  principal_id: string;
  organization_id: string;
  active: boolean;
  display_name?: string | null;
}

export interface RuntimeOpenWebUIIdentityConfig {
  source: 'body_user' | 'header';
  header: string | null;
}

export interface RuntimeOpenWebUIConfig {
  host: string;
  port: number;
  request_body_limit_bytes: number;
  network_boundary: 'loopback' | 'trusted_network';
  allowed_remote_addresses: string[];
  identity: RuntimeOpenWebUIIdentityConfig;
  users: Record<string, RuntimeOpenWebUIUserConfig>;
}

export interface RuntimeLearningShadowConfig {
  enabled: boolean;
  file_path: string | null;
  capture_raw_text: boolean;
  capture_model_params: boolean;
}

export interface RuntimeOrganizationConfig {
  organization_id: string;
  name: string;
  active: boolean;
  isolation_boundary: string | null;
}

export interface RuntimePrincipalConfig {
  principal_id: string;
  name: string;
  principal_type: PrincipalType;
  active: boolean;
  scopes: string[];
}

export interface RuntimeSecretRefs {
  HOLDED_API_KEY?: string | null;
  KERN_TELEGRAM_BOT_TOKEN?: string | null;
  KERN_MODEL_BASE_URL?: string | null;
  KERN_MODEL_NAME?: string | null;
  KERN_MODEL_API_KEY?: string | null;
  PACOPRINT_API_TOKEN?: string | null;
}

export interface RuntimeOptions {
  telegram_mode: 'long_polling' | 'webhook';
  telegram_poll_timeout_ms: number;
  telegram_poll_limit: number;
  qwen_temperature: number;
  qwen_request_timeout_ms: number;
  holded_base_url: string | null;
  conversation_memory_file_path?: string | null;
  evidence_ledger_file_path?: string | null;
  polling_iterations: number;
  numa_hr?: RuntimeNumaHrConfig | null;
  openwebui_channel?: RuntimeOpenWebUIConfig | null;
  learning_shadow?: RuntimeLearningShadowConfig | null;
}

export interface RuntimeInstallationConfig {
  installation_id: string;
  organization: RuntimeOrganizationConfig;
  principals: RuntimePrincipalConfig[];
  identity_mappings: ChannelIdentityMapping[];
  active_modules: RuntimeModuleKey[];
  active_capabilities: string[];
  secret_refs: RuntimeSecretRefs;
  runtime_options: RuntimeOptions;
}

export interface ResolvedRuntimeSecrets {
  HOLDED_API_KEY: string | null;
  KERN_TELEGRAM_BOT_TOKEN: string | null;
  KERN_MODEL_BASE_URL: string | null;
  KERN_MODEL_NAME: string | null;
  KERN_MODEL_API_KEY: string | null;
  PACOPRINT_API_TOKEN: string | null;
}

export interface LoadedRuntimeConfig {
  config: RuntimeInstallationConfig;
  secrets: ResolvedRuntimeSecrets;
}

export class RuntimeConfigError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.field = field;
  }
}

const SUPPORTED_MODULES: RuntimeModuleKey[] = [
  'telegram-channel',
  'qwen-orchestrator',
  'holded-read',
  'pacoprint-catalog',
  'numa-postgres-read',
  'openwebui-channel'
];
const PRINCIPAL_TYPES: PrincipalType[] = ['human', 'service', 'agent'];
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizePortNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65_535 ? value : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => item !== null);
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(field: string, message: string): never {
  throw new RuntimeConfigError(message, field);
}

function assertSupportedModule(moduleKey: string, field: string): RuntimeModuleKey {
  if ((SUPPORTED_MODULES as string[]).includes(moduleKey)) {
    return moduleKey as RuntimeModuleKey;
  }
  fail(field, `Unsupported module key: ${moduleKey}`);
}

function assertPrincipalType(value: unknown, field: string): PrincipalType {
  const candidate = normalizeString(value);
  if (!candidate || !PRINCIPAL_TYPES.includes(candidate as PrincipalType)) {
    fail(field, 'Principal type must be human, service, or agent');
  }
  return candidate as PrincipalType;
}

function assertEnvName(value: unknown, field: string): string {
  const candidate = normalizeString(value);
  if (!candidate || !ENV_NAME_PATTERN.test(candidate)) {
    fail(field, 'Secret ref must be an uppercase environment variable name');
  }
  return candidate;
}

export function createSampleInstallationConfig(): RuntimeInstallationConfig {
  return {
    installation_id: 'paco-print-installation',
    organization: {
      organization_id: 'org-pacoprint',
      name: 'PacoPrint',
      active: true,
      isolation_boundary: 'PacoPrint only'
    },
    principals: [
      {
        principal_id: 'gema',
        name: 'Gema',
        principal_type: 'human',
        active: true,
        scopes: ['read:knowledge', 'read:estimate']
      },
      {
        principal_id: 'juan',
        name: 'Juan',
        principal_type: 'human',
        active: true,
        scopes: ['read:knowledge']
      }
    ],
    identity_mappings: [
      {
        channel: 'telegram',
        telegram_user_id: 'telegram-gema',
        telegram_chat_id: 'telegram-chat-pacoprint',
        organization_id: 'org-pacoprint',
        principal_id: 'gema',
        installation_id: 'paco-print-installation',
        principal_type: 'human',
        active: true,
        display_name: 'Gema'
      },
      {
        channel: 'telegram',
        telegram_user_id: 'telegram-juan',
        telegram_chat_id: 'telegram-chat-pacoprint',
        organization_id: 'org-pacoprint',
        principal_id: 'juan',
        installation_id: 'paco-print-installation',
        principal_type: 'human',
        active: true,
        display_name: 'Juan'
      }
    ],
    active_modules: ['telegram-channel', 'qwen-orchestrator', 'holded-read'],
    active_capabilities: ['mock.resource.read'],
    secret_refs: {
      HOLDED_API_KEY: 'HOLDED_API_KEY',
      KERN_TELEGRAM_BOT_TOKEN: 'KERN_TELEGRAM_BOT_TOKEN',
      KERN_MODEL_BASE_URL: 'KERN_MODEL_BASE_URL',
      KERN_MODEL_NAME: 'KERN_MODEL_NAME',
      KERN_MODEL_API_KEY: 'KERN_MODEL_API_KEY'
    },
    runtime_options: {
      telegram_mode: 'long_polling',
      telegram_poll_timeout_ms: 30_000,
      telegram_poll_limit: 100,
      qwen_temperature: 0.1,
      qwen_request_timeout_ms: 30_000,
      holded_base_url: null,
      conversation_memory_file_path: null,
      evidence_ledger_file_path: null,
      polling_iterations: 1,
      learning_shadow: null,
      openwebui_channel: null,
      numa_hr: {
        time_type_by_label: {
          vacaciones: [5],
          'asuntos propios': [34]
        },
        annual_quota_by_time_type: {
          5: 22,
          34: 6
        },
        company_id_by_organization_id: {
          'org-pacoprint': 'company-pacoprint'
        }
      }
    }
  };
}

function normalizeBusinessLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumaHrConfig(value: unknown): RuntimeNumaHrConfig | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    fail('runtime_options.numa_hr', 'numa_hr must be an object');
  }

  const timeTypeByLabelRaw = value.time_type_by_label;
  if (!isPlainObject(timeTypeByLabelRaw)) {
    fail('runtime_options.numa_hr.time_type_by_label', 'time_type_by_label must be an object');
  }
  const time_type_by_label: Record<string, number[]> = {};
  for (const [label, idsValue] of Object.entries(timeTypeByLabelRaw)) {
    const normalizedLabel = normalizeBusinessLabel(label);
    if (!normalizedLabel) {
      fail('runtime_options.numa_hr.time_type_by_label', 'time_type_by_label keys must be non-empty strings');
    }
    if (!Array.isArray(idsValue) || idsValue.length === 0) {
      fail(`runtime_options.numa_hr.time_type_by_label.${label}`, 'time_type_by_label values must be non-empty arrays');
    }
    const ids = idsValue.map((entry) => normalizePositiveInteger(entry)).filter((entry): entry is number => entry !== null);
    if (ids.length !== idsValue.length) {
      fail(`runtime_options.numa_hr.time_type_by_label.${label}`, 'time_type_by_label values must be positive integers');
    }
    time_type_by_label[normalizedLabel] = [...new Set(ids)];
  }

  const annualQuotaByTimeTypeRaw = value.annual_quota_by_time_type;
  if (!isPlainObject(annualQuotaByTimeTypeRaw)) {
    fail('runtime_options.numa_hr.annual_quota_by_time_type', 'annual_quota_by_time_type must be an object');
  }
  const annual_quota_by_time_type: Record<number, number> = {};
  for (const [key, quotaValue] of Object.entries(annualQuotaByTimeTypeRaw)) {
    const timeTypeId = normalizePositiveInteger(Number(key));
    const quota = normalizePositiveInteger(quotaValue);
    if (timeTypeId === null || quota === null) {
      fail('runtime_options.numa_hr.annual_quota_by_time_type', 'annual_quota_by_time_type entries must be positive integers');
    }
    annual_quota_by_time_type[timeTypeId] = quota;
  }

  const companyIdByOrganizationIdRaw = value.company_id_by_organization_id;
  let company_id_by_organization_id: Record<string, string> | undefined;
  if (companyIdByOrganizationIdRaw !== undefined && companyIdByOrganizationIdRaw !== null) {
    if (!isPlainObject(companyIdByOrganizationIdRaw)) {
      fail('runtime_options.numa_hr.company_id_by_organization_id', 'company_id_by_organization_id must be an object');
    }
    company_id_by_organization_id = {};
    for (const [organizationId, companyIdValue] of Object.entries(companyIdByOrganizationIdRaw)) {
      const normalizedOrganizationId = normalizeString(organizationId);
      const normalizedCompanyId = normalizeString(companyIdValue);
      if (!normalizedOrganizationId) {
        fail('runtime_options.numa_hr.company_id_by_organization_id', 'company_id_by_organization_id keys must be non-empty strings');
      }
      if (!normalizedCompanyId) {
        fail('runtime_options.numa_hr.company_id_by_organization_id.' + organizationId, 'company_id_by_organization_id values must be non-empty strings');
      }
      company_id_by_organization_id[normalizedOrganizationId] = normalizedCompanyId;
    }
  }

  return {
    time_type_by_label,
    annual_quota_by_time_type,
    company_id_by_organization_id
  };
}
function normalizeOpenWebUIIdentityConfig(value: unknown): RuntimeOpenWebUIIdentityConfig {
  if (value === undefined || value === null) {
    return {
      source: 'body_user',
      header: null
    };
  }
  if (!isPlainObject(value)) {
    fail('runtime_options.openwebui_channel.identity', 'identity must be an object');
  }
  const source = normalizeString(value.source) ?? 'body_user';
  if (source !== 'body_user' && source !== 'header') {
    fail('runtime_options.openwebui_channel.identity.source', 'identity source must be body_user or header');
  }
  if (source === 'header') {
    const header = normalizeString(value.header);
    if (!header) {
      fail('runtime_options.openwebui_channel.identity.header', 'identity header is required when source is header');
    }
    return {
      source,
      header: header.toLowerCase()
    };
  }
  return {
    source,
    header: null
  };
}

function normalizeOpenWebUIUserConfig(value: unknown, field: string): RuntimeOpenWebUIUserConfig {
  if (!isPlainObject(value)) {
    fail(field, 'openwebui user mapping must be an object');
  }
  const principal_id = normalizeString(value.principal_id);
  const organization_id = normalizeString(value.organization_id);
  const active = normalizeBoolean(value.active);
  const display_name = normalizeString(value.display_name ?? null);
  if (!principal_id) {
    fail(field + '.principal_id', 'principal_id is required');
  }
  if (!organization_id) {
    fail(field + '.organization_id', 'organization_id is required');
  }
  if (active === null) {
    fail(field + '.active', 'active must be boolean');
  }
  return {
    principal_id,
    organization_id,
    active,
    display_name
  };
}

function isLoopbackOpenWebUIHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function normalizeOpenWebUINetworkBoundary(value: unknown): 'loopback' | 'trusted_network' {
  const boundary = normalizeString(value) ?? 'loopback';
  if (boundary !== 'loopback' && boundary !== 'trusted_network') {
    fail('runtime_options.openwebui_channel.network_boundary', 'network_boundary must be loopback or trusted_network');
  }
  return boundary;
}

function normalizeOpenWebUIAllowedRemoteAddresses(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail('runtime_options.openwebui_channel.allowed_remote_addresses', 'allowed_remote_addresses must be an array');
  }
  const addresses = value.map((entry) => normalizeString(entry)).filter((entry): entry is string => Boolean(entry));
  if (addresses.length !== value.length) {
    fail('runtime_options.openwebui_channel.allowed_remote_addresses', 'allowed remote addresses must be non-empty strings');
  }
  return addresses;
}

function normalizeOpenWebUIConfig(value: unknown): RuntimeOpenWebUIConfig | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    fail('runtime_options.openwebui_channel', 'openwebui_channel must be an object');
  }
  const host = normalizeString(value.host) ?? '127.0.0.1';
  const network_boundary = normalizeOpenWebUINetworkBoundary(value.network_boundary);
  const allowed_remote_addresses = normalizeOpenWebUIAllowedRemoteAddresses(value.allowed_remote_addresses);
  const port = normalizePortNumber(value.port);
  const request_body_limit_bytes = normalizePositiveInteger(value.request_body_limit_bytes) ?? 1_000_000;
  const identity = normalizeOpenWebUIIdentityConfig(value.identity ?? null);
  if (network_boundary === 'loopback' && !isLoopbackOpenWebUIHost(host)) {
    fail('runtime_options.openwebui_channel.host', 'host must be loopback unless network_boundary is trusted_network');
  }
  if (network_boundary === 'trusted_network' && allowed_remote_addresses.length === 0) {
    fail('runtime_options.openwebui_channel.allowed_remote_addresses', 'trusted_network requires allowed_remote_addresses');
  }
  const usersRaw = value.users;
  if (!isPlainObject(usersRaw)) {
    fail('runtime_options.openwebui_channel.users', 'users must be an object');
  }
  const users: Record<string, RuntimeOpenWebUIUserConfig> = {};
  for (const [external_user_id, userValue] of Object.entries(usersRaw)) {
    const normalizedExternalUserId = normalizeString(external_user_id);
    if (!normalizedExternalUserId) {
      fail('runtime_options.openwebui_channel.users', 'user ids must be non-empty strings');
    }
    users[normalizedExternalUserId] = normalizeOpenWebUIUserConfig(
      userValue,
      'runtime_options.openwebui_channel.users.' + normalizedExternalUserId
    );
  }
  if (Object.keys(users).length === 0) {
    fail('runtime_options.openwebui_channel.users', 'users must not be empty');
  }
  if (port === null) {
    fail('runtime_options.openwebui_channel.port', 'port must be an integer between 0 and 65535');
  }
  return {
    host,
    port,
    request_body_limit_bytes,
    network_boundary,
    allowed_remote_addresses,
    identity,
    users
  };
}

function normalizeLearningShadowConfig(value: unknown): RuntimeLearningShadowConfig | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    fail('runtime_options.learning_shadow', 'learning_shadow must be an object');
  }
  const enabled = normalizeBoolean(value.enabled);
  if (enabled === null) {
    fail('runtime_options.learning_shadow.enabled', 'enabled must be boolean');
  }
  const file_path = normalizeString(value.file_path ?? null);
  const capture_raw_text = normalizeBoolean(value.capture_raw_text ?? false);
  const capture_model_params = normalizeBoolean(value.capture_model_params ?? false);
  if (enabled && !file_path) {
    fail('runtime_options.learning_shadow.file_path', 'file_path is required when learning_shadow is enabled');
  }
  if (file_path && !file_path.endsWith('.jsonl')) {
    fail('runtime_options.learning_shadow.file_path', 'file_path must use .jsonl extension');
  }
  if (capture_raw_text === null) {
    fail('runtime_options.learning_shadow.capture_raw_text', 'capture_raw_text must be boolean');
  }
  if (capture_model_params === null) {
    fail('runtime_options.learning_shadow.capture_model_params', 'capture_model_params must be boolean');
  }
  return {
    enabled,
    file_path,
    capture_raw_text,
    capture_model_params
  };
}

function normalizeOrganization(value: unknown): RuntimeOrganizationConfig {
  if (!isPlainObject(value)) {
    fail('organization', 'organization must be an object');
  }
  const organization_id = normalizeString(value.organization_id);
  const name = normalizeString(value.name);
  const active = normalizeBoolean(value.active);
  const isolation_boundary = normalizeString(value.isolation_boundary ?? null);
  if (!organization_id) {
    fail('organization.organization_id', 'organization.organization_id is required');
  }
  if (!name) {
    fail('organization.name', 'organization.name is required');
  }
  if (active === null) {
    fail('organization.active', 'organization.active must be boolean');
  }
  return {
    organization_id,
    name,
    active,
    isolation_boundary
  };
}

function normalizePrincipal(value: unknown, index: number): RuntimePrincipalConfig {
  if (!isPlainObject(value)) {
    fail(`principals[${index}]`, 'principal must be an object');
  }
  const principal_id = normalizeString(value.principal_id);
  const name = normalizeString(value.name);
  const principal_type = assertPrincipalType(value.principal_type, `principals[${index}].principal_type`);
  const active = normalizeBoolean(value.active);
  const scopes = normalizeStringArray(value.scopes);
  if (!principal_id) {
    fail(`principals[${index}].principal_id`, 'principal_id is required');
  }
  if (!name) {
    fail(`principals[${index}].name`, 'principal name is required');
  }
  if (active === null) {
    fail(`principals[${index}].active`, 'principal.active must be boolean');
  }
  if (!scopes) {
    fail(`principals[${index}].scopes`, 'principal.scopes must be an array');
  }
  return {
    principal_id,
    name,
    principal_type,
    active,
    scopes
  };
}

function normalizeIdentityMapping(value: unknown, index: number): ChannelIdentityMapping {
  if (!isPlainObject(value)) {
    fail(`identity_mappings[${index}]`, 'identity mapping must be an object');
  }
  const channel = normalizeString(value.channel);
  const telegram_user_id = normalizeString(value.telegram_user_id);
  const telegram_chat_id = normalizeString(value.telegram_chat_id);
  const openwebui_user_id = normalizeString(value.openwebui_user_id);
  const organization_id = normalizeString(value.organization_id);
  const principal_id = normalizeString(value.principal_id);
  const installation_id = normalizeString(value.installation_id);
  const principal_type = value.principal_type === undefined || value.principal_type === null ? null : assertPrincipalType(value.principal_type, `identity_mappings[${index}].principal_type`);
  const active = normalizeBoolean(value.active);
  const display_name = normalizeString(value.display_name ?? null);
  if (channel !== 'telegram' && channel !== 'openwebui') {
    fail(`identity_mappings[${index}].channel`, 'identity mapping channel must be telegram or openwebui');
  }
  if (channel === 'telegram' && !telegram_user_id) {
    fail(`identity_mappings[${index}].telegram_user_id`, 'telegram_user_id is required');
  }
  if (channel === 'telegram' && !telegram_chat_id) {
    fail(`identity_mappings[${index}].telegram_chat_id`, 'telegram_chat_id is required');
  }
  if (channel === 'openwebui' && !openwebui_user_id) {
    fail(`identity_mappings[${index}].openwebui_user_id`, 'openwebui_user_id is required');
  }
  if (!organization_id) {
    fail(`identity_mappings[${index}].organization_id`, 'organization_id is required');
  }
  if (!principal_id) {
    fail(`identity_mappings[${index}].principal_id`, 'principal_id is required');
  }
  if (!installation_id) {
    fail(`identity_mappings[${index}].installation_id`, 'installation_id is required');
  }
  if (active === null) {
    fail(`identity_mappings[${index}].active`, 'identity mapping active must be boolean');
  }
  const requiredOrganizationId = organization_id;
  const requiredPrincipalId = principal_id;
  const requiredInstallationId = installation_id;
  const requiredActive = active;
  if (channel === 'openwebui') {
    const requiredOpenWebUIUserId =
      openwebui_user_id ?? fail(`identity_mappings[${index}].openwebui_user_id`, 'openwebui_user_id is required');
    return {
      channel: 'openwebui',
      openwebui_user_id: requiredOpenWebUIUserId,
      organization_id: requiredOrganizationId,
      principal_id: requiredPrincipalId,
      installation_id: requiredInstallationId,
      principal_type,
      active: requiredActive,
      display_name
    };
  }
  const requiredTelegramUserId =
    telegram_user_id ?? fail(`identity_mappings[${index}].telegram_user_id`, 'telegram_user_id is required');
  const requiredTelegramChatId =
    telegram_chat_id ?? fail(`identity_mappings[${index}].telegram_chat_id`, 'telegram_chat_id is required');
  return {
    channel: 'telegram',
    telegram_user_id: requiredTelegramUserId,
    telegram_chat_id: requiredTelegramChatId,
    organization_id: requiredOrganizationId,
    principal_id: requiredPrincipalId,
    installation_id: requiredInstallationId,
    principal_type,
    active: requiredActive,
    display_name
  };
}

function normalizeSecretRefs(value: unknown): RuntimeSecretRefs {
  if (!isPlainObject(value)) {
    fail('secret_refs', 'secret_refs must be an object');
  }
  const normalizeOptionalRef = (candidate: unknown, field: string): string | null =>
    candidate === undefined || candidate === null ? null : assertEnvName(candidate, field);
  return {
    HOLDED_API_KEY: normalizeOptionalRef(value.HOLDED_API_KEY, 'secret_refs.HOLDED_API_KEY'),
    KERN_TELEGRAM_BOT_TOKEN: normalizeOptionalRef(value.KERN_TELEGRAM_BOT_TOKEN, 'secret_refs.KERN_TELEGRAM_BOT_TOKEN'),
    KERN_MODEL_BASE_URL: normalizeOptionalRef(value.KERN_MODEL_BASE_URL, 'secret_refs.KERN_MODEL_BASE_URL'),
    KERN_MODEL_NAME: normalizeOptionalRef(value.KERN_MODEL_NAME, 'secret_refs.KERN_MODEL_NAME'),
    KERN_MODEL_API_KEY: normalizeOptionalRef(value.KERN_MODEL_API_KEY, 'secret_refs.KERN_MODEL_API_KEY'),
    PACOPRINT_API_TOKEN: normalizeOptionalRef(value.PACOPRINT_API_TOKEN, 'secret_refs.PACOPRINT_API_TOKEN')
  };
}

function normalizeRuntimeOptions(value: unknown): RuntimeOptions {
  if (!isPlainObject(value)) {
    fail('runtime_options', 'runtime_options must be an object');
  }
  const telegram_mode = normalizeString(value.telegram_mode) ?? 'long_polling';
  if (telegram_mode !== 'long_polling' && telegram_mode !== 'webhook') {
    fail('runtime_options.telegram_mode', 'telegram_mode must be long_polling or webhook');
  }
  const telegram_poll_timeout_ms = normalizePositiveInteger(value.telegram_poll_timeout_ms) ?? 30_000;
  const telegram_poll_limit = normalizePositiveInteger(value.telegram_poll_limit) ?? 100;
  const qwen_temperature = normalizeNumber(value.qwen_temperature) ?? 0.1;
  const qwen_request_timeout_ms = normalizePositiveInteger(value.qwen_request_timeout_ms) ?? 30_000;
  const holded_base_url = normalizeString(value.holded_base_url ?? null);
  const conversation_memory_file_path = normalizeString(value.conversation_memory_file_path ?? null);
  const evidence_ledger_file_path = normalizeString(value.evidence_ledger_file_path ?? null);
  const polling_iterations = normalizePositiveInteger(value.polling_iterations) ?? 1;
  const numa_hr = normalizeNumaHrConfig(value.numa_hr);
  const openwebui_channel = normalizeOpenWebUIConfig(value.openwebui_channel);
  const learning_shadow = normalizeLearningShadowConfig(value.learning_shadow);
  return {
    telegram_mode,
    telegram_poll_timeout_ms,
    telegram_poll_limit,
    qwen_temperature,
    qwen_request_timeout_ms,
    holded_base_url,
    conversation_memory_file_path,
    evidence_ledger_file_path,
    polling_iterations,
    numa_hr,
    openwebui_channel,
    learning_shadow
  };
}

function validateModuleSpecificConfig(input: {
  organization: RuntimeOrganizationConfig;
  active_modules: RuntimeModuleKey[];
  runtime_options: RuntimeOptions;
}): void {
  if (input.active_modules.includes('numa-postgres-read')) {
    const mapping = input.runtime_options.numa_hr?.company_id_by_organization_id;
    const organizationId = input.organization.organization_id;
    const companyId = mapping?.[organizationId];
    if (!normalizeString(companyId)) {
      fail(
        'runtime_options.numa_hr.company_id_by_organization_id.' + organizationId,
        'numa-postgres-read requires company_id_by_organization_id for the installation organization'
      );
    }
  }
}

export function validateInstallationConfig(raw: unknown): RuntimeInstallationConfig {
  if (!isPlainObject(raw)) {
    fail('root', 'installation config must be an object');
  }
  const installation_id = normalizeString(raw.installation_id);
  if (!installation_id) {
    fail('installation_id', 'installation_id is required');
  }
  const organization = normalizeOrganization(raw.organization);
  const principalsRaw = Array.isArray(raw.principals) ? raw.principals : null;
  if (!principalsRaw) {
    fail('principals', 'principals must be an array');
  }
  const principals = principalsRaw.map((principal, index) => normalizePrincipal(principal, index));
  const identityMappingsRaw = Array.isArray(raw.identity_mappings) ? raw.identity_mappings : null;
  if (!identityMappingsRaw) {
    fail('identity_mappings', 'identity_mappings must be an array');
  }
  const identity_mappings = identityMappingsRaw.map((mapping, index) => normalizeIdentityMapping(mapping, index));
  const active_modules_raw = normalizeStringArray(raw.active_modules);
  if (!active_modules_raw) {
    fail('active_modules', 'active_modules must be an array');
  }
  const active_modules = active_modules_raw.map((moduleKey, index) =>
    assertSupportedModule(moduleKey, `active_modules[${index}]`)
  );
  const active_capabilities_raw = normalizeStringArray(raw.active_capabilities);
  if (!active_capabilities_raw) {
    fail('active_capabilities', 'active_capabilities must be an array');
  }
  const active_capabilities = active_capabilities_raw;
  const secret_refs = normalizeSecretRefs(raw.secret_refs);
  const runtime_options = normalizeRuntimeOptions(raw.runtime_options);
  validateModuleSpecificConfig({
    organization,
    active_modules,
    runtime_options
  });
  return {
    installation_id,
    organization,
    principals,
    identity_mappings,
    active_modules,
    active_capabilities,
    secret_refs,
    runtime_options
  };
}

export function resolveRuntimeSecrets(
  secretRefs: RuntimeSecretRefs,
  activeModules: RuntimeModuleKey[],
  env: NodeJS.ProcessEnv = process.env
): ResolvedRuntimeSecrets {
  const resolveRequired = (ref: string | null | undefined, field: string): string => {
    if (!ref) {
      fail(field, `Missing required secret ref: ${field}`);
    }
    const value = normalizeString(env[ref]);
    if (!value) {
      fail(field, `Missing required secret ref: ${ref}`);
    }
    return value;
  };
  const resolveOptional = (ref: string | null | undefined): string | null => (ref ? normalizeString(env[ref]) : null);
  const isActive = (moduleKey: RuntimeModuleKey): boolean => activeModules.includes(moduleKey);

  return {
    HOLDED_API_KEY: isActive('holded-read') ? resolveRequired(secretRefs.HOLDED_API_KEY, 'secret_refs.HOLDED_API_KEY') : resolveOptional(secretRefs.HOLDED_API_KEY),
    KERN_TELEGRAM_BOT_TOKEN: isActive('telegram-channel')
      ? resolveRequired(secretRefs.KERN_TELEGRAM_BOT_TOKEN, 'secret_refs.KERN_TELEGRAM_BOT_TOKEN')
      : resolveOptional(secretRefs.KERN_TELEGRAM_BOT_TOKEN),
    KERN_MODEL_BASE_URL: isActive('qwen-orchestrator')
      ? resolveRequired(secretRefs.KERN_MODEL_BASE_URL, 'secret_refs.KERN_MODEL_BASE_URL')
      : resolveOptional(secretRefs.KERN_MODEL_BASE_URL),
    KERN_MODEL_NAME: isActive('qwen-orchestrator')
      ? resolveRequired(secretRefs.KERN_MODEL_NAME, 'secret_refs.KERN_MODEL_NAME')
      : resolveOptional(secretRefs.KERN_MODEL_NAME),
    KERN_MODEL_API_KEY: secretRefs.KERN_MODEL_API_KEY ? resolveOptional(secretRefs.KERN_MODEL_API_KEY) : null,
    PACOPRINT_API_TOKEN: isActive('pacoprint-catalog')
      ? resolveRequired(secretRefs.PACOPRINT_API_TOKEN, 'secret_refs.PACOPRINT_API_TOKEN')
      : resolveOptional(secretRefs.PACOPRINT_API_TOKEN)
  };
}

export function loadInstallationConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): LoadedRuntimeConfig {
  const config = validateInstallationConfig(raw);
  const secrets = resolveRuntimeSecrets(config.secret_refs, config.active_modules, env);
  return { config, secrets };
}
