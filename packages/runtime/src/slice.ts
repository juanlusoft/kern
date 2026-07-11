import {
  createEvidenceRecord,
  type ChannelMessageResult,
  type GovernedWorkflowKind,
  type PresenceReadPort,
  type NumaHrReadPort,
  type OrchestrationRequest,
  type TelegramChannelUpdate,
  type TelegramOutboundMessage
} from '../../contracts/src/index';
import { InMemoryEvidenceLedger } from '../../evidence/src/index';
import { InMemoryGovernedWorkflowRuntime } from '../../workflows/src/index';
import { InMemoryOrchestrationBoundary } from '../../orchestration/src/index';
import { createTelegramChannelAdapter, type TelegramTransport } from '../../channels/telegram/src/index';
import { createOpenWebUIChannelServer, type OpenWebUIChannelServerHandle } from '../../channels/openwebui/src/index';
import { createQwenOrchestrator, type QwenChatCompletionsTransport } from '../../orchestrators/qwen/src/index';
import { createMockResourceReadCapability } from '../../capabilities/src/index';
import { createPricingQuoteLineCapability, createPricingQuoteDraftCapability } from '../../workflows/src/index';
import { createHoldedReadAdapter, type HoldedFetch } from '../../adapters/holded/src/index';
import { createPacoPrintCatalogAdapter } from '../../adapters/pacoprint-catalog/src/index';
import { createPgConnectionConfigFromEnv, createPgReadAdapter, createPgSyncQueryRunner, type PgPresenceQueryRunner } from '../../adapters/numa-postgres/src/index';
import { resolveNumaCompanyId } from '../../adapters/numa-postgres/src/company-scope';
import {
  createNodeFetchHoldedTransport,
  createNodeFetchPacoPrintTransport,
  createNodeFetchTelegramTransport,
  createQwenNodeFetchTransport
} from './transports';
import { createConversationMemoryStore } from './conversation-memory';
import { type PacoPrintFetch } from '../../adapters/pacoprint-catalog/src/index';
import type { QwenToolDefinition } from '../../orchestrators/qwen/src/index';
import {
  createSampleInstallationConfig,
  loadInstallationConfig,
  type LoadedRuntimeConfig,
  type ResolvedRuntimeSecrets,
  type RuntimeInstallationConfig,
  type RuntimeModuleKey,
  type RuntimeNumaHrConfig,
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

const SUPPORTED_MODULES: RuntimeModuleKey[] = [
  'telegram-channel',
  'qwen-orchestrator',
  'holded-read',
  'pacoprint-catalog',
  'numa-postgres-read',
  'openwebui-channel'
];

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
  pacoPrintFetch?: PacoPrintFetch | null;
  presenceReadPort?: PresenceReadPort | null;
  hrReadPort?: NumaHrReadPort | null;
  numaPostgresQueryRunner?: PgPresenceQueryRunner | null;
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
  readonly telegramAdapter: ReturnType<typeof createTelegramChannelAdapter> | null;
  readonly openwebuiServer: OpenWebUIChannelServerHandle | null;
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

function resolveEvidenceLedgerFilePath(rawConfig: unknown, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return normalizeOptionalString(env.KERN_EVIDENCE_FILE_PATH ?? null);
  }
  const candidate = (rawConfig as { runtime_options?: { evidence_ledger_file_path?: unknown } }).runtime_options?.evidence_ledger_file_path;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return normalizeOptionalString(env.KERN_EVIDENCE_FILE_PATH ?? null);
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
    let display_name = 'Open WebUI channel server';
    if (moduleKey === 'telegram-channel') {
      display_name = 'Telegram channel adapter';
    } else if (moduleKey === 'qwen-orchestrator') {
      display_name = 'Qwen orchestrator';
    } else if (moduleKey === 'holded-read') {
      display_name = 'Holded read adapter';
    } else if (moduleKey === 'pacoprint-catalog') {
      display_name = 'PacoPrint catalog adapter';
    } else if (moduleKey === 'numa-postgres-read') {
      display_name = 'Numa PostgreSQL read runner';
    }
    registry.register({
      module_key: moduleKey,
      display_name
    });
  }
  return registry;
}

function buildQwenToolCatalog() {
  const pricingTool: QwenToolDefinition = {
    capability_key: 'pricing.quote_line',
    description:
      'Price ONE PacoPrint line: a SINGLE product with its measures/options/quantity. Use ONLY when the user asks for one item. If the user lists SEVERAL products or asks for a "presupuesto"/quote with multiple lines, do NOT call this once per item — call pricing.quote_draft ONCE with every line instead. Never invent article ids or prices.',
    parameters_schema: {
      type: 'object' as const,
      required: ['article'],
      additionalProperties: false as const,
      properties: {
        article: {
          type: 'string' as const,
          description:
            'The full product name or descriptive phrase exactly as the user wrote it, keeping every qualifier (e.g. "lona frontlit", "vinilo monomérico", "lona mesh", "roll up"). Never shorten it to a bare category like "lona" or "vinilo" — the extra words disambiguate the catalogue article.'
        },
        unidades: {
          type: 'integer' as const,
          description: 'Number of units if the user provided it.',
          minimum: 1,
          maximum: 100000
        },
        alto: {
          type: 'number' as const,
          description: 'Height (alto) in centimeters if the user provided it. Convert metres to centimetres (2 m => 200).'
        },
        ancho: {
          type: 'number' as const,
          description: 'Width (ancho) in centimeters if the user provided it. Convert metres to centimetres (1 m => 100).'
        },
        options: {
          type: 'object' as const,
          description:
            'Attribute choices the user explicitly named, as a FLAT object mapping the attribute name (lowercase, e.g. "corte", "acabado", "ollado", "refuerzo") to the chosen value as the label the user said (e.g. {"corte": "escuadrado"}). Put the choice in the VALUE, never in the key, and never use boolean true/false. Omit any attribute the user did not mention; do not invent options.'
        }
      }
    }
  };
  const pricingDraftTool: QwenToolDefinition = {
    capability_key: 'pricing.quote_draft',
    description:
      'Build a MULTI-LINE PacoPrint price draft (presupuesto). Call this ONCE with ALL the lines whenever the user asks for a quote with more than one product, or uses the word "presupuesto". One entry in `lines` per distinct product+measures+quantity. Do NOT call pricing.quote_line several times for this — use a single pricing.quote_draft. Never invent prices or article ids; the runtime prices each line with the PacoPrint API.',
    parameters_schema: {
      type: 'object' as const,
      required: ['lines'],
      additionalProperties: false as const,
      properties: {
        lines: {
          type: 'array' as const,
          minItems: 1,
          description: 'One entry per product line requested by the user.',
          items: {
            type: 'object' as const,
            required: ['text', 'article'],
            additionalProperties: false as const,
            properties: {
              text: {
                type: 'string' as const,
                description:
                  'The exact words of the user describing THIS line (product, measures, options, quantity) so the runtime can parse it deterministically.'
              },
              article: {
                type: 'string' as const,
                description:
                  'Full product name for this line with every qualifier (e.g. "lona frontlit"); never a bare category like "lona".'
              },
              unidades: { type: 'integer' as const, description: 'Units for this line if provided.', minimum: 1, maximum: 100000 },
              alto: { type: 'number' as const, description: 'Height in centimeters (convert metres to cm).' },
              ancho: { type: 'number' as const, description: 'Width in centimeters (convert metres to cm).' },
              options: {
                type: 'object' as const,
                description:
                  'Attribute choices for this line as {attribute_name: value} (e.g. {"corte": "escuadrado"}); choice in the value, never booleans.'
              }
            }
          }
        },
        customer: { type: 'string' as const, description: 'Customer/client the quote is for, if the user named one.' }
      }
    }
  };
  const readTool: QwenToolDefinition = {
    capability_key: 'mock.resource.read',
    description:
      'Read governed estimates or invoices from the runtime by customer, exact document id, or year. For latest estimate or invoice of a named customer, always provide customer_id with the customer name from the user request. For latest N estimates or invoices of a customer, provide customer_id together with a positive integer limit. Use limit only with customer_id. For invoice payment-status lists, use resource_type="invoice" with payment_status="pending", "paid", or "overdue". For year-based document lists, provide year as a four-digit string like "2025" and do not compute date ranges or timestamps. If the request is incomplete or unsupported, prefer request_clarification rather than inventing params. Do not invent estimate_id or invoice_id. Only provide estimate_id or invoice_id if the user explicitly gave an exact estimate or document id.',
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
        { required: ['year'] },
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
        limit: {
          type: 'integer' as const,
          description: 'Number of latest documents to return when the user asks for the latest N documents of a customer.',
          minimum: 1,
          maximum: 20
        },
        payment_status: {
          type: 'string' as const,
          enum: ['pending', 'paid', 'overdue'],
          description: 'Use only with resource_type="invoice" to list invoices by payment state.'
        },
        year: {
          type: 'string' as const,
          description: 'Four-digit year from the user request. Use it for year-based document lists and let the runtime convert it to a UTC start/end range.',
          pattern: '^\\d{4}$'
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
  };
  const numaHrTools: QwenToolDefinition[] = [
    {
      capability_key: 'punch.day',
      description:
        'Read one employee punch timeline for a specific day. Use employee_name and date only. Never emit employee_id or any internal ids.',
      parameters_schema: {
        type: 'object' as const,
        required: ['employee_name', 'date'],
        additionalProperties: false as const,
        properties: {
          employee_name: {
            type: 'string' as const,
            description: 'Employee full name exactly as written by the user. Never use employee_id.'
          },
          date: {
            type: 'string' as const,
            description: 'Target day in YYYY-MM-DD format.',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          }
        }
      }
    },
    {
      capability_key: 'leave.days',
      description:
        'Read approved and pending leave days for a specific employee and year. Use employee_name, year and time_type_labels only. Never emit time type ids.',
      parameters_schema: {
        type: 'object' as const,
        required: ['employee_name', 'year', 'time_type_labels'],
        additionalProperties: false as const,
        properties: {
          employee_name: {
            type: 'string' as const,
            description: 'Employee full name exactly as written by the user. Never use employee_id.'
          },
          year: {
            type: 'string' as const,
            description: 'Four-digit year from the user request.',
            pattern: '^\\d{4}$'
          },
          time_type_labels: {
            type: 'array' as const,
            minItems: 1,
            items: { type: 'string' as const },
            description: 'Business labels like vacaciones or asuntos propios. Never use internal ids.'
          }
        }
      }
    },
    {
      capability_key: 'leave.balance',
      description:
        'Read annual leave balance for a specific employee and year. Use employee_name, year and time_type_labels only. The runtime injects quotas from config.',
      parameters_schema: {
        type: 'object' as const,
        required: ['employee_name', 'year', 'time_type_labels'],
        additionalProperties: false as const,
        properties: {
          employee_name: {
            type: 'string' as const,
            description: 'Employee full name exactly as written by the user. Never use employee_id.'
          },
          year: {
            type: 'string' as const,
            description: 'Four-digit year from the user request.',
            pattern: '^\\d{4}$'
          },
          time_type_labels: {
            type: 'array' as const,
            minItems: 1,
            items: { type: 'string' as const },
            description: 'Business labels like vacaciones or asuntos propios. Never use internal ids.'
          }
        }
      }
    },
    {
      capability_key: 'leave.detail',
      description:
        'Read detailed leave or absence records for one employee in a date range. Use employee_name, date_from, date_to and time_type_labels only. Never emit employee_id or time type ids.',
      parameters_schema: {
        type: 'object' as const,
        required: ['employee_name', 'date_from', 'date_to', 'time_type_labels'],
        additionalProperties: false as const,
        properties: {
          employee_name: {
            type: 'string' as const,
            description: 'Employee full name exactly as written by the user. Never use employee_id.'
          },
          date_from: {
            type: 'string' as const,
            description: 'Start date in YYYY-MM-DD format.',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          date_to: {
            type: 'string' as const,
            description: 'End date in YYYY-MM-DD format.',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          time_type_labels: {
            type: 'array' as const,
            minItems: 1,
            items: { type: 'string' as const },
            description: 'Business labels like vacaciones or asuntos propios. Never use internal ids.'
          }
        }
      }
    },
    {
      capability_key: 'worktime.summary',
      description:
        'Summarize worked time for one employee in a date range. Use employee_name, date_from and date_to only. The runtime computes the rest.',
      parameters_schema: {
        type: 'object' as const,
        required: ['employee_name', 'date_from', 'date_to'],
        additionalProperties: false as const,
        properties: {
          employee_name: {
            type: 'string' as const,
            description: 'Employee full name exactly as written by the user. Never use employee_id.'
          },
          date_from: {
            type: 'string' as const,
            description: 'Start date in YYYY-MM-DD format.',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          date_to: {
            type: 'string' as const,
            description: 'End date in YYYY-MM-DD format.',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          }
        }
      }
    },
    {
      capability_key: 'report.month-by-group',
      description:
        'Monthly HR summary for a group or center. Use group_name, year and month only. The runtime applies paging and scope.',
      parameters_schema: {
        type: 'object' as const,
        required: ['group_name', 'year', 'month'],
        additionalProperties: false as const,
        properties: {
          group_name: {
            type: 'string' as const,
            description: 'Group or center name exactly as written by the user. Never use group_id.'
          },
          year: {
            type: 'string' as const,
            description: 'Four-digit year from the user request.',
            pattern: '^\\d{4}$'
          },
          month: {
            type: 'integer' as const,
            description: 'Month number from 1 to 12.',
            minimum: 1,
            maximum: 12
          }
        }
      }
    }
  ];
  const clarificationTool: QwenToolDefinition = {
    capability_key: 'request_clarification',
    description: 'Ask the user to clarify missing or unsupported details without inventing parameters.',
    parameters_schema: {
      type: 'object' as const,
      required: ['missing', 'reason'],
      additionalProperties: false as const,
      properties: {
        missing: {
          type: 'string' as const,
          enum: ['customer', 'document_id', 'ambiguous', 'unsupported', 'pricing'],
          description: 'What information is missing or unsupported.'
        },
        reason: {
          type: 'string' as const,
          description: 'Short human-readable explanation to share with the user.'
        }
      }
    }
  };
  return [pricingTool, pricingDraftTool, readTool, ...numaHrTools, clarificationTool];
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

function buildNumaPostgresReadAdapter(options: {
  env: NodeJS.ProcessEnv;
  now: () => Date;
  queryRunner?: PgPresenceQueryRunner | null;
  organization_id: string;
  numaHrConfig?: RuntimeNumaHrConfig | null;
}) {
  const connection = createPgConnectionConfigFromEnv(options.env);
  const companyIdByOrganizationId = options.numaHrConfig?.company_id_by_organization_id ?? {};
  resolveNumaCompanyId(options.organization_id, companyIdByOrganizationId);
  const queryRunner = options.queryRunner ?? createPgSyncQueryRunner({ connection });
  return createPgReadAdapter({
    queryRunner,
    connection,
    now: options.now,
    statement_timeout_ms: connection.statement_timeout_ms,
    company_id_by_organization_id: companyIdByOrganizationId
  });
}

function buildOpenWebUIInstallationConfig(config: RuntimeInstallationConfig) {
  const openwebui = config.runtime_options.openwebui_channel;
  if (!openwebui) {
    throw new Error('openwebui_channel config missing');
  }
  return {
    channel: 'openwebui' as const,
    installation_id: config.installation_id,
    active: true,
    host: openwebui.host,
    port: openwebui.port,
    request_body_limit_bytes: openwebui.request_body_limit_bytes,
    identity: openwebui.identity,
    identity_mappings: Object.entries(openwebui.users).map(([openwebui_user_id, mapping]) => ({
      openwebui_user_id,
      organization_id: mapping.organization_id,
      principal_id: mapping.principal_id,
      active: mapping.active,
      display_name: mapping.display_name ?? null
    }))
  };
}

function buildOrchestrationBoundary(options: {
  config: RuntimeInstallationConfig;
  secrets: ResolvedRuntimeSecrets;
  qwenTransport: QwenChatCompletionsTransport | null;
  holdedFetch: HoldedFetch | null;
  pacoPrintFetch: PacoPrintFetch | null;
  presenceReadPort?: PresenceReadPort | null;
  numaHrConfig?: RuntimeNumaHrConfig | null;
  hrReadPort?: NumaHrReadPort | null;
  numaPostgresQueryRunner?: PgPresenceQueryRunner | null;
  now: () => Date;
}) {
  const externalReadAdapter = options.config.active_modules.includes('holded-read')
    ? createHoldedReadAdapter({
        apiKey: options.secrets.HOLDED_API_KEY,
        baseUrl: options.config.runtime_options.holded_base_url ?? undefined,
        fetch: options.holdedFetch as HoldedFetch,
        now: options.now,
        installation: buildHoldedInstallation(options.config)
      })
    : undefined;
  const pacoPrintCatalogAdapter = options.config.active_modules.includes('pacoprint-catalog')
    ? createPacoPrintCatalogAdapter({
        apiToken: options.secrets.PACOPRINT_API_TOKEN,
        baseUrl: 'https://pacoprint.com/api/v1',
        fetch: options.pacoPrintFetch as PacoPrintFetch,
        now: options.now,
        organization_id: options.config.organization.organization_id
      })
    : null;
  const workflowRuntime = new InMemoryGovernedWorkflowRuntime({
    now: options.now,
    resolveOrganizationContext: buildOrganizationResolver(options.config, options.now),
    resolveIdentityContext: buildIdentityResolver(options.config, options.now),
    externalReadAdapter,
    pacoPrintCatalogAdapter,
    presenceReadPort: options.presenceReadPort ?? null,
    hrReadPort: options.hrReadPort ?? null,
    organization_id: options.config.organization.organization_id
  });
  if (externalReadAdapter && options.config.active_capabilities.includes('mock.resource.read')) {
    workflowRuntime.registerCapability(
      createMockResourceReadCapability(externalReadAdapter, {}, options.config.organization.organization_id)
    );
  }
  if (pacoPrintCatalogAdapter && options.config.active_capabilities.includes('pricing.quote_line')) {
    workflowRuntime.registerCapability(
      createPricingQuoteLineCapability(pacoPrintCatalogAdapter, {}, options.config.organization.organization_id)
    );
  }
  if (options.config.active_modules.includes('pacoprint-catalog') && options.config.active_capabilities.includes('pricing.quote_draft')) {
    workflowRuntime.registerCapability(createPricingQuoteDraftCapability({}, options.config.organization.organization_id));
  }

  const orchestrator = options.config.active_modules.includes('qwen-orchestrator')
    ? createQwenOrchestrator({
        baseUrl: options.secrets.KERN_MODEL_BASE_URL as string,
        model: options.secrets.KERN_MODEL_NAME as string,
        apiKey: options.secrets.KERN_MODEL_API_KEY,
        toolCatalog: buildQwenToolCatalog(),
        chatCompletionsTransport: options.qwenTransport ?? undefined,
        now: options.now,
        temperature: options.config.runtime_options.qwen_temperature,
        requestTimeoutMs: options.config.runtime_options.qwen_request_timeout_ms
      })
    : null;

  const orchestrationBoundary = new InMemoryOrchestrationBoundary({
    now: options.now,
    workflowRuntime,
    orchestrator,
    numaHrConfig: options.numaHrConfig ?? null,
    installationCapabilities: {
      [options.config.installation_id]: [
        ...options.config.active_capabilities,
        ...(options.presenceReadPort ? ['employee.find', 'punches.list', 'presence.current'] : []),
        ...(options.hrReadPort ? ['punch.day', 'leave.days', 'leave.balance', 'leave.detail', 'worktime.summary', 'report.month-by-group'] : [])
      ]
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
  pacoPrintFetch?: PacoPrintFetch | null;
  presenceReadPort?: PresenceReadPort | null;
  hrReadPort?: NumaHrReadPort | null;
  numaPostgresQueryRunner?: PgPresenceQueryRunner | null;
}): RuntimeStartResult {
  const now = input.now ?? (() => new Date());
  const evidenceLedger = new InMemoryEvidenceLedger({
    filePath: resolveEvidenceLedgerFilePath(input.rawConfig, input.env ?? process.env)
  });
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

  const telegramTransport = loaded.config.active_modules.includes('telegram-channel')
    ? input.telegramTransport ??
      createNodeFetchTelegramTransport({
        baseUrl: 'https://api.telegram.org',
        botToken: secrets.KERN_TELEGRAM_BOT_TOKEN as string,
        timeoutMs: loaded.config.runtime_options.telegram_poll_timeout_ms
      })
    : null;
  const qwenTransport = loaded.config.active_modules.includes('qwen-orchestrator')
    ? input.qwenTransport ??
      createQwenNodeFetchTransport({
        baseUrl: secrets.KERN_MODEL_BASE_URL as string,
        apiKey: secrets.KERN_MODEL_API_KEY,
        timeoutMs: loaded.config.runtime_options.qwen_request_timeout_ms
      })
    : null;
  const holdedFetch = loaded.config.active_modules.includes('holded-read')
    ? input.holdedFetch ??
      createNodeFetchHoldedTransport({
        baseUrl: loaded.config.runtime_options.holded_base_url ?? 'https://api.holded.com',
        apiKey: secrets.HOLDED_API_KEY as string,
        timeoutMs: loaded.config.runtime_options.qwen_request_timeout_ms
      })
    : null;
  const nowFn = now;
  const pacoPrintFetch = loaded.config.active_modules.includes('pacoprint-catalog')
    ? input.pacoPrintFetch ??
      createNodeFetchPacoPrintTransport({
        baseUrl: 'https://pacoprint.com/api/v1',
        apiToken: secrets.PACOPRINT_API_TOKEN,
        timeoutMs: loaded.config.runtime_options.qwen_request_timeout_ms
      })
    : null;
  let presenceReadPort = input.presenceReadPort ?? null;
  let hrReadPort = input.hrReadPort ?? null;
  if (loaded.config.active_modules.includes('numa-postgres-read')) {
    try {
      const numaPostgresAdapter = buildNumaPostgresReadAdapter({
        env: input.env ?? process.env,
        now: nowFn,
        queryRunner: input.numaPostgresQueryRunner ?? null,
        organization_id: loaded.config.organization.organization_id,
        numaHrConfig: loaded.config.runtime_options.numa_hr
      });
      presenceReadPort = presenceReadPort ?? numaPostgresAdapter;
      hrReadPort = hrReadPort ?? numaPostgresAdapter;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'numa postgres read runner failed';
      createRuntimeEvidence(evidenceLedger, nowFn, {
        organization_id: loaded.config.organization.organization_id,
        correlation_id: bootstrapCorrelationId,
        record_type: 'installation_start_blocked',
        subject: loaded.config.installation_id,
        data: {
          reason,
          module_key: 'numa-postgres-read'
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
  }
  const { workflowRuntime, orchestrationBoundary } = buildOrchestrationBoundary({
    config: loaded.config,
    secrets,
    qwenTransport,
    holdedFetch,
    numaHrConfig: loaded.config.runtime_options.numa_hr,
    pacoPrintFetch,
    presenceReadPort,
    hrReadPort,
    now: nowFn
  });
  const conversationMemoryStore = createConversationMemoryStore({
    // El daemon corre un proceso NUEVO por cada sondeo, así que la memoria en RAM
    // se perdería entre mensajes: por defecto se respalda en disco (cwd) para que
    // el multi-turno funcione de fábrica. Se puede fijar otra ruta en el config.
    filePath:
      loaded.config.runtime_options.conversation_memory_file_path ?? `${process.cwd()}/conversation-memory.json`,
    now: nowFn
  });
  const telegramAdapter = loaded.config.active_modules.includes('telegram-channel')
    ? createTelegramChannelAdapter({
        installation: buildTelegramInstallationConfig(loaded.config, secrets),
        orchestrationBoundary,
        transport: telegramTransport as TelegramTransport,
        now: nowFn,
        mode: loaded.config.runtime_options.telegram_mode,
        conversationMemoryStore
      })
    : null;
  let openwebuiServer: OpenWebUIChannelServerHandle | null = null;
  if (loaded.config.active_modules.includes('openwebui-channel')) {
    try {
      const openwebuiInstallation = buildOpenWebUIInstallationConfig(loaded.config);
      openwebuiServer = createOpenWebUIChannelServer({
        installation: openwebuiInstallation,
        orchestrationBoundary,
        now: nowFn
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'openwebui channel failed';
      createRuntimeEvidence(evidenceLedger, nowFn, {
        organization_id: loaded.config.organization.organization_id,
        correlation_id: bootstrapCorrelationId,
        record_type: 'installation_start_blocked',
        subject: loaded.config.installation_id,
        data: {
          reason,
          module_key: 'openwebui-channel'
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
  }

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
    openwebuiServer,
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
  readonly telegramAdapter: ReturnType<typeof createTelegramChannelAdapter> | null;
  readonly openwebuiServer: OpenWebUIChannelServerHandle | null;
  private readonly telegramTransport: TelegramTransport | null;
  private readonly now: () => Date;
  private lastOffset: number | null = null;

  constructor(input: {
    config: RuntimeInstallationConfig;
    secrets: ResolvedRuntimeSecrets;
    evidenceLedger: InMemoryEvidenceLedger;
    moduleRegistry: RuntimeModuleRegistry;
    workflowRuntime: InMemoryGovernedWorkflowRuntime;
    orchestrationBoundary: InMemoryOrchestrationBoundary;
    telegramAdapter: ReturnType<typeof createTelegramChannelAdapter> | null;
    openwebuiServer: OpenWebUIChannelServerHandle | null;
    telegramTransport: TelegramTransport | null;
    now: () => Date;
  }) {
    this.config = input.config;
    this.secrets = input.secrets;
    this.evidenceLedger = input.evidenceLedger;
    this.moduleRegistry = input.moduleRegistry;
    this.workflowRuntime = input.workflowRuntime;
    this.orchestrationBoundary = input.orchestrationBoundary;
    this.telegramAdapter = input.telegramAdapter;
    this.openwebuiServer = input.openwebuiServer;
    this.telegramTransport = input.telegramTransport;
    this.now = input.now;
  }

  pollOnce(limit: number | null = null): ChannelMessageResult[] {
    if (!this.telegramTransport || !this.telegramAdapter) {
      return [];
    }
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
