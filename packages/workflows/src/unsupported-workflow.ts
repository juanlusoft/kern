import {
  createEvidenceRecord,
  normalizeCorrelationId,
  type GovernedWorkflowRequestBase,
  type GovernedWorkflowResult,
  type WorkflowStep
} from '../../contracts/src/index';
import { buildWorkflowStep, createRuntimeResponse } from './workflow-internals';
import type { WorkflowRuntimeContext } from './workflow-runtime-context';

/**
 * Petición cuyo `kind` no corresponde a ningún workflow declarado por esta
 * instalación. El tipo es deliberadamente laxo porque el valor llega desde
 * fuera del sistema de tipos (propuesta del modelo, canal, payload externo).
 */
export type UnsupportedWorkflowInput = GovernedWorkflowRequestBase & { kind?: unknown };

const UNSUPPORTED_WORKFLOW_MESSAGE = 'workflow kind not supported by this installation';
const MAX_REPORTED_KIND_LENGTH = 64;

/**
 * El `kind` recibido es texto no confiable. Solo se registra una forma acotada
 * y sin caracteres de control, y nunca se acompaña del payload de la petición:
 * el resto de campos puede contener datos de negocio o personales.
 */
function normalizeReportedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const printable = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (printable.length === 0) {
    return null;
  }
  return printable.length > maxLength ? `${printable.slice(0, maxLength)}…` : printable;
}

/**
 * Fail-closed del despacho de workflows (ADR-0002 §2.5, ADR-0006 §3.6).
 *
 * Un `kind` no reconocido no se resuelve con el workflow de ninguna empresa
 * concreta: se registra en el ledger con el contexto necesario para
 * diagnosticarlo y se devuelve un resultado `unavailable` sin datos.
 */
export function executeUnsupportedWorkflow(runtime: WorkflowRuntimeContext, input: UnsupportedWorkflowInput): GovernedWorkflowResult {
  const correlation_id = normalizeCorrelationId({ request_id: input.workflow_id, correlation_id: input.correlation_id ?? null });
  const created_at = runtime.now().toISOString();
  const organization_hint = normalizeReportedText(input.organization_hint, 128);
  const organization_id = runtime.installationOrganizationId ?? 'unknown';
  const requested_kind = normalizeReportedText(input.kind, MAX_REPORTED_KIND_LENGTH);

  const diagnosticContext = {
    workflow_id: input.workflow_id,
    correlation_id,
    organization_hint,
    requested_kind,
    reason: UNSUPPORTED_WORKFLOW_MESSAGE
  };

  const steps: WorkflowStep[] = [];
  const evidenceRecords: { evidence_id: string; record_type: string }[] = [];

  const failedClosedEvidence = runtime.evidenceLedger.append(
    createEvidenceRecord({
      organization_id,
      correlation_id,
      record_type: 'failed_closed',
      subject: 'workflow_kind_unsupported',
      data: diagnosticContext,
      created_at
    })
  );
  evidenceRecords.push(failedClosedEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'intent',
      status: 'unavailable',
      evidence_reference: failedClosedEvidence.evidence_id,
      details: { requested_kind }
    })
  );

  const response = createRuntimeResponse({
    kind: null,
    status: 'unavailable',
    message: UNSUPPORTED_WORKFLOW_MESSAGE,
    data: null,
    runtimeDriven: false
  });

  const responseEvidence = runtime.appendWorkflowEvidence({
    organization_id,
    correlation_id,
    record_type: 'workflow_response_created',
    subject: 'workflow_kind_unsupported',
    data: { status: 'unavailable', ...diagnosticContext, response }
  });
  evidenceRecords.push(responseEvidence);
  steps.push(
    buildWorkflowStep({
      step_kind: 'response',
      status: 'unavailable',
      evidence_reference: responseEvidence.evidence_id,
      details: { reason: UNSUPPORTED_WORKFLOW_MESSAGE }
    })
  );

  return runtime.finishWorkflow({
    workflow_id: input.workflow_id,
    workflow_kind: null,
    organization_id: runtime.installationOrganizationId,
    correlation_id,
    turn_id: null,
    status: 'unavailable',
    response,
    capability_result: null,
    evidenceRecords,
    steps,
    created_at,
    updated_at: runtime.now().toISOString()
  });
}
