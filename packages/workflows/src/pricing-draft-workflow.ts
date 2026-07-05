/**
 * F2 — Borrador de presupuesto multi-línea de PacoPrint.
 *
 * Valora CADA línea reutilizando el workflow de una línea (F1), que aplica toda
 * la gobernanza (org/identidad/política/capability/evidencia + extracción
 * determinista + precio autoritativo de la API). Aquí sólo se orquesta el bucle
 * y se AGREGA: si todas las líneas están completas, se arma el borrador con su
 * total; si a alguna le falta un dato, se BLOQUEA pidiendo todo lo que falta
 * (nombrando cada línea). Nada se persiste (sigue siendo lectura, como F1).
 */
import {
  createEvidenceRecord,
  normalizeCorrelationId,
  type GovernedWorkflowKind,
  type GovernedWorkflowResult,
  type PricingQuoteDraftLine,
  type PricingQuoteDraftWorkflowInput,
  type WorkflowStep
} from '../../contracts/src/index';
import { buildWorkflowStep, createRuntimeResponse } from './workflow-internals';
import type { WorkflowRuntimeContext } from './workflow-runtime-context';
import { buildBlockedPricingWorkflow, executePricingQuoteLineWorkflow } from './pricing-workflow';

const WORKFLOW_KIND: GovernedWorkflowKind = 'pricing.quote_draft';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function executePricingQuoteDraftWorkflow(
  runtime: WorkflowRuntimeContext,
  input: PricingQuoteDraftWorkflowInput
): GovernedWorkflowResult {
  const correlation_id = normalizeCorrelationId({ request_id: input.workflow_id, correlation_id: input.correlation_id ?? null });
  const requested_at = input.requested_at?.trim() || runtime.now().toISOString();
  const created_at = requested_at;
  const capabilityId = input.capability_id ?? 'pricing.quote_draft';
  const organization_id = input.organization_hint?.trim() || 'unknown';
  const customer = normalizeOptionalString(input.customer);
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const steps: WorkflowStep[] = [];
  const evidenceRecords: { evidence_id: string; record_type: string }[] = [];

  const intentEvidence = runtime.evidenceLedger.append(
    createEvidenceRecord({
      organization_id,
      correlation_id,
      record_type: 'intent',
      subject: 'workflow.pricing.quote_draft',
      data: {
        workflow_id: input.workflow_id,
        customer,
        line_count: lines.length,
        articles: lines.map((line) => line.article ?? null)
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
      details: { customer, line_count: lines.length }
    })
  );

  if (lines.length === 0) {
    return buildBlockedPricingWorkflow({
      runtime,
      workflow_id: input.workflow_id,
      workflowKind: WORKFLOW_KIND,
      organization_id,
      correlation_id,
      capability_id: capabilityId,
      created_at,
      evidenceRecords,
      steps,
      reason: 'no hay líneas en el presupuesto',
      clarification: {
        kind: 'request_clarification',
        missing: 'pricing',
        reason: 'Dime qué líneas quieres en el presupuesto (artículo, medidas y opciones de cada una).'
      }
    });
  }

  // Valora cada línea con el workflow de una línea (F1).
  const lineResults = lines.map((line, index) =>
    executePricingQuoteLineWorkflow(runtime, {
      kind: 'pricing.quote_line',
      workflow_id: `${input.workflow_id}:L${index + 1}`,
      correlation_id,
      organization_hint: input.organization_hint,
      principal_hint: input.principal_hint,
      requested_at,
      article: line.article,
      unidades: line.unidades ?? null,
      alto: line.alto ?? null,
      ancho: line.ancho ?? null,
      options: line.options ?? null,
      raw_message: normalizeOptionalString(line.text) ?? input.raw_message ?? null,
      capability_id: 'pricing.quote_line'
    })
  );

  const pricedLines: PricingQuoteDraftLine[] = [];
  const problems: string[] = [];
  lineResults.forEach((result, index) => {
    const data = result.response?.data as Record<string, unknown> | null;
    if (result.status === 'completed' && data && data.kind === 'pricing.quote_line') {
      pricedLines.push({
        article: lines[index].article,
        article_name: (data.article_name as string | null) ?? null,
        articulo_id: (data.articulo_id as string | number | null) ?? null,
        unidades: (data.unidades as number | null) ?? null,
        alto: (data.alto as number | null) ?? null,
        ancho: (data.ancho as number | null) ?? null,
        options_summary: (data.options_summary as string[] | null) ?? null,
        neto_total: (data.neto_total as number | null) ?? null,
        iva_amount: (data.iva_amount as number | null) ?? null,
        total: (data.total as number | null) ?? null
      });
      return;
    }
    const label =
      (data && typeof data.article_name === 'string' && data.article_name) ||
      normalizeOptionalString(lines[index].article) ||
      `línea ${index + 1}`;
    const clarificationReason = data && typeof data.reason === 'string' ? data.reason : null;
    const candidates = data && Array.isArray(data.candidates) ? (data.candidates as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const reason = clarificationReason ?? result.response?.message ?? 'no disponible';
    problems.push(`${label}: ${reason}${candidates.length > 0 ? ` (${candidates.join(', ')})` : ''}`);
  });

  if (problems.length > 0) {
    const reason = `Para el presupuesto me faltan datos:\n${problems.map((problem) => `· ${problem}`).join('\n')}`;
    return buildBlockedPricingWorkflow({
      runtime,
      workflow_id: input.workflow_id,
      workflowKind: WORKFLOW_KIND,
      organization_id,
      correlation_id,
      capability_id: capabilityId,
      created_at,
      evidenceRecords,
      steps,
      reason,
      clarification: {
        kind: 'request_clarification',
        missing: 'pricing',
        reason,
        fields: problems
      }
    });
  }

  const neto_total = round2(pricedLines.reduce((acc, line) => acc + (line.neto_total ?? 0), 0));
  const iva_amount = round2(pricedLines.reduce((acc, line) => acc + (line.iva_amount ?? 0), 0));
  const total = round2(pricedLines.reduce((acc, line) => acc + (line.total ?? 0), 0));

  const responseData = {
    kind: 'pricing.quote_draft' as const,
    customer,
    lines: pricedLines,
    neto_total,
    iva_amount,
    total
  };
  const response = createRuntimeResponse({
    kind: WORKFLOW_KIND,
    status: 'completed',
    message: 'PacoPrint draft calculated',
    data: responseData as unknown as Record<string, unknown>,
    runtimeDriven: true
  });
  const responseEvidence = runtime.appendWorkflowEvidence({
    organization_id,
    correlation_id,
    record_type: 'workflow_response_created',
    subject: capabilityId,
    data: { status: 'completed', line_count: pricedLines.length, total, response }
  });
  evidenceRecords.push(responseEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'response',
      status: 'completed',
      evidence_reference: responseEvidence.evidence_id,
      details: { line_count: pricedLines.length, total }
    })
  );
  return runtime.finishWorkflow({
    workflow_id: input.workflow_id,
    workflow_kind: WORKFLOW_KIND,
    organization_id,
    correlation_id,
    turn_id: null,
    status: 'completed',
    response,
    capability_result: null,
    evidenceRecords,
    steps,
    created_at,
    updated_at: runtime.now().toISOString()
  });
}
