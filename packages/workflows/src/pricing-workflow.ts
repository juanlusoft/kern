
import {
  createDeterministicId,
  createEvidenceRecord,
  fingerprintCoreRequest,
  normalizeCorrelationId,
  type GovernedWorkflowKind,
  type GovernedWorkflowResult,
  type PacoPrintCatalogAdapterPort,
  type PacoPrintCatalogCandidate,
  type PricingQuoteLineWorkflowInput,
  type PricingQuoteLineWorkflowResponseData,
  type ResourceResult,
  type WorkflowExecutionStatus,
  type WorkflowStep
} from '../../contracts/src/index';
import { evaluatePolicy } from '../../policy/src/index';
import {
  buildWorkflowStep,
  createDeniedCapabilityResult,
  createRuntimeResponse,
  createWorkflowCoreRequest
} from './workflow-internals';
import type { WorkflowRuntimeContext } from './workflow-runtime-context';
import { parseMeasures, parseQuantity, pickArticleCandidate } from './pricing-parse';
import { resolveLineAttributes } from './pricing-line';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePositiveInteger(value: unknown): number | null {
  const candidate = normalizeOptionalNumber(value);
  return candidate !== null && Number.isInteger(candidate) && candidate > 0 ? candidate : null;
}

function normalizeOptions(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? structuredClone(value) : null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function candidateLabel(candidate: PacoPrintCatalogCandidate): string {
  return candidate.nombre;
}

function candidateMatches(candidate: PacoPrintCatalogCandidate, article: string): boolean {
  return (
    normalizeSearchText(candidate.nombre) === normalizeSearchText(article) ||
    normalizeSearchText(String(candidate.id)) === normalizeSearchText(article)
  );
}

function extractCandidates(result: ResourceResult): PacoPrintCatalogCandidate[] {
  if (result.status !== 'found' || !isPlainObject(result.data)) {
    return [];
  }
  const candidates = result.data.candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.filter((candidate): candidate is PacoPrintCatalogCandidate => {
    if (!isPlainObject(candidate)) {
      return false;
    }
    return (typeof candidate.id === 'string' || typeof candidate.id === 'number') && typeof candidate.nombre === 'string';
  });
}

function buildClarificationData(input: {
  reason: string;
  fields?: string[];
  candidates?: string[];
  defaults_applied?: string[];
}): Record<string, unknown> {
  return {
    kind: 'request_clarification',
    missing: 'pricing',
    reason: input.reason,
    ...(input.fields && input.fields.length > 0 ? { fields: input.fields } : {}),
    ...(input.candidates && input.candidates.length > 0 ? { candidates: input.candidates } : {}),
    ...(input.defaults_applied && input.defaults_applied.length > 0 ? { defaults_applied: input.defaults_applied } : {})
  };
}

function extractVat(input: Record<string, unknown>): { percentage: number | null; amount: number | null } {
  if (isPlainObject(input.iva)) {
    return {
      percentage: typeof input.iva.porcentaje === 'number' ? input.iva.porcentaje : null,
      amount: typeof input.iva.importe === 'number' ? input.iva.importe : null
    };
  }
  const amount = typeof input.iva === 'number' ? input.iva : typeof input.iva_amount === 'number' ? input.iva_amount : null;
  const base = typeof input.neto_base === 'number' ? input.neto_base : null;
  return {
    percentage: amount !== null && base !== null && base > 0 ? Number(((amount / base) * 100).toFixed(1)) : null,
    amount
  };
}

function buildPricingResponseData(input: {
  candidate: PacoPrintCatalogCandidate;
  resourceResult: ResourceResult;
  quoteInput: PricingQuoteLineWorkflowInput;
  resolvedOptions: Record<string, unknown> | null;
  resolvedAttributes: Record<string, unknown>;
  resolvedUnits: number;
  resolvedAlto: number;
  resolvedAncho: number;
  defaultsApplied: string[];
  optionsSummary: string[];
}): PricingQuoteLineWorkflowResponseData {
  const resourceData = isPlainObject(input.resourceResult.data) ? input.resourceResult.data : {};
  const vat = extractVat(resourceData);
  return {
    kind: 'pricing.quote_line',
    article: input.quoteInput.article,
    article_name: input.candidate.nombre,
    articulo_id: input.candidate.id,
    // Valores RESUELTOS (deterministas) — lo que se cobró vía la API; no los que
    // propuso el modelo, para que lo mostrado coincida con la base del precio.
    unidades: input.resolvedUnits,
    alto: input.resolvedAlto,
    ancho: input.resolvedAncho,
    options: input.resolvedOptions,
    attributes: input.resolvedAttributes,
    defaults_applied: input.defaultsApplied.length > 0 ? input.defaultsApplied : null,
    options_summary: input.optionsSummary.length > 0 ? input.optionsSummary : null,
    neto_unitario: typeof resourceData.neto_unitario === 'number' ? resourceData.neto_unitario : null,
    neto_base: typeof resourceData.neto_base === 'number' ? resourceData.neto_base : null,
    neto_total: typeof resourceData.neto_total === 'number' ? resourceData.neto_total : null,
    iva_percentage: vat.percentage,
    iva_amount: vat.amount,
    total: typeof resourceData.total === 'number' ? resourceData.total : null,
    stock: typeof resourceData.stock === 'boolean' ? resourceData.stock : null,
    source_system: input.resourceResult.decision.source_system,
    source_record_id: input.resourceResult.resource_id
  };
}

function buildPricingCapabilityInvocation(input: {
  workflow_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  candidate: PacoPrintCatalogCandidate;
  request: PricingQuoteLineWorkflowInput;
  resolvedAttributes: Record<string, unknown>;
  resolvedUnits: number;
  resolvedAlto: number;
  resolvedAncho: number;
}): {
  capability_id: string;
  organization_id: string;
  principal_id: string;
  correlation_id: string;
  input: { purpose: string; requested_scope: string[]; payload: Record<string, unknown> };
} {
  return {
    capability_id: input.request.capability_id ?? 'pricing.quote_line',
    organization_id: input.organization_id,
    principal_id: input.principal_id,
    correlation_id: input.correlation_id,
    input: {
      purpose: `Calculate PacoPrint price for ${input.request.article}`,
      requested_scope: ['read:knowledge'],
      payload: {
        articulo_id: input.candidate.id,
        unidades: input.resolvedUnits,
        alto: input.resolvedAlto,
        ancho: input.resolvedAncho,
        atributos: input.resolvedAttributes,
        article: input.request.article,
        options: input.request.options ?? null,
        workflow_id: input.workflow_id
      }
    }
  };
}

export function buildBlockedPricingWorkflow(input: {
  runtime: WorkflowRuntimeContext;
  workflow_id: string;
  workflowKind: GovernedWorkflowKind;
  organization_id: string;
  correlation_id: string;
  capability_id: string;
  created_at: string;
  evidenceRecords: { evidence_id: string; record_type: string }[];
  steps: WorkflowStep[];
  reason: string;
  clarification: Record<string, unknown>;
}): GovernedWorkflowResult {
  const response = createRuntimeResponse({
    kind: input.workflowKind,
    status: 'blocked',
    message: input.reason,
    data: input.clarification,
    runtimeDriven: false
  });
  const responseEvidence = input.runtime.appendWorkflowEvidence({
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    record_type: 'workflow_response_created',
    subject: input.capability_id,
    data: {
      status: 'blocked',
      reason: input.reason,
      response
    }
  });
  input.evidenceRecords.push(responseEvidence);
  input.steps.push(
    buildWorkflowStep({
      step_kind: 'response',
      status: 'blocked',
      evidence_reference: responseEvidence.evidence_id,
      details: { reason: input.reason }
    })
  );
  return input.runtime.finishWorkflow({
    workflow_id: input.workflow_id,
    workflow_kind: input.workflowKind,
    organization_id: input.organization_id,
    correlation_id: input.correlation_id,
    turn_id: null,
    status: 'blocked',
    response,
    capability_result: null,
    evidenceRecords: input.evidenceRecords,
    steps: input.steps,
    created_at: input.created_at,
    updated_at: input.runtime.now().toISOString()
  });
}

export function executePricingQuoteLineWorkflow(
  runtime: WorkflowRuntimeContext,
  input: PricingQuoteLineWorkflowInput
): GovernedWorkflowResult {
  const correlation_id = normalizeCorrelationId({ request_id: input.workflow_id, correlation_id: input.correlation_id ?? null });
  const requested_at = input.requested_at?.trim() || runtime.now().toISOString();
  const workflowKind: GovernedWorkflowKind = 'pricing.quote_line';
  const capabilityId = input.capability_id ?? 'pricing.quote_line';
  const article = normalizeOptionalString(input.article);
  const created_at = requested_at;
  const steps: WorkflowStep[] = [];
  const evidenceRecords: { evidence_id: string; record_type: string }[] = [];

  const intentEvidence = runtime.evidenceLedger.append(
    createEvidenceRecord({
      organization_id: input.organization_hint?.trim() || 'unknown',
      correlation_id,
      record_type: 'intent',
      subject: 'workflow.pricing.quote_line',
      data: {
        workflow_id: input.workflow_id,
        article: input.article,
        unidades: input.unidades ?? null,
        alto: input.alto ?? null,
        ancho: input.ancho ?? null,
        options: input.options ?? null,
        claimed_result: input.claimed_result ?? null,
        claimed_output: input.claimed_output ?? null,
        caller_result: input.caller_result ?? null,
        assistant_result: input.assistant_result ?? null,
        model_claimed_result: input.model_claimed_result ?? null
      },
      created_at
    })
  );
  evidenceRecords.push(intentEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'intent',
      status: 'completed',
      evidence_reference: intentEvidence.evidence_id,
      details: {
        article: input.article,
        unidades: input.unidades ?? null,
        alto: input.alto ?? null,
        ancho: input.ancho ?? null
      }
    })
  );

  if (!article) {
    return buildBlockedPricingWorkflow({
      runtime,
      workflow_id: input.workflow_id,
      workflowKind,
      organization_id: input.organization_hint?.trim() || 'unknown',
      correlation_id,
      capability_id: capabilityId,
      created_at,
      evidenceRecords,
      steps,
      reason: 'falta el artículo',
      clarification: buildClarificationData({
        reason: 'falta el artículo',
        fields: ['article']
      })
    });
  }

  const coreRequest = createWorkflowCoreRequest({
    workflow_id: input.workflow_id,
    correlation_id,
    organization_hint: input.organization_hint,
    principal_hint: input.principal_hint,
    action: 'workflow.pricing.quote_line',
    purpose: `Calculate PacoPrint price for ${article}`,
    payload: {
      resource: `pricing/quote_line/${article}`,
      operation: 'read',
      requested_scope: 'read:knowledge',
      classification: 'internal',
      destination: 'core',
      amount: 1
    },
    requires_binding: false
  });

  const organizationContext = runtime.resolveOrganizationContext(coreRequest);
  if (organizationContext.resolution_state !== 'resolved' || !organizationContext.organization_id) {
    const deniedEvidence = runtime.appendWorkflowEvidence({
      organization_id: input.organization_hint?.trim() || 'unknown',
      correlation_id,
      record_type: 'capability_invocation_denied',
      subject: capabilityId,
      data: { workflow_id: input.workflow_id, capability_id: capabilityId, reason: 'organization could not be resolved' }
    });
    evidenceRecords.push(deniedEvidence);
    const capability_result = createDeniedCapabilityResult({
      capability_id: capabilityId,
      organization_id: input.organization_hint?.trim() || 'unknown',
      principal_id: input.principal_hint?.trim() || 'unknown',
      correlation_id,
      reason: 'organization could not be resolved',
      evidence_reference: deniedEvidence.evidence_id
    });
    const response = createRuntimeResponse({ kind: workflowKind, status: 'denied', message: 'organization could not be resolved', data: null, runtimeDriven: false });
    return runtime.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: workflowKind,
      organization_id: null,
      correlation_id,
      turn_id: null,
      status: 'denied',
      response,
      capability_result,
      evidenceRecords,
      steps,
      created_at,
      updated_at: runtime.now().toISOString()
    });
  }

  const identityContext = runtime.resolveIdentityContext(coreRequest, organizationContext);
  if (identityContext.resolution_state !== 'resolved' || !identityContext.principal_id) {
    const deniedEvidence = runtime.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'capability_invocation_denied',
      subject: capabilityId,
      data: { workflow_id: input.workflow_id, capability_id: capabilityId, reason: 'principal could not be resolved' }
    });
    evidenceRecords.push(deniedEvidence);
    const capability_result = createDeniedCapabilityResult({
      capability_id: capabilityId,
      organization_id: organizationContext.organization_id,
      principal_id: input.principal_hint?.trim() || 'unknown',
      correlation_id,
      reason: 'principal could not be resolved',
      evidence_reference: deniedEvidence.evidence_id
    });
    const response = createRuntimeResponse({ kind: workflowKind, status: 'denied', message: 'principal could not be resolved', data: null, runtimeDriven: false });
    return runtime.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: null,
      status: 'denied',
      response,
      capability_result,
      evidenceRecords,
      steps,
      created_at,
      updated_at: runtime.now().toISOString()
    });
  }

  const policyDecision = evaluatePolicy({ request: coreRequest, organizationContext, identityContext });
  const policyEvidence = runtime.appendWorkflowEvidence({
    organization_id: organizationContext.organization_id,
    correlation_id,
    record_type: 'policy_decision',
    subject: policyDecision.outcome,
    data: {
      decision_id: policyDecision.decision_id,
      decision_reason: policyDecision.decision_reason,
      outcome: policyDecision.outcome,
      obligations: policyDecision.obligations
    }
  });
  evidenceRecords.push(policyEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'policy',
      status: policyDecision.allow ? 'completed' : 'denied',
      evidence_reference: policyEvidence.evidence_id,
      details: { decision_id: policyDecision.decision_id, outcome: policyDecision.outcome }
    })
  );

  if (policyDecision.deny || policyDecision.failed_closed || policyDecision.defer) {
    const blockedStatus: WorkflowExecutionStatus = policyDecision.defer ? 'blocked' : 'denied';
    const response = createRuntimeResponse({ kind: workflowKind, status: blockedStatus, message: policyDecision.decision_reason, data: null, runtimeDriven: false });
    const responseEvidence = runtime.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'workflow_response_created',
      subject: capabilityId,
      data: { status: blockedStatus, reason: policyDecision.decision_reason, response }
    });
    evidenceRecords.push(responseEvidence);
    steps.push(
      buildWorkflowStep({
        step_kind: 'response',
        status: blockedStatus,
        evidence_reference: responseEvidence.evidence_id,
        details: { reason: policyDecision.decision_reason }
      })
    );
    return runtime.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: null,
      status: blockedStatus,
      response,
      capability_result: null,
      evidenceRecords,
      steps,
      created_at,
      updated_at: runtime.now().toISOString()
    });
  }

  const catalogAdapter = runtime.pacoPrintCatalogAdapter;
  if (!catalogAdapter) {
    return buildBlockedPricingWorkflow({
      runtime,
      workflow_id: input.workflow_id,
      workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      capability_id: capabilityId,
      created_at,
      evidenceRecords,
      steps,
      reason: 'PacoPrint catalog adapter unavailable',
      clarification: buildClarificationData({
        reason: 'PacoPrint catalog adapter unavailable',
        fields: ['article']
      })
    });
  }

  const searchResult = catalogAdapter.catalogSearch({
    text: article,
    organization_id: organizationContext.organization_id,
    correlation_id
  });
  if (searchResult.status !== 'found') {
    if (searchResult.status === 'not_found') {
      return buildBlockedPricingWorkflow({
        runtime,
        workflow_id: input.workflow_id,
        workflowKind,
        organization_id: organizationContext.organization_id,
        correlation_id,
        capability_id: capabilityId,
        created_at,
        evidenceRecords,
        steps,
        reason: 'artículo no encontrado',
        clarification: buildClarificationData({
          reason: 'artículo no encontrado',
          fields: ['article']
        })
      });
    }
    const response = createRuntimeResponse({
      kind: workflowKind,
      status: searchResult.status,
      message: searchResult.error ?? 'PacoPrint catalog search failed',
      data: null,
      runtimeDriven: false
    });
    const responseEvidence = runtime.appendWorkflowEvidence({
      organization_id: organizationContext.organization_id,
      correlation_id,
      record_type: 'workflow_response_created',
      subject: capabilityId,
      data: {
        status: searchResult.status,
        reason: searchResult.error ?? 'PacoPrint catalog search failed',
        response
      }
    });
    evidenceRecords.push(responseEvidence);
    steps.push(
      buildWorkflowStep({
        step_kind: 'response',
        status: searchResult.status === 'error' ? 'error' : 'unavailable',
        evidence_reference: responseEvidence.evidence_id,
        details: { reason: searchResult.error ?? 'PacoPrint catalog search failed' }
      })
    );
    return runtime.finishWorkflow({
      workflow_id: input.workflow_id,
      workflow_kind: workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      turn_id: null,
      status: searchResult.status === 'error' ? 'error' : 'unavailable',
      response,
      capability_result: null,
      evidenceRecords,
      steps,
      created_at,
      updated_at: runtime.now().toISOString()
    });
  }

  const rawMessage = normalizeOptionalString(input.raw_message);
  const candidates = extractCandidates(searchResult);
  let selectedCandidate: PacoPrintCatalogCandidate | null;
  if (candidates.length === 1) {
    selectedCandidate = candidates[0] ?? null;
  } else if (rawMessage) {
    // Desambiguación determinista contra el texto crudo del usuario (evita que
    // un artículo truncado por el modelo -"lona" en vez de "lona frontlit"- se
    // quede en ambiguo). Si no resuelve, cae al match por el hint del modelo.
    const picked = pickArticleCandidate(rawMessage, candidates);
    selectedCandidate = picked.selected ?? candidates.find((candidate) => candidateMatches(candidate, article)) ?? null;
  } else {
    selectedCandidate = candidates.find((candidate) => candidateMatches(candidate, article)) ?? null;
  }
  if (!selectedCandidate) {
    const reason = candidates.length === 0 ? 'artículo no encontrado' : 'artículo ambiguo';
    return buildBlockedPricingWorkflow({
      runtime,
      workflow_id: input.workflow_id,
      workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      capability_id: capabilityId,
      created_at,
      evidenceRecords,
      steps,
      reason,
      clarification: buildClarificationData({
        reason,
        candidates: candidates.map((candidate) => candidateLabel(candidate))
      })
    });
  }

  // Extracción DETERMINISTA desde el texto crudo (primaria); los campos que dé
  // el modelo quedan de respaldo. El precio lo sigue calculando la API.
  const parsedMeasures = rawMessage ? parseMeasures(rawMessage) : null;
  const parsedQuantity = rawMessage ? parseQuantity(rawMessage) : null;
  const resolvedUnits = parsedQuantity ?? normalizePositiveInteger(input.unidades) ?? 1;
  const resolvedAlto = parsedMeasures?.altoCm ?? normalizeOptionalNumber(input.alto);
  const resolvedAncho = parsedMeasures?.anchoCm ?? normalizeOptionalNumber(input.ancho);
  const resolvedOptions = normalizeOptions(input.options);
  const lineResolution = resolveLineAttributes(selectedCandidate, {
    rawMessage,
    resolvedUnits,
    resolvedAlto,
    resolvedAncho,
    resolvedOptions
  });
  const { resolvedAttributes, defaultsApplied, optionsSummary, invalidFields, missingChoices } = lineResolution;
  const missingFields: string[] = [];
  if (resolvedAlto === null) {
    missingFields.push('alto');
  }
  if (resolvedAncho === null) {
    missingFields.push('ancho');
  }
  missingFields.push(...lineResolution.missingFields);

  if (missingFields.length > 0 || invalidFields.length > 0) {
    const uniqueMissing = [...new Set(missingFields)];
    const uniqueInvalid = [...new Set(invalidFields)];
    // Nombra la opción que falta y sus alternativas reales del catálogo, p.ej.
    // "me falta el corte: ¿Escuadrado o Con Forma?".
    const formatMissingOption = (label: string): string => {
      const choices = missingChoices.get(label);
      const base = `me falta ${label.toLowerCase()}`;
      if (choices && choices.length > 0) {
        const list =
          choices.length === 1
            ? choices[0]
            : `${choices.slice(0, -1).join(', ')} o ${choices[choices.length - 1]}`;
        return `${base}: ¿${list}?`;
      }
      return base;
    };
    const missingOptionField = uniqueMissing.find(
      (field) => field !== 'alto' && field !== 'ancho' && field !== 'unidades'
    );
    const reason =
      uniqueMissing.length > 0
        ? uniqueMissing.includes('alto') || uniqueMissing.includes('ancho')
          ? 'faltan las medidas'
          : missingOptionField
            ? formatMissingOption(missingOptionField)
            : `falta la opción ${uniqueMissing[0]}`
        : `opción inválida: ${uniqueInvalid[0]}`;
    return buildBlockedPricingWorkflow({
      runtime,
      workflow_id: input.workflow_id,
      workflowKind,
      organization_id: organizationContext.organization_id,
      correlation_id,
      capability_id: capabilityId,
      created_at,
      evidenceRecords,
      steps,
      reason,
      clarification: buildClarificationData({
        reason,
        fields: [...uniqueMissing, ...uniqueInvalid],
        defaults_applied: defaultsApplied
      })
    });
  }

  const capabilityInvocation = buildPricingCapabilityInvocation({
    workflow_id: input.workflow_id,
    organization_id: organizationContext.organization_id,
    principal_id: identityContext.principal_id,
    correlation_id,
    candidate: selectedCandidate,
    request: input,
    resolvedAttributes,
    resolvedUnits: resolvedUnits!,
    resolvedAlto: resolvedAlto!,
    resolvedAncho: resolvedAncho!
  });

  const capability_result = runtime.capabilityRuntime.invokeCapability({
    capability_id: capabilityInvocation.capability_id,
    organization_id: capabilityInvocation.organization_id,
    principal_id: capabilityInvocation.principal_id,
    correlation_id: capabilityInvocation.correlation_id,
    input: capabilityInvocation.input,
    requested_at: requested_at,
    claimed_result: input.claimed_result ?? null,
    claimed_output: input.claimed_output ?? null,
    caller_result: input.caller_result ?? null,
    assistant_result: input.assistant_result ?? null,
    model_claimed_result: input.model_claimed_result ?? null
  });

  const resourceResult = capability_result.output?.result as unknown as ResourceResult | null;
  const responseData =
    capability_result.status === 'executed' && resourceResult?.status === 'found'
      ? buildPricingResponseData({
          candidate: selectedCandidate,
          resourceResult,
          quoteInput: input,
          resolvedOptions,
          resolvedAttributes,
          resolvedUnits,
          resolvedAlto: resolvedAlto!,
          resolvedAncho: resolvedAncho!,
          defaultsApplied,
          optionsSummary
        }) as unknown as Record<string, unknown>
      : null;
  const responseStatus: WorkflowExecutionStatus =
    capability_result.status === 'executed'
      ? 'completed'
      : capability_result.status === 'not_found'
        ? 'not_found'
        : capability_result.status === 'unavailable'
          ? 'unavailable'
          : capability_result.status === 'error'
            ? 'error'
            : 'denied';
  const response = createRuntimeResponse({
    kind: workflowKind,
    status: responseStatus,
    message: capability_result.status === 'executed' ? 'PacoPrint quote line calculated' : capability_result.reason,
    data: responseData,
    runtimeDriven: capability_result.status === 'executed'
  });
  const responseEvidence = runtime.appendWorkflowEvidence({
    organization_id: organizationContext.organization_id,
    correlation_id,
    record_type: 'workflow_response_created',
    subject: capabilityId,
    data: {
      status: responseStatus,
      reason: response.message,
      response,
      defaultsApplied,
      optionsSummary,
      selected_article: selectedCandidate.nombre,
      articulo_id: selectedCandidate.id,
      article_input: article,
      attributes: resolvedAttributes
    }
  });
  evidenceRecords.push(responseEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'capability',
      status: capability_result.status === 'executed' ? 'completed' : capability_result.status === 'not_found' ? 'failed' : 'failed',
      evidence_reference: capability_result.evidence_reference,
      details: {
        capability_id: capability_result.capability_id,
        status: capability_result.status,
        executed_by_runtime: capability_result.executed_by_runtime
      }
    })
  );
  steps.push(
    buildWorkflowStep({
      step_kind: 'response',
      status: responseStatus,
      evidence_reference: responseEvidence.evidence_id,
      details: {
        status: responseStatus,
        reason: response.message
      }
    })
  );

  return runtime.finishWorkflow({
    workflow_id: input.workflow_id,
    workflow_kind: workflowKind,
    organization_id: organizationContext.organization_id,
    correlation_id,
    turn_id: null,
    status: responseStatus,
    response,
    capability_result,
    evidenceRecords,
    steps,
    created_at,
    updated_at: runtime.now().toISOString()
  });
}

