import type { ChannelIdentityMapping, PrincipalType } from '../../contracts/src/index';

export type RuntimeModuleKey = 'telegram-channel' | 'qwen-orchestrator' | 'holded-read' | 'pacoprint-catalog' | 'numa-postgres-read';

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
  HOLDED_API_KEY: string;
  KERN_TELEGRAM_BOT_TOKEN: string;
  KERN_MODEL_BASE_URL: string;
  KERN_MODEL_NAME: string;
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
  HOLDED_API_KEY: string;
  KERN_TELEGRAM_BOT_TOKEN: string;
  KERN_MODEL_BASE_URL: string;
  KERN_MODEL_NAME: string;
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

const SUPPORTED_MODULES: RuntimeModuleKey[] = ['telegram-channel', 'qwen-orchestrator', 'holded-read', 'pacoprint-catalog', 'numa-postgres-read'];
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
      polling_iterations: 1
    }
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
  const organization_id = normalizeString(value.organization_id);
  const principal_id = normalizeString(value.principal_id);
  const installation_id = normalizeString(value.installation_id);
  const principal_type = value.principal_type === undefined || value.principal_type === null ? null : assertPrincipalType(value.principal_type, `identity_mappings[${index}].principal_type`);
  const active = normalizeBoolean(value.active);
  const display_name = normalizeString(value.display_name ?? null);
  if (channel !== 'telegram') {
    fail(`identity_mappings[${index}].channel`, 'identity mapping channel must be telegram');
  }
  if (!telegram_user_id) {
    fail(`identity_mappings[${index}].telegram_user_id`, 'telegram_user_id is required');
  }
  if (!telegram_chat_id) {
    fail(`identity_mappings[${index}].telegram_chat_id`, 'telegram_chat_id is required');
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
  return {
    channel,
    telegram_user_id,
    telegram_chat_id,
    organization_id,
    principal_id,
    installation_id,
    principal_type,
    active,
    display_name
  };
}

function normalizeSecretRefs(value: unknown): RuntimeSecretRefs {
  if (!isPlainObject(value)) {
    fail('secret_refs', 'secret_refs must be an object');
  }
  return {
    HOLDED_API_KEY: assertEnvName(value.HOLDED_API_KEY, 'secret_refs.HOLDED_API_KEY'),
    KERN_TELEGRAM_BOT_TOKEN: assertEnvName(value.KERN_TELEGRAM_BOT_TOKEN, 'secret_refs.KERN_TELEGRAM_BOT_TOKEN'),
    KERN_MODEL_BASE_URL: assertEnvName(value.KERN_MODEL_BASE_URL, 'secret_refs.KERN_MODEL_BASE_URL'),
    KERN_MODEL_NAME: assertEnvName(value.KERN_MODEL_NAME, 'secret_refs.KERN_MODEL_NAME'),
    KERN_MODEL_API_KEY:
      value.KERN_MODEL_API_KEY === undefined || value.KERN_MODEL_API_KEY === null
        ? null
        : assertEnvName(value.KERN_MODEL_API_KEY, 'secret_refs.KERN_MODEL_API_KEY'),
    PACOPRINT_API_TOKEN:
      value.PACOPRINT_API_TOKEN === undefined || value.PACOPRINT_API_TOKEN === null
        ? null
        : assertEnvName(value.PACOPRINT_API_TOKEN, 'secret_refs.PACOPRINT_API_TOKEN')
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
  return {
    telegram_mode,
    telegram_poll_timeout_ms,
    telegram_poll_limit,
    qwen_temperature,
    qwen_request_timeout_ms,
    holded_base_url,
    conversation_memory_file_path,
    evidence_ledger_file_path,
    polling_iterations
  };
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

export function resolveRuntimeSecrets(secretRefs: RuntimeSecretRefs, env: NodeJS.ProcessEnv = process.env): ResolvedRuntimeSecrets {
  const resolveRequired = (ref: string, field: string): string => {
    const value = normalizeString(env[ref]);
    if (!value) {
      fail(field, `Missing required secret ref: ${ref}`);
    }
    return value;
  };
  const resolveOptional = (ref: string): string | null => normalizeString(env[ref]);

  return {
    HOLDED_API_KEY: resolveRequired(secretRefs.HOLDED_API_KEY, 'secret_refs.HOLDED_API_KEY'),
    KERN_TELEGRAM_BOT_TOKEN: resolveRequired(secretRefs.KERN_TELEGRAM_BOT_TOKEN, 'secret_refs.KERN_TELEGRAM_BOT_TOKEN'),
    KERN_MODEL_BASE_URL: resolveRequired(secretRefs.KERN_MODEL_BASE_URL, 'secret_refs.KERN_MODEL_BASE_URL'),
    KERN_MODEL_NAME: resolveRequired(secretRefs.KERN_MODEL_NAME, 'secret_refs.KERN_MODEL_NAME'),
    KERN_MODEL_API_KEY: secretRefs.KERN_MODEL_API_KEY ? resolveOptional(secretRefs.KERN_MODEL_API_KEY) : null,
    PACOPRINT_API_TOKEN: secretRefs.PACOPRINT_API_TOKEN ? resolveOptional(secretRefs.PACOPRINT_API_TOKEN) : null
  };
}

export function loadInstallationConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): LoadedRuntimeConfig {
  const config = validateInstallationConfig(raw);
  const secrets = resolveRuntimeSecrets(config.secret_refs, env);
  return { config, secrets };
}
