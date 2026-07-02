import {
  createEvidenceRecord,
  type ChannelMessageResult,
  type GovernedWorkflowKind,
  type OrchestrationRequest,
  type TelegramChannelUpdate,
  type TelegramOutboundMessage
} from '../../contracts/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import { InMemoryOrchestrationBoundary } from '../../orchestration/src/index';
import { createTelegramChannelAdapter, type TelegramTransport } from '../../channels/telegram/src/index';
import { createQwenOrchestrator, type QwenChatCompletionsTransport } from '../../orchestrators/qwen/src/index';
import { createMockResourceReadCapability } from '../../capabilities/src/index';
import { createHoldedReadAdapter, type HoldedFetch } from '../../adapters/holded/src/index';
import {
  createNodeFetchHoldedTransport,
  createNodeFetchTelegramTransport,
  createQwenNodeFetchTransport
} from './transports';
import type { QwenToolDefinition } from '../../orchestrators/qwen/src/index';
import {
  createSampleInstallationConfig,
  loadInstallationConfig,
  type LoadedRuntimeConfig,
  type ResolvedRuntimeSecrets,
  type RuntimeInstallationConfig,
  type RuntimeModuleKey,
  type RuntimeOptions,
  type RuntimeSecretRefs,
  type RuntimeOrganizationConfig,
  type RuntimePrincipalConfig,
  RuntimeConfigError
} from './config';
import {
  resolveIdentityContext,
  resolveOrganizationContext
} from '../../identity/src/index';

const REQUIRED_MODULES: RuntimeModuleKey[] = ['telegram-channel', 'qwen-orchestrator', 'holded-read'];
const SUPPORTED_MODULES: RuntimeModuleKey[] = ['telegram-channel', 'qwen-orchestrator', 'holded-read'];

export interface RuntimeModuleDefinition {
  module_key: RuntimeModuleKey;
  display_name: string;
}

export interface RuntimeModuleRegistry {
  register(definition: RuntimeModuleDefinition): RuntimeModuleDefinition;
  get(module_key: RuntimeModuleKey): RuntimeModuleDefinition | undefined;
  has(module_key: RuntimeModuleKey): boolean;
  list(): RuntimeModuleDefinition[];
  listActive(): RuntimeModuleDefinition[];
}

export class InMemoryRuntimeModuleRegistry implements RuntimeModuleRegistry {
  private readonly modules = new Map<RuntimeModuleKey, RuntimeModuleDefinition>();
  private readonly active = new Set<RuntimeModuleKey>();

  constructor(activeModules: RuntimeModuleKey[] = []) {
    for (const moduleKey of activeModules) {
      this.active.add(moduleKey);
    }
  }

  register(definition: RuntimeModuleDefinition): RuntimeModuleDefinition {
    this.modules.set(definition.module_key, { ...definition });
    return this.get(definition.module_key) as RuntimeModuleDefinition;
  }

  get(module_key: RuntimeModuleKey): RuntimeModuleDefinition | undefined {
    const definition = this.modules.get(module_key);
    return definition ? { ...definition } : undefined;
  }

  has(module_key: RuntimeModuleKey): boolean {
    return this.modules.has(module_key);
  }

  list(): RuntimeModuleDefinition[] {
    return [...this.modules.values()].map((definition) => ({ ...definition }));
  }

  listActive(): RuntimeModuleDefinition[] {
    return [...this.active]
      .map((moduleKey) => this.get(moduleKey))
      .filter((definition): definition is RuntimeModuleDefinition => Boolean(definition));
  }

  isActive(module_key: RuntimeModuleKey): boolean {
    return this.active.has(module_key);
  }
}

export interface RuntimeSliceDependencies {
  telegramTransport?: TelegramTransport | null;
  qwenTransport?: QwenChatCompletionsTransport | null;
  holdedFetch?: HoldedFetch | null;
}

export interface RuntimeSliceOptions extends RuntimeSliceDependencies {
  config: RuntimeInstallationConfig;
  secrets: ResolvedRuntimeSecrets;
  now?: () => Date;
}

export interface InstallationRuntimeSlice {
  readonly config: RuntimeInstallationConfig;
  readonly secrets: ResolvedRuntimeSecrets;
  readonly evidenceLedger: InMemoryEvidenceLedger;
  readonly moduleRegistry: RuntimeModuleRegistry;
  readonly workflowRuntime: InMemoryGovernedWorkflowRuntime;
  readonly orchestrationBoundary: InMemoryOrchestrationBoundary;
  readonly telegramAdapter: ReturnType<typeof createTelegramChannelAdapter>;
  pollOnce(limit?: number): ChannelMessageResult[];
  runLoop(options?: { maxIterations?: number; limit?: number }): ChannelMessageResult[][];
}

export interface RuntimeStartResult {
  status: 'started' | 'blocked';
  reason: string | null;
  evidenceLedger: InMemoryEvidenceLedger;
  moduleRegistry: RuntimeModuleRegistry;
  runtime: InstallationRuntimeSlice | null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function cloneTelegramUpdate(update: TelegramChannelUpdate): TelegramChannelUpdate {
  return {
    ...update,
    message: update.message
      ? {
          ...update.message,
          from: update.message.from ? { ...update.message.from } : update.message.from ?? null,
          raw: structuredClone(update.message.raw ?? null)
        }
      : null,
    raw: structuredClone(update.raw ?? null)
  };
}

function createRuntimeEvidence(
  ledger: InMemoryEvidenceLedger,
  now: () => Date,
  input: {
    organization_id: string;
    correlation_id: string;
    record_type:
      | 'installation_config_loaded'
      | 'installation_config_validated'
      | 'installation_start_blocked'
      | 'module_registered'
      | 'module_activated'
      | 'module_missing'
      | 'secret_missing'
      | 'runtime_started'
      | 'runtime_message_received'
      | 'runtime_message_processed'
      | 'runtime_message_failed';
    subject: string;
    data: Record<string, unknown>;
  }
) {
  return ledger.append(
    createEvidenceRecord({
      organization_id: input.organization_id,
      correlation_id: input.correlation_id,
      record_type: input.record_type,
      subject: input.subject,
      data: input.data,
      created_at: now().toISOString()
    })
  );
}

function buildRuntimeModuleRegistry(config: RuntimeInstallationConfig): RuntimeModuleRegistry {
  const registry = new InMemoryRuntimeModuleRegistry(config.active_modules);
  for (const moduleKey of SUPPORTED_MODULES) {
    registry.register({
      module_key: moduleKey,
      display_name:
        moduleKey === 'telegram-channel'
          ? 'Telegram channel adapter'
          : moduleKey === 'qwen-orchestrator'
            ? 'Qwen orchestrator'
            : 'Holded read adapter'
    });
  }
  return registry;
}

function hasRequiredModules(registry: RuntimeModuleRegistry): boolean {
  return REQUIRED_MODULES.every((moduleKey) => registry.has(moduleKey) && (registry as InMemoryRuntimeModuleRegistry).isActive(moduleKey));
}

function buildQwenToolCatalog() {
  return [
    {
      capability_key: 'mock.resource.read',
      description:
        'Read governed estimates or invoices from the runtime by customer or exact document id. For latest estimate or invoice of a named customer, always provide customer_id with the customer name from the user request. For invoice payment-status lists, use resource_type="invoice" with payment_status="pending", "paid", or "overdue". Do not invent estimate_id or invoice_id. Only provide estimate_id or invoice_id if the user explicitly gave an exact estimate or document id.',
      parameters_schema: {
        type: 'object' as const,
        required: ['resource_type'],
        additionalProperties: false as const,
        anyOf: [
          { required: ['customer_id'] },
          { required: ['customer_name'] },
          { required: ['contact_name'] },
          { required: ['contactName'] },
          { required: ['contact'] },
          { required: ['payment_status'] },
          { required: ['estimate_id'] },
          { required: ['invoice_id'] },
          { required: ['resource_id'] }
        ],
        properties: {
          resource_type: {
            type: 'string' as const,
            enum: ['estimate', 'invoice'],
            description: "Use 'estimate' for budget/estimate lookup and 'invoice' for invoice lookup."
          },
          estimate_id: { type: 'string' as const },
          invoice_id: { type: 'string' as const },
          payment_status: {
            type: 'string' as const,
            enum: ['pending', 'paid', 'overdue'],
            description: 'Use only with resource_type="invoice" to list invoices by payment state.'
          },
          resource_id: {
            type: 'string' as const,
            description: 'Known resource id if the user explicitly provided one.'
          },
          customer_id: {
            type: 'string' as const,
            description: "Customer name or search term extracted from the user's request. Required when the user asks for the latest estimate or invoice of a customer."
          },
          customer_name: {
            type: 'string' as const,
            description: 'Alias for customer_id when the user gave a customer name.'
          },
          contact_name: {
            type: 'string' as const,
            description: 'Alias for customer_id when the user gave a contact name.'
          },
          contactName: {
            type: 'string' as const,
            description: 'Alias for customer_id when the user gave a contact name.'
          },
          contact: {
            type: 'string' as const,
            description: 'Alias for customer_id when the user gave a contact.'
          }
        }
      }
    }
  ] satisfies QwenToolDefinition[];
}

function buildTelegramInstallationConfig(config: RuntimeInstallationConfig, secrets: ResolvedRuntimeSecrets) {
  return {
    channel: 'telegram' as const,
    installation_id: config.installation_id,
    active: config.active_modules.includes('telegram-channel') && config.organization.active,
    bot_token: secrets.KERN_TELEGRAM_BOT_TOKEN,
    identity_mappings: config.identity_mappings.map((mapping) => ({ ...mapping }))
  };
}

function buildHoldedInstallation(config: RuntimeInstallationConfig) {
  return {
    installation_id: config.installation_id,
    active_modules: config.active_modules.includes('holded-read') ? ['holded-read'] : []
  };
}

function normalizeRuntimeHint(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function matchesRuntimeHint(hint: string | null | undefined, candidates: string[]): boolean {
  const normalizedHint = normalizeRuntimeHint(hint);
  if (!normalizedHint) {
    return false;
  }
  return candidates.some((candidate) => normalizeRuntimeHint(candidate) === normalizedHint);
}

function buildOrganizationResolver(config: RuntimeInstallationConfig, now: () => Date) {
  return (request: Parameters<typeof resolveOrganizationContext>[0]) => {
    const candidateHints = [config.organization.organization_id, config.organization.name];
    if (!matchesRuntimeHint(request.organization_hint ?? null, candidateHints)) {
      return {
        organization_id: null,
        organization_state: 'failed_closed' as const,
        source: 'installation_config',
        resolved_at: now().toISOString(),
        isolation_boundary: null,
        revocation_version: null,
        resolution_state: 'failed_closed' as const,
        failure_reason: 'organization could not be resolved from installation config'
      };
    }

    return {
      organization_id: config.organization.organization_id,
      organization_state: config.organization.active ? ('active' as const) : ('inactive' as const),
      source: 'installation_config',
      resolved_at: now().toISOString(),
      isolation_boundary: config.organization.isolation_boundary,
      revocation_version: 1,
      resolution_state: 'resolved' as const,
      failure_reason: config.organization.active ? null : 'organization is inactive'
    };
  };
}

function buildIdentityResolver(config: RuntimeInstallationConfig, now: () => Date) {
  return (
    request: Parameters<typeof resolveIdentityContext>[0],
    organizationContext: Parameters<typeof resolveIdentityContext>[1]
  ) => {
    if (
      organizationContext.resolution_state !== 'resolved' ||
      !organizationContext.organization_id ||
      organizationContext.organization_state !== 'active'
    ) {
      return {
        principal_id: null,
        principal_type: null,
        delegated_identity: null,
        scopes: [],
        auth_method: null,
        resolved_at: now().toISOString(),
        revocation_version: null,
        resolution_state: 'failed_closed' as const,
        failure_reason: 'organization could not be resolved'
      };
    }

    const principal = config.principals.find((candidate) =>
      matchesRuntimeHint(request.principal_hint ?? null, [candidate.principal_id, candidate.name])
    );
    if (!principal || !principal.active) {
      return {
        principal_id: null,
        principal_type: null,
        delegated_identity: null,
        scopes: [],
        auth_method: null,
        resolved_at: now().toISOString(),
        revocation_version: null,
        resolution_state: 'failed_closed' as const,
        failure_reason: 'principal could not be resolved from installation config'
      };
    }

    const mapping = config.identity_mappings.find(
      (candidate) =>
        candidate.active &&
        candidate.organization_id === organizationContext.organization_id &&
        candidate.principal_id === principal.principal_id &&
        matchesRuntimeHint(request.principal_hint ?? null, [candidate.principal_id, candidate.display_name ?? ''])
    );
    if (!mapping) {
      return {
        principal_id: null,
        principal_type: null,
        delegated_identity: null,
        scopes: [],
        auth_method: null,
        resolved_at: now().toISOString(),
        revocation_version: null,
        resolution_state: 'failed_closed' as const,
        failure_reason: 'identity mapping could not be resolved from installation config'
      };
    }

    return {
      principal_id: principal.principal_id,
      principal_type: principal.principal_type,
      delegated_identity: null,
      scopes: [...principal.scopes],
      auth_method: 'installation-config',
      resolved_at: now().toISOString(),
      revocation_version: 1,
      resolution_state: 'resolved' as const,
      failure_reason: null
    };
  };
}

function buildOrchestrationBoundary(options: {
  config: RuntimeInstallationConfig;
  secrets: ResolvedRuntimeSecrets;
  qwenTransport: QwenChatCompletionsTransport;
  holdedFetch: HoldedFetch;
  now: () => Date;
}) {
  const externalReadAdapter = createHoldedReadAdapter({
    apiKey: options.secrets.HOLDED_API_KEY,
    baseUrl: options.config.runtime_options.holded_base_url ?? undefined,
    fetch: options.holdedFetch,
    now: options.now,
    installation: buildHoldedInstallation(options.config)
  });
  const workflowRuntime = new InMemoryGovernedWorkflowRuntime({
    now: options.now,
    resolveOrganizationContext: buildOrganizationResolver(options.config, options.now),
    resolveIdentityContext: buildIdentityResolver(options.config, options.now),
    externalReadAdapter
  });
  workflowRuntime.registerCapability(
    createMockResourceReadCapability(externalReadAdapter, {}, options.config.organization.organization_id)
  );

  const orchestrator = createQwenOrchestrator({
    baseUrl: options.secrets.KERN_MODEL_BASE_URL,
    model: options.secrets.KERN_MODEL_NAME,
    apiKey: options.secrets.KERN_MODEL_API_KEY,
    toolCatalog: buildQwenToolCatalog(),
    chatCompletionsTransport: options.qwenTransport,
    now: options.now,
    temperature: options.config.runtime_options.qwen_temperature,
    requestTimeoutMs: options.config.runtime_options.qwen_request_timeout_ms
  });

  const orchestrationBoundary = new InMemoryOrchestrationBoundary({
    now: options.now,
    workflowRuntime,
    orchestrator,
    installationCapabilities: {
      [options.config.installation_id]: [...options.config.active_capabilities]
    }
  });

  return { workflowRuntime, orchestrationBoundary, orchestrator };
}

export function startInstallationRuntime(input: {
  rawConfig: unknown;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  telegramTransport?: TelegramTransport | null;
  qwenTransport?: QwenChatCompletionsTransport | null;
  holdedFetch?: HoldedFetch | null;
}): RuntimeStartResult {
  const now = input.now ?? (() => new Date());
  const evidenceLedger = new InMemoryEvidenceLedger();
  const bootstrapCorrelationId = 'runtime-bootstrap';

  createRuntimeEvidence(evidenceLedger, now, {
    organization_id: 'unknown',
    correlation_id: bootstrapCorrelationId,
    record_type: 'installation_config_loaded',
    subject: 'runtime',
    data: {
      source: 'runtime bootstrap',
      has_raw_config: Boolean(input.rawConfig)
    }
  });

  let loaded: LoadedRuntimeConfig;
  try {
    loaded = loadInstallationConfig(input.rawConfig, input.env);
  } catch (error) {
    const reason = error instanceof RuntimeConfigError ? error.message : 'installation config invalid';
    createRuntimeEvidence(evidenceLedger, now, {
      organization_id: 'unknown',
      correlation_id: bootstrapCorrelationId,
      record_type: 'installation_start_blocked',
      subject: 'runtime',
      data: {
        reason,
        field: error instanceof RuntimeConfigError ? error.field : 'root'
      }
    });
    return {
      status: 'blocked',
      reason,
      evidenceLedger,
      moduleRegistry: buildRuntimeModuleRegistry(createSampleInstallationConfig()),
      runtime: null
    };
  }

  const moduleRegistry = buildRuntimeModuleRegistry(loaded.config);
  createRuntimeEvidence(evidenceLedger, now, {
    organization_id: loaded.config.organization.organization_id,
    correlation_id: bootstrapCorrelationId,
    record_type: 'installation_config_validated',
    subject: loaded.config.installation_id,
    data: {
      organization_id: loaded.config.organization.organization_id,
      module_count: loaded.config.active_modules.length,
      principal_count: loaded.config.principals.length,
      identity_mapping_count: loaded.config.identity_mappings.length
    }
  });

  for (const moduleKey of SUPPORTED_MODULES) {
    createRuntimeEvidence(evidenceLedger, now, {
      organization_id: loaded.config.organization.organization_id,
      correlation_id: bootstrapCorrelationId,
      record_type: 'module_registered',
      subject: moduleKey,
      data: {
        module_key: moduleKey
      }
    });
  }

  for (const moduleKey of loaded.config.active_modules) {
    createRuntimeEvidence(evidenceLedger, now, {
      organization_id: loaded.config.organization.organization_id,
      correlation_id: bootstrapCorrelationId,
      record_type: 'module_activated',
      subject: moduleKey,
      data: {
        module_key: moduleKey
      }
    });
  }

  const missingModules = REQUIRED_MODULES.filter((moduleKey) => !loaded.config.active_modules.includes(moduleKey));
  if (missingModules.length > 0) {
    for (const moduleKey of missingModules) {
      createRuntimeEvidence(evidenceLedger, now, {
        organization_id: loaded.config.organization.organization_id,
        correlation_id: bootstrapCorrelationId,
        record_type: 'module_missing',
        subject: moduleKey,
        data: {
          module_key: moduleKey
        }
      });
    }
    createRuntimeEvidence(evidenceLedger, now, {
      organization_id: loaded.config.organization.organization_id,
      correlation_id: bootstrapCorrelationId,
      record_type: 'installation_start_blocked',
      subject: loaded.config.installation_id,
      data: {
        reason: 'required modules missing',
        missing_modules: missingModules
      }
    });
    return {
      status: 'blocked',
      reason: 'required modules missing',
      evidenceLedger,
      moduleRegistry,
      runtime: null
    };
  }

  let secrets: ResolvedRuntimeSecrets;
  try {
    secrets = loaded.secrets;
  } catch (error) {
    const reason = error instanceof RuntimeConfigError ? error.message : 'secret resolution failed';
    const field = error instanceof RuntimeConfigError ? error.field : 'secret_refs';
    createRuntimeEvidence(evidenceLedger, now, {
      organization_id: loaded.config.organization.organization_id,
      correlation_id: bootstrapCorrelationId,
      record_type: 'secret_missing',
      subject: field,
      data: {
        reason,
        secret_ref: field
      }
    });
    createRuntimeEvidence(evidenceLedger, now, {
      organization_id: loaded.config.organization.organization_id,
      correlation_id: bootstrapCorrelationId,
      record_type: 'installation_start_blocked',
      subject: loaded.config.installation_id,
      data: {
        reason,
        secret_ref: field
      }
    });
    return {
      status: 'blocked',
      reason,
      evidenceLedger,
      moduleRegistry,
      runtime: null
    };
  }

  const telegramTransport =
    input.telegramTransport ??
    createNodeFetchTelegramTransport({
      baseUrl: 'https://api.telegram.org',
      botToken: secrets.KERN_TELEGRAM_BOT_TOKEN,
      timeoutMs: loaded.config.runtime_options.telegram_poll_timeout_ms
    });
  const qwenTransport =
    input.qwenTransport ??
    createQwenNodeFetchTransport({
      baseUrl: secrets.KERN_MODEL_BASE_URL,
      apiKey: secrets.KERN_MODEL_API_KEY,
      timeoutMs: loaded.config.runtime_options.qwen_request_timeout_ms
    });
  const holdedFetch =
    input.holdedFetch ??
    createNodeFetchHoldedTransport({
      baseUrl: loaded.config.runtime_options.holded_base_url ?? 'https://api.holded.com',
      apiKey: secrets.HOLDED_API_KEY,
      timeoutMs: loaded.config.runtime_options.qwen_request_timeout_ms
    });
  const nowFn = now;
  const { workflowRuntime, orchestrationBoundary } = buildOrchestrationBoundary({
    config: loaded.config,
    secrets,
    qwenTransport,
    holdedFetch,
    now: nowFn
  });
  const telegramAdapter = createTelegramChannelAdapter({
    installation: buildTelegramInstallationConfig(loaded.config, secrets),
    orchestrationBoundary,
    transport: telegramTransport,
    now: nowFn,
    mode: loaded.config.runtime_options.telegram_mode
  });

  createRuntimeEvidence(evidenceLedger, nowFn, {
    organization_id: loaded.config.organization.organization_id,
    correlation_id: bootstrapCorrelationId,
    record_type: 'runtime_started',
    subject: loaded.config.installation_id,
    data: {
      installation_id: loaded.config.installation_id,
      organization_id: loaded.config.organization.organization_id,
      active_modules: loaded.config.active_modules,
      telegram_mode: loaded.config.runtime_options.telegram_mode
    }
  });

  const runtime = new InstallationRuntimeSliceImpl({
    config: loaded.config,
    secrets,
    evidenceLedger,
    moduleRegistry,
    workflowRuntime,
    orchestrationBoundary,
    telegramAdapter,
    telegramTransport,
    now: nowFn
  });

  return {
    status: 'started',
    reason: null,
    evidenceLedger,
    moduleRegistry,
    runtime
  };
}

class InstallationRuntimeSliceImpl implements InstallationRuntimeSlice {
  readonly config: RuntimeInstallationConfig;
  readonly secrets: ResolvedRuntimeSecrets;
  readonly evidenceLedger: InMemoryEvidenceLedger;
  readonly moduleRegistry: RuntimeModuleRegistry;
  readonly workflowRuntime: InMemoryGovernedWorkflowRuntime;
  readonly orchestrationBoundary: InMemoryOrchestrationBoundary;
  readonly telegramAdapter: ReturnType<typeof createTelegramChannelAdapter>;
  private readonly telegramTransport: TelegramTransport;
  private readonly now: () => Date;
  private lastOffset: number | null = null;

  constructor(input: {
    config: RuntimeInstallationConfig;
    secrets: ResolvedRuntimeSecrets;
    evidenceLedger: InMemoryEvidenceLedger;
    moduleRegistry: RuntimeModuleRegistry;
    workflowRuntime: InMemoryGovernedWorkflowRuntime;
    orchestrationBoundary: InMemoryOrchestrationBoundary;
    telegramAdapter: ReturnType<typeof createTelegramChannelAdapter>;
    telegramTransport: TelegramTransport;
    now: () => Date;
  }) {
    this.config = input.config;
    this.secrets = input.secrets;
    this.evidenceLedger = input.evidenceLedger;
    this.moduleRegistry = input.moduleRegistry;
    this.workflowRuntime = input.workflowRuntime;
    this.orchestrationBoundary = input.orchestrationBoundary;
    this.telegramAdapter = input.telegramAdapter;
    this.telegramTransport = input.telegramTransport;
    this.now = input.now;
  }

  pollOnce(limit: number | null = null): ChannelMessageResult[] {
    const updates = this.telegramTransport.getUpdates({
      offset: this.lastOffset,
      limit: limit ?? this.config.runtime_options.telegram_poll_limit
    });
    const results: ChannelMessageResult[] = [];
    for (const update of updates) {
      const clonedUpdate = cloneTelegramUpdate(update);
      const correlation_id = `runtime:${this.config.installation_id}:${clonedUpdate.update_id}`;
      createRuntimeEvidence(this.evidenceLedger, this.now, {
        organization_id: this.config.organization.organization_id,
        correlation_id,
        record_type: 'runtime_message_received',
        subject: String(clonedUpdate.update_id),
        data: {
          update_id: clonedUpdate.update_id,
          channel: 'telegram',
          installation_id: this.config.installation_id
        }
      });
      try {
        const result = this.telegramAdapter.handleTelegramUpdate(clonedUpdate);
        createRuntimeEvidence(this.evidenceLedger, this.now, {
          organization_id: this.config.organization.organization_id,
          correlation_id,
          record_type: 'runtime_message_processed',
          subject: String(clonedUpdate.update_id),
          data: {
            status: result.status,
            reason: result.reason,
            channel_status: result.status
          }
        });
        results.push(result);
      } catch (error) {
        createRuntimeEvidence(this.evidenceLedger, this.now, {
          organization_id: this.config.organization.organization_id,
          correlation_id,
          record_type: 'runtime_message_failed',
          subject: String(clonedUpdate.update_id),
          data: {
            error: error instanceof Error ? error.message : 'runtime processing failed'
          }
        });
        throw error;
      } finally {
        if (typeof clonedUpdate.update_id === 'number') {
          this.lastOffset = clonedUpdate.update_id + 1;
        }
      }
    }
    return results;
  }

  runLoop(options: { maxIterations?: number; limit?: number } = {}): ChannelMessageResult[][] {
    const maxIterations = options.maxIterations ?? this.config.runtime_options.polling_iterations;
    const limit = options.limit ?? this.config.runtime_options.telegram_poll_limit;
    const batches: ChannelMessageResult[][] = [];
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const batch = this.pollOnce(limit);
      if (batch.length === 0) {
        break;
      }
      batches.push(batch);
    }
    return batches;
  }
}
