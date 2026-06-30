import {
  createEvidenceRecord,
  type ChannelAdapter,
  type ChannelInstallationConfig,
  type ChannelMessageResult,
  type InboundMessage,
  type OrchestrationOutcome,
  type OrchestrationRequest,
  type TelegramChannelUpdate,
  type TelegramChannelUpdateMessage,
  type TelegramOutboundMessage
} from '../../../contracts/src/index';
import { InMemoryOrchestrationBoundary } from '../../../orchestration/src/index';

export interface TelegramTransportGetUpdatesOptions {
  offset?: number | null;
  limit?: number | null;
}

export interface TelegramTransport {
  getUpdates(options?: TelegramTransportGetUpdatesOptions): TelegramChannelUpdate[];
  sendMessage(message: TelegramOutboundMessage): TelegramOutboundMessage;
}

export interface TelegramChannelAdapterOptions {
  installation: ChannelInstallationConfig;
  orchestrationBoundary: InMemoryOrchestrationBoundary;
  transport: TelegramTransport;
  now?: () => Date;
  mode?: 'long_polling' | 'webhook';
}

function cloneUpdate(update: TelegramChannelUpdate): TelegramChannelUpdate {
  return {
    ...update,
    message: update.message ? cloneMessage(update.message) : null,
    raw: structuredClone(update.raw ?? null)
  };
}

function cloneMessage(message: TelegramChannelUpdateMessage): TelegramChannelUpdateMessage {
  return {
    ...message,
    from: message.from
      ? {
          ...message.from
        }
      : message.from ?? null,
    raw: structuredClone(message.raw ?? null)
  };
}

function cloneInboundMessage(message: InboundMessage): InboundMessage {
  return {
    ...message,
    raw: structuredClone(message.raw ?? null)
  };
}

function cloneOutboundMessage(message: TelegramOutboundMessage): TelegramOutboundMessage {
  return {
    ...message,
    data: message.data ? structuredClone(message.data) : null,
    source_evidence: message.source_evidence ? [...message.source_evidence] : null,
    raw: structuredClone(message.raw ?? null)
  };
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTelegramId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value.trim() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function messageText(message: TelegramChannelUpdateMessage): string | null {
  return normalizeOptionalString(message.text ?? null);
}

function buildCorrelationId(message: InboundMessage, installation_id: string): string {
  return `telegram:${installation_id}:${message.chat_id}:${message.message_id}`;
}

function buildInboundMessage(update: TelegramChannelUpdate, installation_id: string): InboundMessage | null {
  if (!update.message) {
    return null;
  }
  const text = messageText(update.message);
  const chatId = normalizeTelegramId(update.message.chat.id);
  const userId = normalizeTelegramId(update.message.from?.id ?? null);
  const messageId = normalizeTelegramId(update.message.message_id);
  if (!text || !chatId || !userId || !messageId) {
    return null;
  }
  return {
    channel: 'telegram',
    message_id: messageId,
    chat_id: chatId,
    user_id: userId,
    text,
    received_at: new Date((update.message.date ?? Date.now() / 1000) * 1000).toISOString(),
    raw: {
      installation_id,
      update: structuredClone(update)
    }
  };
}

function buildOrchestrationRequest(input: {
  message: InboundMessage;
  organization_id: string;
  principal_id: string;
  principal_type: 'human' | 'service' | 'agent' | null;
  installation_id: string;
}): OrchestrationRequest {
  return {
    request_id: `telegram:${input.installation_id}:${input.message.chat_id}:${input.message.message_id}`,
    user_message: input.message.text,
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    actor: {
      principal_id: input.principal_id,
      principal_type: input.principal_type ?? 'human',
      delegated_identity: null
    },
    correlation_id: buildCorrelationId(input.message, input.installation_id),
    installation_id: input.installation_id,
    context: {
      installation_id: input.installation_id,
      active_capabilities: [],
      metadata: {
        channel: 'telegram',
        chat_id: input.message.chat_id,
        user_id: input.message.user_id
      },
      force_capability_key: null,
      force_params: null
    }
  };
}

function buildOutboundText(outcome: OrchestrationOutcome): string {
  const headline = `runtime ${outcome.response.status}: ${outcome.response.message}`;
  if (!outcome.response.data) {
    return headline;
  }
  return `${headline}\n${JSON.stringify(outcome.response.data, null, 2)}`;
}

function buildOutboundMessage(input: {
  outcome: OrchestrationOutcome;
  inbound: InboundMessage;
  channel: 'telegram';
}): TelegramOutboundMessage {
  return {
    channel: input.channel,
    chat_id: input.inbound.chat_id,
    text: buildOutboundText(input.outcome),
    reply_to_message_id: input.inbound.message_id,
    correlation_id: input.outcome.correlation_id,
    update_id: null,
    parse_mode: 'Markdown',
    source_evidence: [...input.outcome.evidence_links],
    data: input.outcome.response.data ? structuredClone(input.outcome.response.data) : null,
    raw: {
      response_source: input.outcome.response.response_source,
      status: input.outcome.response.status,
      message: input.outcome.response.message
    }
  };
}

function appendChannelEvidence(
  boundary: InMemoryOrchestrationBoundary,
  now: () => Date,
  input: {
    correlation_id: string;
    organization_id: string | null;
    record_type:
      | 'channel_message_received'
      | 'channel_identity_resolved'
      | 'channel_identity_denied'
      | 'channel_message_denied'
      | 'channel_message_blocked'
      | 'channel_orchestration_requested'
      | 'channel_response_prepared'
      | 'channel_message_sent'
      | 'channel_message_send_error';
    subject: string;
    data: Record<string, unknown>;
  }
) {
  return boundary.getEvidenceLedger().append(
    createEvidenceRecord({
      organization_id: input.organization_id ?? 'unknown',
      correlation_id: input.correlation_id,
      record_type: input.record_type,
      subject: input.subject,
      data: input.data,
      created_at: now().toISOString()
    })
  );
}

function resolveIdentityMapping(
  installation: ChannelInstallationConfig,
  message: InboundMessage
): { organization_id: string; principal_id: string; principal_type: 'human' | 'service' | 'agent' | null } | null {
  const matches = installation.identity_mappings.filter(
    (mapping) =>
      mapping.active &&
      mapping.channel === 'telegram' &&
      mapping.installation_id === installation.installation_id &&
      mapping.telegram_chat_id === message.chat_id &&
      mapping.telegram_user_id === message.user_id
  );
  if (matches.length !== 1) {
    return null;
  }
  const mapping = matches[0];
  return {
    organization_id: mapping.organization_id,
    principal_id: mapping.principal_id,
    principal_type: mapping.principal_type ?? 'human'
  };
}

export class InMemoryTelegramTransport implements TelegramTransport {
  private readonly queuedUpdates: TelegramChannelUpdate[] = [];
  private readonly sentMessages: TelegramOutboundMessage[] = [];

  seedUpdates(updates: TelegramChannelUpdate[]): void {
    this.queuedUpdates.length = 0;
    this.queuedUpdates.push(...updates.map((update) => cloneUpdate(update)));
  }

  queueUpdate(update: TelegramChannelUpdate): void {
    this.queuedUpdates.push(cloneUpdate(update));
  }

  getUpdates(options: TelegramTransportGetUpdatesOptions = {}): TelegramChannelUpdate[] {
    const offset = options.offset ?? null;
    const limit = options.limit ?? null;
    const filtered = offset === null ? [...this.queuedUpdates] : this.queuedUpdates.filter((update) => update.update_id > offset);
    return (limit === null ? filtered : filtered.slice(0, limit)).map((update) => cloneUpdate(update));
  }

  sendMessage(message: TelegramOutboundMessage): TelegramOutboundMessage {
    const stored = cloneOutboundMessage(message);
    this.sentMessages.push(stored);
    return cloneOutboundMessage(stored);
  }

  listSentMessages(): TelegramOutboundMessage[] {
    return this.sentMessages.map((message) => cloneOutboundMessage(message));
  }
}

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;
  private readonly installation: ChannelInstallationConfig;
  private readonly orchestrationBoundary: InMemoryOrchestrationBoundary;
  private readonly transport: TelegramTransport;
  private readonly now: () => Date;
  private readonly mode: 'long_polling' | 'webhook';

  constructor(options: TelegramChannelAdapterOptions) {
    this.installation = {
      ...options.installation,
      identity_mappings: options.installation.identity_mappings.map((mapping) => ({ ...mapping }))
    };
    this.orchestrationBoundary = options.orchestrationBoundary;
    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
    this.mode = options.mode ?? 'long_polling';
  }

  pollUpdates(offset: number | null = null, limit: number | null = null): ChannelMessageResult[] {
    const updates = this.transport.getUpdates({ offset, limit });
    return updates.map((update) => this.handleTelegramUpdate(update));
  }

  handleTelegramUpdate(update: TelegramChannelUpdate): ChannelMessageResult {
    const message = buildInboundMessage(update, this.installation.installation_id);
    if (!message) {
      return this.finishBlocked({
        inbound_message: null,
        organization_id: null,
        principal_id: null,
        installation_id: this.installation.installation_id,
        correlation_id: `telegram:${this.installation.installation_id}:invalid:${update.update_id}`,
        reason: 'telegram update invalid or incomplete',
        record_type: 'channel_message_blocked',
        subject: `update:${update.update_id}`
      });
    }
    return this.handleInboundMessage(message, update.raw ?? update);
  }

  handleInboundMessage(message: InboundMessage, raw: unknown = null): ChannelMessageResult {
    return this.handleInboundMessageInternal(message, raw);
  }

  private handleInboundMessageInternal(message: InboundMessage, raw: unknown): ChannelMessageResult {
    const correlation_id = buildCorrelationId(message, this.installation.installation_id);
    const receivedEvidence = appendChannelEvidence(this.orchestrationBoundary, this.now, {
      correlation_id,
      organization_id: null,
      record_type: 'channel_message_received',
      subject: message.message_id,
      data: {
        channel: message.channel,
        message_id: message.message_id,
        chat_id: message.chat_id,
        user_id: message.user_id,
        received_at: message.received_at
      }
    });

    if (!this.installation.active || !normalizeOptionalString(this.installation.bot_token)) {
      const blocked = appendChannelEvidence(this.orchestrationBoundary, this.now, {
        correlation_id,
        organization_id: null,
        record_type: 'channel_message_blocked',
        subject: message.message_id,
        data: {
          reason: this.installation.active ? 'telegram bot token missing' : 'telegram installation inactive'
        }
      });
      return this.finishResult({
        status: 'blocked',
        reason: this.installation.active ? 'telegram bot token missing' : 'telegram installation inactive',
        inbound_message: message,
        organization_id: null,
        principal_id: null,
        installation_id: this.installation.installation_id,
        orchestration_outcome: null,
        outbound_message: null,
        evidence_links: [receivedEvidence.evidence_id, blocked.evidence_id]
      });
    }

    const identity = resolveIdentityMapping(this.installation, message);
    if (!identity) {
      const denied = appendChannelEvidence(this.orchestrationBoundary, this.now, {
        correlation_id,
        organization_id: null,
        record_type: 'channel_identity_denied',
        subject: message.user_id,
        data: {
          chat_id: message.chat_id,
          user_id: message.user_id,
          installation_id: this.installation.installation_id
        }
      });
      return this.finishResult({
        status: 'denied',
        reason: 'telegram identity not mapped or inactive',
        inbound_message: message,
        organization_id: null,
        principal_id: null,
        installation_id: this.installation.installation_id,
        orchestration_outcome: null,
        outbound_message: null,
        evidence_links: [receivedEvidence.evidence_id, denied.evidence_id]
      });
    }

    const identityResolved = appendChannelEvidence(this.orchestrationBoundary, this.now, {
      correlation_id,
      organization_id: identity.organization_id,
      record_type: 'channel_identity_resolved',
      subject: identity.principal_id,
      data: {
        chat_id: message.chat_id,
        user_id: message.user_id,
        organization_id: identity.organization_id,
        principal_id: identity.principal_id,
        installation_id: this.installation.installation_id,
        principal_type: identity.principal_type ?? 'human'
      }
    });

    const orchestrationRequested = appendChannelEvidence(this.orchestrationBoundary, this.now, {
      correlation_id,
      organization_id: identity.organization_id,
      record_type: 'channel_orchestration_requested',
      subject: message.message_id,
      data: {
        channel: message.channel,
        chat_id: message.chat_id,
        user_id: message.user_id,
        installation_id: this.installation.installation_id,
        text: message.text
      }
    });

    const orchestrationOutcome = this.orchestrationBoundary.execute(
      buildOrchestrationRequest({
        message,
        organization_id: identity.organization_id,
        principal_id: identity.principal_id,
        principal_type: identity.principal_type,
        installation_id: this.installation.installation_id
      })
    );

    const outbound = buildOutboundMessage({
      outcome: orchestrationOutcome,
      inbound: message,
      channel: 'telegram'
    });
    const responsePrepared = appendChannelEvidence(this.orchestrationBoundary, this.now, {
      correlation_id,
      organization_id: identity.organization_id,
      record_type: 'channel_response_prepared',
      subject: message.message_id,
      data: {
        response_source: orchestrationOutcome.response.response_source,
        status: orchestrationOutcome.response.status,
        message: orchestrationOutcome.response.message,
        has_data: Boolean(orchestrationOutcome.response.data)
      }
    });

    let sentMessage: TelegramOutboundMessage | null = null;
    try {
      sentMessage = this.transport.sendMessage(outbound);
    } catch (error) {
      const sendError = appendChannelEvidence(this.orchestrationBoundary, this.now, {
        correlation_id,
        organization_id: identity.organization_id,
        record_type: 'channel_message_send_error',
        subject: message.message_id,
        data: {
          error: error instanceof Error ? error.message : 'telegram transport failure',
          response_status: orchestrationOutcome.response.status
        }
      });
      return this.finishResult({
        status: 'error',
        reason: error instanceof Error ? error.message : 'telegram transport failure',
        inbound_message: message,
        organization_id: identity.organization_id,
        principal_id: identity.principal_id,
        installation_id: this.installation.installation_id,
        orchestration_outcome: orchestrationOutcome,
        outbound_message: outbound,
        evidence_links: [
          receivedEvidence.evidence_id,
          identityResolved.evidence_id,
          orchestrationRequested.evidence_id,
          ...orchestrationOutcome.evidence_links,
          responsePrepared.evidence_id,
          sendError.evidence_id
        ]
      });
    }

    const sent = appendChannelEvidence(this.orchestrationBoundary, this.now, {
      correlation_id,
      organization_id: identity.organization_id,
      record_type: 'channel_message_sent',
      subject: message.message_id,
      data: {
        chat_id: message.chat_id,
        user_id: message.user_id,
        sent_text: sentMessage.text,
        response_status: orchestrationOutcome.response.status
      }
    });

    return this.finishResult({
      status: 'sent',
      reason: orchestrationOutcome.reason,
      inbound_message: message,
      organization_id: identity.organization_id,
      principal_id: identity.principal_id,
      installation_id: this.installation.installation_id,
      orchestration_outcome: orchestrationOutcome,
      outbound_message: sentMessage,
      evidence_links: [
        receivedEvidence.evidence_id,
        identityResolved.evidence_id,
        orchestrationRequested.evidence_id,
        ...orchestrationOutcome.evidence_links,
        responsePrepared.evidence_id,
        sent.evidence_id
      ]
    });
  }

  private finishBlocked(input: {
    inbound_message: InboundMessage | null;
    organization_id: string | null;
    principal_id: string | null;
    installation_id: string | null;
    correlation_id: string;
    reason: string;
    record_type:
      | 'channel_message_blocked'
      | 'channel_identity_denied'
      | 'channel_message_denied';
    subject: string;
  }): ChannelMessageResult {
    const evidence = appendChannelEvidence(this.orchestrationBoundary, this.now, {
      correlation_id: input.correlation_id,
      organization_id: input.organization_id,
      record_type: input.record_type,
      subject: input.subject,
      data: {
        reason: input.reason,
        installation_id: input.installation_id
      }
    });
    return this.finishResult({
      status: input.record_type === 'channel_message_denied' || input.record_type === 'channel_identity_denied' ? 'denied' : 'blocked',
      reason: input.reason,
      inbound_message: input.inbound_message,
      organization_id: input.organization_id,
      principal_id: input.principal_id,
      installation_id: input.installation_id,
      correlation_id: input.correlation_id,
      orchestration_outcome: null,
      outbound_message: null,
      evidence_links: [evidence.evidence_id]
    });
  }

  private finishResult(input: {
    status: ChannelMessageResult['status'];
    reason: string;
    inbound_message: InboundMessage | null;
    organization_id: string | null;
    principal_id: string | null;
    installation_id: string | null;
    correlation_id?: string | null;
    orchestration_outcome: OrchestrationOutcome | null;
    outbound_message: TelegramOutboundMessage | null;
    evidence_links: string[];
  }): ChannelMessageResult {
    return {
      channel: 'telegram',
      status: input.status,
      reason: input.reason,
      correlation_id: input.correlation_id
        ? input.correlation_id
        : input.inbound_message
        ? buildCorrelationId(input.inbound_message, this.installation.installation_id)
        : input.orchestration_outcome?.correlation_id ?? `telegram:${this.installation.installation_id}:unknown`,
      inbound_message: input.inbound_message ? cloneInboundMessage(input.inbound_message) : null,
      outbound_message: input.outbound_message ? cloneOutboundMessage(input.outbound_message) : null,
      organization_id: input.organization_id,
      principal_id: input.principal_id,
      installation_id: input.installation_id,
      orchestration_outcome: input.orchestration_outcome
        ? {
            ...input.orchestration_outcome,
            proposal: input.orchestration_outcome.proposal
              ? {
                  ...input.orchestration_outcome.proposal,
                  params: structuredClone(input.orchestration_outcome.proposal.params)
                }
              : null,
            validation: input.orchestration_outcome.validation
              ? {
                  ...input.orchestration_outcome.validation,
                  params: input.orchestration_outcome.validation.params
                    ? structuredClone(input.orchestration_outcome.validation.params)
                    : null
                }
              : null,
            response: {
              ...input.orchestration_outcome.response,
              data: input.orchestration_outcome.response.data ? structuredClone(input.orchestration_outcome.response.data) : null
            },
            workflow_result: input.orchestration_outcome.workflow_result
              ? {
                  ...input.orchestration_outcome.workflow_result,
                  response: {
                    ...input.orchestration_outcome.workflow_result.response,
                    data: input.orchestration_outcome.workflow_result.response.data
                      ? structuredClone(input.orchestration_outcome.workflow_result.response.data)
                      : null
                  },
                  capability_result: input.orchestration_outcome.workflow_result.capability_result
                    ? {
                        ...input.orchestration_outcome.workflow_result.capability_result,
                        output: input.orchestration_outcome.workflow_result.capability_result.output
                          ? {
                              ...input.orchestration_outcome.workflow_result.capability_result.output,
                              result: structuredClone(input.orchestration_outcome.workflow_result.capability_result.output.result)
                            }
                          : null,
                        evidence_links: [...input.orchestration_outcome.workflow_result.capability_result.evidence_links]
                      }
                    : null,
                  evidence_links: [...input.orchestration_outcome.workflow_result.evidence_links],
                  steps: input.orchestration_outcome.workflow_result.steps.map((step) => ({
                    ...step,
                    details: structuredClone(step.details)
                  })),
                  evidence_trace: {
                    evidence_ids: [...input.orchestration_outcome.workflow_result.evidence_trace.evidence_ids],
                    record_types: [...input.orchestration_outcome.workflow_result.evidence_trace.record_types]
                  }
                }
              : null,
            evidence_links: [...input.orchestration_outcome.evidence_links]
          }
        : null,
      evidence_links: [...input.evidence_links]
    };
  }
}

export function createTelegramChannelAdapter(options: TelegramChannelAdapterOptions): TelegramChannelAdapter {
  return new TelegramChannelAdapter(options);
}
