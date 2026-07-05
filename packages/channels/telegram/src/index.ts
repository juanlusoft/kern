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
  type TelegramOutboundMessage,
  type ConversationHistoryTurn,
  type ConversationMemoryStore
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
  conversationMemoryStore?: ConversationMemoryStore | null;
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
  conversation_history?: ConversationHistoryTurn[] | null;
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
    conversation_history: input.conversation_history?.length
      ? input.conversation_history.map((turn) => ({ ...turn }))
      : null,
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

const TELEGRAM_SAFE_MESSAGE_LIMIT = 3900;
const TELEGRAM_TRUNCATION_SUFFIX = '… [respuesta resumida]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstStringFromKeys(input: Record<string, unknown> | null, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    const value = toTrimmedString(input[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function numberFromKeys(input: Record<string, unknown> | null, keys: string[]): number | null {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function formatCurrencyAmount(total: number | null, currency: string | null): string | null {
  if (total === null) return null;
  const formatted = total.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (!currency || currency.toUpperCase() === 'EUR') {
    return `${formatted} €`;
  }
  return `${formatted} ${currency.toUpperCase()}`;
}

function summarizeProductNames(input: Record<string, unknown> | null): string | null {
  if (!input) return null;
  const products = input.products;
  if (!Array.isArray(products) || products.length === 0) {
    const fallback = firstStringFromKeys(input, ['product', 'description', 'summary']);
    return fallback;
  }
  const names = products
    .map((product) => {
      if (typeof product === 'string') {
        return toTrimmedString(product);
      }
      if (isPlainObject(product)) {
        return (
          toTrimmedString(product.name) ??
          toTrimmedString(product.title) ??
          toTrimmedString(product.description) ??
          toTrimmedString(product.product_name)
        );
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
  if (names.length === 0) {
    return null;
  }
  return [...new Set(names)].join(', ');
}

function extractResourceResult(outcome: OrchestrationOutcome): Record<string, unknown> | null {
  const result = outcome.workflow_result?.capability_result?.output?.result;
  return isPlainObject(result) ? result : null;
}

function extractResponseData(outcome: OrchestrationOutcome): Record<string, unknown> | null {
  return isPlainObject(outcome.response.data) ? outcome.response.data : null;
}

function clarificationDataFromOutcome(outcome: OrchestrationOutcome): {
  missing: 'customer' | 'document_id' | 'ambiguous' | 'unsupported' | 'pricing';
  reason: string;
} | null {
  const responseData = extractResponseData(outcome);
  if (!responseData || responseData.kind !== 'request_clarification') {
    return null;
  }
  const missing = toTrimmedString(responseData.missing);
  const reason = toTrimmedString(responseData.reason);
  if (!missing || !reason) {
    return null;
  }
  if (missing !== 'customer' && missing !== 'document_id' && missing !== 'ambiguous' && missing !== 'unsupported' && missing !== 'pricing') {
    return null;
  }
  return { missing, reason };
}

function resourceTypeFromOutcome(outcome: OrchestrationOutcome): 'estimate' | 'invoice' {
  const responseData = extractResponseData(outcome);
  const resourceType =
    firstStringFromKeys(responseData, ['resource_type', 'document_type']) ??
    firstStringFromKeys(extractResourceResult(outcome), ['resource_type', 'document_type']);
  return resourceType === 'invoice' ? 'invoice' : 'estimate';
}

function documentTitle(resourceType: 'estimate' | 'invoice'): string {
  return resourceType === 'invoice' ? 'Última factura' : 'Último presupuesto';
}

function buildSourceReferenceLine(
  responseData: Record<string, unknown> | null,
  resourceResult: Record<string, unknown> | null
): string | null {
  const sourceEvidence = resourceResult?.source_evidence;
  const firstSourceEvidence =
    Array.isArray(sourceEvidence) && sourceEvidence.length > 0 && isPlainObject(sourceEvidence[0]) ? sourceEvidence[0] : null;
  const sourceSystem =
    toTrimmedString(firstSourceEvidence?.source_system) ??
    firstStringFromKeys(responseData, ['source_system', 'source']) ??
    firstStringFromKeys(resourceResult, ['source_system', 'source']);
  if (!sourceSystem) {
    return null;
  }
  const displaySourceSystem = sourceSystem.charAt(0).toUpperCase() + sourceSystem.slice(1);
  const documentId =
    firstStringFromKeys(responseData, ['docNumber', 'documentNo', 'document_number', 'estimate_id', 'invoice_id', 'resource_id', 'id']) ??
    firstStringFromKeys(resourceResult, ['docNumber', 'documentNo', 'document_number', 'estimate_id', 'invoice_id', 'resource_id', 'id']) ??
    toTrimmedString(firstSourceEvidence?.record_id) ??
    toTrimmedString(firstSourceEvidence?.resource_id);
  if (!documentId) {
    return `Fuente: ${displaySourceSystem}`;
  }
  return `Fuente: ${displaySourceSystem} · documento ${documentId}`;
}

function paymentStatusLabel(paymentStatus: string | null): string {
  switch (paymentStatus) {
    case 'pending':
      return 'pendientes';
    case 'paid':
      return 'pagadas';
    case 'overdue':
      return 'vencidas';
    default:
      return 'facturas';
  }
}

function isInvoiceListResponseData(outcome: OrchestrationOutcome): boolean {
  const responseData = extractResponseData(outcome);
  return Boolean(responseData && isPlainObject(responseData) && responseData.kind === 'list' && Array.isArray(responseData.records));
}

function isPricingQuoteLineResponseData(outcome: OrchestrationOutcome): boolean {
  const responseData = extractResponseData(outcome);
  return Boolean(responseData && isPlainObject(responseData) && responseData.kind === 'pricing.quote_line');
}

function isPricingQuoteDraftResponseData(outcome: OrchestrationOutcome): boolean {
  const responseData = extractResponseData(outcome);
  return Boolean(responseData && isPlainObject(responseData) && responseData.kind === 'pricing.quote_draft');
}

function formatListCount(value: number): string {
  return value.toLocaleString('es-ES');
}

function buildInvoiceListHeader(input: {
  resourceType: 'estimate' | 'invoice';
  paymentStatus: string | null;
  lookupMode: string | null;
  customerName: string | null;
  year: string | null;
  count: number;
  aggregate: Record<string, unknown> | null;
  currency: string | null;
}): string {
  const countText = formatListCount(input.count);
  const paymentsPendingTotal = numberFromKeys(input.aggregate, ['paymentsPendingTotal']);
  const totalAmount = numberFromKeys(input.aggregate, ['totalAmount']);
  const latestPrefix =
    input.resourceType === 'invoice'
      ? input.count === 1
        ? 'Última factura'
        : `Últimas ${countText} facturas`
      : input.count === 1
        ? 'Último presupuesto'
        : `Últimos ${countText} presupuestos`;
  const amountLabel = input.resourceType === 'invoice' ? 'facturado' : 'presupuestado';
  if (input.lookupMode === 'latest_n') {
    const scope = [latestPrefix, input.customerName ? `de ${input.customerName}` : null, input.year ? `de ${input.year}` : null].filter(
      (value): value is string => Boolean(value)
    );
    const amountText = formatCurrencyAmount(totalAmount ?? 0, input.currency) ?? '0,00 €';
    return `${scope.join(' ')}: ${countText} · ${amountText} ${amountLabel}`;
  }
  if (input.lookupMode === 'by_year' && !input.paymentStatus) {
    const scope = [input.resourceType === 'invoice' ? 'Facturas' : 'Presupuestos', input.year ? `de ${input.year}` : null, input.customerName ? `de ${input.customerName}` : null].filter(
      (value): value is string => Boolean(value)
    );
    const amountText = formatCurrencyAmount(totalAmount ?? 0, input.currency) ?? '0,00 €';
    return `${scope.join(' ')}: ${countText} · ${amountText} facturado`;
  }
  if (input.paymentStatus === 'paid') {
    const scope = [input.resourceType === 'invoice' ? 'Facturas pagadas' : 'Presupuestos pagados', input.customerName ? `de ${input.customerName}` : null, input.year ? `de ${input.year}` : null].filter(
      (value): value is string => Boolean(value)
    );
    const amountText = formatCurrencyAmount(totalAmount ?? 0, input.currency) ?? '0,00 €';
    return `${scope.join(' ')}: ${countText} · ${amountText} facturado`;
  }
  if (input.paymentStatus === 'pending' || input.paymentStatus === 'overdue') {
    const scope = [input.resourceType === 'invoice' ? 'Facturas' : 'Presupuestos', paymentStatusLabel(input.paymentStatus), input.customerName ? `de ${input.customerName}` : null, input.year ? `de ${input.year}` : null].filter(
      (value): value is string => Boolean(value)
    );
    const amountText = formatCurrencyAmount(paymentsPendingTotal ?? 0, input.currency) ?? '0,00 €';
    return `${scope.join(' ')}: ${countText} · ${amountText} pendientes`;
  }
  const scope = [input.resourceType === 'invoice' ? 'Facturas' : 'Presupuestos', input.customerName ? `de ${input.customerName}` : null, input.year ? `de ${input.year}` : null].filter(
    (value): value is string => Boolean(value)
  );
  const amountText = formatCurrencyAmount(totalAmount ?? 0, input.currency) ?? '0,00 €';
  return `${scope.join(' ')}: ${countText} · ${amountText} facturado`;
}

function buildInvoiceListRecordLine(input: {
  record: Record<string, unknown>;
  paymentStatus: string | null;
  lookupMode: string | null;
  currency: string | null;
}): string {
  const documentId =
    firstStringFromKeys(input.record, ['docNumber', 'documentNo', 'document_number', 'invoice_id', 'resource_id', 'id']) ??
    'sin identificador';
  const productSummary = summarizeProductNames(input.record);
  const amountValue =
    !input.paymentStatus || (input.lookupMode === 'by_year' && !input.paymentStatus)
      ? numberFromKeys(input.record, ['total', 'total_amount', 'amount'])
      : input.paymentStatus === 'paid'
        ? numberFromKeys(input.record, ['total', 'total_amount', 'amount'])
        : numberFromKeys(input.record, ['paymentsPending', 'total', 'total_amount', 'amount']);
  const amountText = formatCurrencyAmount(amountValue, input.currency);
  const statusSuffix =
    !input.paymentStatus || (input.lookupMode === 'by_year' && !input.paymentStatus)
      ? ''
      : input.paymentStatus === 'paid'
        ? 'pagada'
        : input.paymentStatus === 'overdue'
          ? 'vencida'
          : 'pendiente';
  const detailParts = [documentId, productSummary, amountText ? `${amountText}${statusSuffix ? ` ${statusSuffix}` : ''}` : statusSuffix].filter(
    (value): value is string => Boolean(value)
  );
  return detailParts.join(' — ');
}

function buildInvoiceListOutboundText(outcome: OrchestrationOutcome): string {
  const responseData = extractResponseData(outcome);
  const resourceResult = extractResourceResult(outcome);
  const resourceType = resourceTypeFromOutcome(outcome);
  if (!responseData || !isPlainObject(responseData) || responseData.kind !== 'list' || !Array.isArray(responseData.records)) {
    return buildCompletedOutboundText(outcome);
  }
  const records = responseData.records.filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === 'object' && !Array.isArray(record));
  if (records.length === 0) {
    return buildCompletedOutboundText(outcome);
  }
  const paymentStatus = toTrimmedString(responseData.payment_status);
  const lookupMode = toTrimmedString(responseData.lookup_mode);
  const year = toTrimmedString(responseData.year) ?? toTrimmedString(resourceResult?.year);
  const customerName = toTrimmedString(responseData.customer);
  const aggregate = isPlainObject(responseData.aggregate) ? responseData.aggregate : null;
  const count = numberFromKeys(aggregate, ['count']) ?? records.length;
  const totalPending = numberFromKeys(aggregate, ['paymentsPendingTotal']);
  const totalAmount = numberFromKeys(aggregate, ['totalAmount']);
  const currency =
    firstStringFromKeys(records[0] ?? null, ['currency', 'currency_code']) ??
    firstStringFromKeys(responseData, ['currency', 'currency_code']) ??
    firstStringFromKeys(resourceResult, ['currency', 'currency_code']);
  const lines: string[] = [];
  lines.push(
    buildInvoiceListHeader({
      resourceType,
      paymentStatus,
      lookupMode,
      customerName,
      year,
      count,
      aggregate: {
        count,
        paymentsPendingTotal: totalPending,
        totalAmount
      },
      currency
    })
  );
  records.slice(0, 3).forEach((record) => {
    lines.push(buildInvoiceListRecordLine({
      record,
      paymentStatus,
      lookupMode,
      currency
    }));
  });
  if (records.length > 3) {
    lines.push(`… y ${formatListCount(records.length - 3)} mmás`);
  }
  return lines.join('\n');
}


function buildPricingOutboundText(outcome: OrchestrationOutcome): string {
  const responseData = extractResponseData(outcome);
  const resourceResult = extractResourceResult(outcome);
  if (!responseData || !isPlainObject(responseData) || responseData.kind !== 'pricing.quote_line') {
    return buildCompletedOutboundText(outcome);
  }
  const articleName = firstStringFromKeys(responseData, ['article_name', 'article']) ?? firstStringFromKeys(resourceResult, ['article_name', 'article']) ?? 'LLínea de PacoPrint';
  const units = numberFromKeys(responseData, ['unidades']) ?? numberFromKeys(resourceResult, ['unidades']);
  const alto = numberFromKeys(responseData, ['alto']) ?? numberFromKeys(resourceResult, ['alto']);
  const ancho = numberFromKeys(responseData, ['ancho']) ?? numberFromKeys(resourceResult, ['ancho']);
  const optionsSummary = Array.isArray(responseData.options_summary)
    ? responseData.options_summary.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const defaultsApplied = Array.isArray(responseData.defaults_applied)
    ? responseData.defaults_applied.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const currency =
    firstStringFromKeys(responseData, ['currency', 'currency_code']) ??
    firstStringFromKeys(resourceResult, ['currency', 'currency_code']);
  const total =
    formatCurrencyAmount(numberFromKeys(responseData, ['total', 'amount']), currency) ??
    formatCurrencyAmount(numberFromKeys(resourceResult, ['total', 'amount']), currency);
  const netAmount =
    formatCurrencyAmount(numberFromKeys(responseData, ['neto_total', 'neto_base']), currency) ??
    formatCurrencyAmount(numberFromKeys(resourceResult, ['neto_total', 'neto_base']), currency);
  const ivaPercentage = numberFromKeys(responseData, ['iva_percentage']) ?? numberFromKeys(resourceResult, ['iva_percentage']);
  const fragments = [
    articleName,
    alto !== null && ancho !== null ? `${ancho}×${alto} mm` : null,
    units !== null ? `${units} uds` : null,
    optionsSummary.length > 0 ? optionsSummary.join(', ') : null
  ].filter((value): value is string => Boolean(value));
  const mainLine =
    total && netAmount !== null && ivaPercentage !== null
      ? `${fragments.join(' · ')} → ${total} (neto ${netAmount} + IVA ${ivaPercentage}%)`
      : total
        ? `${fragments.join(' · ')} → ${total}`
        : fragments.join(' · ');
  return defaultsApplied.length > 0 ? `${mainLine}\nDefaults aplicados: ${defaultsApplied.join(', ')}.` : mainLine;
}

function buildPricingDraftOutboundText(outcome: OrchestrationOutcome): string {
  const data = extractResponseData(outcome);
  if (!data || !isPlainObject(data) || data.kind !== 'pricing.quote_draft') {
    return buildCompletedOutboundText(outcome);
  }
  const currency = firstStringFromKeys(data, ['currency', 'currency_code']);
  const customer = firstStringFromKeys(data, ['customer']);
  const linesRaw = Array.isArray(data.lines) ? data.lines : [];
  const lineTexts: string[] = [];
  linesRaw.forEach((line, index) => {
    if (!isPlainObject(line)) {
      return;
    }
    const name = firstStringFromKeys(line, ['article_name', 'article']) ?? 'LLínea';
    const alto = numberFromKeys(line, ['alto']);
    const ancho = numberFromKeys(line, ['ancho']);
    const units = numberFromKeys(line, ['unidades']);
    const optionsSummary = Array.isArray(line.options_summary)
      ? line.options_summary.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const lineTotal = formatCurrencyAmount(numberFromKeys(line, ['total']), currency);
    const parts = [
      name,
      alto !== null && ancho !== null ? `${ancho}×${alto} mm` : null,
      units !== null ? `${units} uds` : null,
      optionsSummary.length > 0 ? optionsSummary.join(', ') : null
    ].filter((value): value is string => Boolean(value));
    lineTexts.push(`${index + 1}. ${parts.join(' · ')}${lineTotal ? ` → ${lineTotal}` : ''}`);
  });
  const total = formatCurrencyAmount(numberFromKeys(data, ['total']), currency);
  const header = customer ? `Presupuesto para ${customer} (borrador):` : 'Presupuesto (borrador):';
  const totalLine = total ? `Total: ${total} (IVA incl.)` : null;
  return [header, ...lineTexts, totalLine].filter((value): value is string => Boolean(value)).join('\n');
}

function buildClarificationText(outcome: OrchestrationOutcome): string {
  const clarification = clarificationDataFromOutcome(outcome);
  if (!clarification) {
    return 'No tengo suficiente contexto para responder. Dime el cliente o el documento que buscas.';
  }
  switch (clarification.missing) {
    case 'customer':
      return '¿De qué cliente?';
    case 'document_id':
      return 'Necesito el identificador del documento para consultar eso.';
    case 'ambiguous':
      return 'No tengo el contexto suficiente; dime el cliente y qué quieres consultar.';
    case 'unsupported':
      return 'Esa consulta todavía no la sé responder. Puedo darte la última factura o presupuesto de un cliente, sus facturas pendientes/vencidas/pagadas, o las facturas de un año.';
    case 'pricing':
      return clarification.reason || '¿Qué quieres presupuestar?';
    default:
      return clarification.reason;
  }
}

function buildCompletedOutboundText(outcome: OrchestrationOutcome): string {
  const responseData = extractResponseData(outcome);
  const resourceResult = extractResourceResult(outcome);
  const resourceType = resourceTypeFromOutcome(outcome);
  const customerName =
    firstStringFromKeys(responseData, ['customer', 'customer_name', 'customerName', 'contact_name', 'contactName', 'contact']) ??
    firstStringFromKeys(resourceResult, ['customer', 'customer_name', 'customerName', 'contact_name', 'contactName', 'contact']);
  const documentId =
    firstStringFromKeys(responseData, ['docNumber', 'documentNo', 'document_number', 'estimate_id', 'invoice_id', 'resource_id', 'id']) ??
    firstStringFromKeys(resourceResult, ['docNumber', 'documentNo', 'document_number', 'estimate_id', 'invoice_id', 'resource_id', 'id']);
  const productSummary = summarizeProductNames(responseData) ?? summarizeProductNames(resourceResult);
  const total =
    formatCurrencyAmount(
      numberFromKeys(responseData, ['total', 'total_amount', 'amount']),
      firstStringFromKeys(responseData, ['currency', 'currency_code'])
    ) ??
    formatCurrencyAmount(
      numberFromKeys(resourceResult, ['total', 'total_amount', 'amount']),
      firstStringFromKeys(resourceResult, ['currency', 'currency_code'])
    );
  const vatInclusion = Boolean(
    responseData?.tax_amount ??
      responseData?.tax ??
      responseData?.vat ??
      responseData?.vat_amount ??
      resourceResult?.tax_amount ??
      resourceResult?.tax ??
      resourceResult?.vat ??
      resourceResult?.vat_amount
  )
    ? ' IVA incl.'
    : '';
  const header = [documentTitle(resourceType), customerName ? `de ${customerName}` : null, documentId ? `(${documentId})` : null]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  const detailParts = [productSummary, total ? `${total}${vatInclusion}` : null].filter((value): value is string => Boolean(value));
  return detailParts.length > 0 ? `${header}: ${detailParts.join(' — ')}` : header;
}

function buildPricingBlockedText(outcome: OrchestrationOutcome): string {
  const data = extractResponseData(outcome);
  const reason = data && typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!reason) {
    return 'No puedo calcular ese precio con lo que tengo. Dame el artículo y los datos que falten.';
  }
  const candidatesRaw = data && Array.isArray(data.candidates) ? data.candidates : [];
  const candidates = candidatesRaw.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
  const capitalized = reason.charAt(0).toUpperCase() + reason.slice(1);
  return candidates.length > 0 ? `${capitalized} (${candidates.join(', ')})` : capitalized;
}

function buildStatusText(outcome: OrchestrationOutcome): string {
  switch (outcome.response.status) {
    case 'completed':
      return isPricingQuoteDraftResponseData(outcome)
        ? buildPricingDraftOutboundText(outcome)
        : isPricingQuoteLineResponseData(outcome)
          ? buildPricingOutboundText(outcome)
          : isInvoiceListResponseData(outcome)
            ? buildInvoiceListOutboundText(outcome)
            : buildCompletedOutboundText(outcome);
    case 'not_found':
      return 'No he encontrado ese documento en Holded.';
    case 'unavailable':
      return 'Holded no está disponible ahora mismo. Inténtalo de nuevo más tarde.';
    case 'error':
      return 'Ha habido un problema técnico al procesar la consulta. Inténtalo de nuevo.';
    case 'denied':
    case 'blocked':
      return outcome.response.workflow_kind === 'pricing.quote_line' || outcome.response.workflow_kind === 'pricing.quote_draft'
        ? buildPricingBlockedText(outcome)
        : 'Esa consulta todavía no la sé responder. Puedo darte la última factura o presupuesto de un cliente, sus facturas pendientes/vencidas/pagadas, o las facturas de un año.';
    case 'no_proposal':
      return buildClarificationText(outcome);
    default:
      return `runtime ${outcome.response.status}: ${outcome.response.message}`;
  }
}

function truncateTelegramText(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= TELEGRAM_SAFE_MESSAGE_LIMIT) {
    return text;
  }
  const suffixCharacters = Array.from(`\n${TELEGRAM_TRUNCATION_SUFFIX}`);
  const truncatedLength = Math.max(0, TELEGRAM_SAFE_MESSAGE_LIMIT - suffixCharacters.length);
  return `${characters.slice(0, truncatedLength).join('')}\n${TELEGRAM_TRUNCATION_SUFFIX}`;
}

export function buildTelegramOutboundText(outcome: OrchestrationOutcome): string {
  return truncateTelegramText(buildStatusText(outcome));
}

function buildOutboundMessage(input: {
  outcome: OrchestrationOutcome;
  inbound: InboundMessage;
  channel: 'telegram';
}): TelegramOutboundMessage {
  return {
    channel: input.channel,
    chat_id: input.inbound.chat_id,
    text: buildTelegramOutboundText(input.outcome),
    reply_to_message_id: input.inbound.message_id,
    correlation_id: input.outcome.correlation_id,
    update_id: null,
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
  private readonly conversationMemoryStore: ConversationMemoryStore | null;

  constructor(options: TelegramChannelAdapterOptions) {
    this.installation = {
      ...options.installation,
      identity_mappings: options.installation.identity_mappings.map((mapping) => ({ ...mapping }))
    };
    this.orchestrationBoundary = options.orchestrationBoundary;
    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
    this.mode = options.mode ?? 'long_polling';
    this.conversationMemoryStore = options.conversationMemoryStore ?? null;
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

    const conversation_history = this.conversationMemoryStore?.read({
      installation_id: this.installation.installation_id,
      chat_id: message.chat_id
    }) ?? [];

    const orchestrationOutcome = this.orchestrationBoundary.execute(
      buildOrchestrationRequest({
        message,
        organization_id: identity.organization_id,
        principal_id: identity.principal_id,
        principal_type: identity.principal_type,
        installation_id: this.installation.installation_id,
        conversation_history
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
      this.conversationMemoryStore?.append(
        {
          installation_id: this.installation.installation_id,
          chat_id: message.chat_id
        },
        [
          { role: 'user', content: message.text },
          { role: 'assistant', content: sentMessage.text }
        ]
      );
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
