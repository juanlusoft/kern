import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryGovernedWorkflowRuntime } from '../src/runtime';
import { renderNumaHrResponseMessage } from '../src/numa-hr-response-renderer';
import type { IdentityContext, NumaHrReadPort, OrganizationContext, PresenceSourceCitation } from '../../contracts/src/index';

const base = {
  organization_id: 'numa',
  correlation_id: 'corr-1',
  row_count: 1,
  truncated: false,
  citations: [{ tables: ['test'], queryId: 'test', rowCount: 1, truncated: false }] as [PresenceSourceCitation]
};

function buildNumaOrganizationContext(): OrganizationContext {
  return {
    organization_id: 'numa',
    organization_state: 'active',
    source: 'test-fixture',
    resolved_at: '2026-07-01T00:00:00.000Z',
    isolation_boundary: 'boundary:numa',
    revocation_version: 1,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

function buildNumaIdentityContext(): IdentityContext {
  return {
    principal_id: 'principal-numa-smoke',
    principal_type: 'human',
    delegated_identity: null,
    scopes: ['read:knowledge'],
    auth_method: 'test',
    resolved_at: '2026-07-01T00:00:00.000Z',
    revocation_version: 1,
    resolution_state: 'resolved',
    failure_reason: null
  };
}

test('renders one deterministic business message for every Numa HR query', () => {
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'punch.day',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      date: '2026-07-01',
      records: [
        { punched_at: '2026-07-01T08:00:00.000Z', punching_point_id: 1, point_name: 'Oficina', direction: 'in' },
        { punched_at: '2026-07-01T16:30:00.000Z', punching_point_id: 1, point_name: 'Oficina', direction: 'out' }
      ],
      first_entry_at: '2026-07-01T08:00:00.000Z',
      last_exit_at: '2026-07-01T16:30:00.000Z',
      worked_minutes: 510
    }),
    'Fichajes de Ana el 2026-07-01:\n- Entrada: 2026-07-01T08:00:00.000Z (Oficina)\n- Salida: 2026-07-01T16:30:00.000Z (Oficina)\nTiempo trabajado: 8 h 30 min'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'leave.days',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      year: 2026,
      time_type_ids: [5],
      include_pending: true,
      records: [{ time_type_id: 5, time_type_name: 'Vacaciones', days_disfrutados: 4, days_pendientes: 1 }]
    }),
    'Ausencias de Ana en 2026:\n- Vacaciones: 4 dias disfrutados; 1 dias pendientes.'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'leave.balance',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      year: 2026,
      time_type_ids: [5],
      include_pending: true,
      records: [{ time_type_id: 5, time_type_name: 'Vacaciones', annual_quota: 22, days_disfrutados: 4, days_pendientes: 1, balance: 18, message: null }]
    }),
    'Saldo de ausencias de Ana en 2026:\n- Vacaciones: cuota 22 dias; 4 dias disfrutados; saldo 18 dias.'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'worktime.summary',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      date_from: '2026-07-01',
      date_to: '2026-07-01',
      theoretical_workday_minutes: 480,
      records: [
        {
          work_date: '2026-07-01',
          first_entry_at: '2026-07-01T08:00:00.000Z',
          last_exit_at: '2026-07-01T16:30:00.000Z',
          punch_count: 2,
          worked_minutes: 510,
          theoretical_minutes: 480,
          overtime_minutes: 30
        }
      ],
      total_worked_minutes: 510,
      total_overtime_minutes: 30
    }),
    'Resumen de jornada de Ana entre 2026-07-01 y 2026-07-01:\n- 2026-07-01: entrada 2026-07-01T08:00:00.000Z; salida 2026-07-01T16:30:00.000Z; 2 fichajes; 8 h 30 min trabajados; jornada teorica 8 h 00 min; saldo 0 h 30 min.\nTotal trabajado: 8 h 30 min; saldo total 0 h 30 min.'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'report.month-by-group',
      group_id: 'group-1',
      group_name: 'Ventas',
      year: 2026,
      month: 7,
      limit: 25,
      offset: 0,
      employee_count: 1,
      records: [{ employee_id: 'employee-1', employee_name: 'Ana', days_with_punch: 20, worked_minutes: 9600, leave_days: 1, vacation_days: 1, active: true }]
    }),
    'Informe de Ventas para 2026-7:\n- Ana: 20 dias con fichaje; 160 h 00 min trabajados; 1 dias de ausencia; 1 dias de vacaciones; activo.'
  );
});

test('renders explicit empty, truncated, and missing balance messages', () => {
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'leave.days',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      year: 2026,
      time_type_ids: [5],
      include_pending: false,
      records: [{ time_type_id: 5, time_type_name: 'Vacaciones', days_disfrutados: 4, days_pendientes: 1 }]
    }),
    'Ausencias de Ana en 2026:\n- Vacaciones: 4 dias disfrutados.'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'leave.days',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      year: 2026,
      time_type_ids: [5],
      include_pending: false,
      records: []
    }),
    'No hay registros de ausencias para Ana en 2026.'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'punch.day',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      date: '2026-07-01',
      records: [{ punched_at: '2026-07-01T08:00:00.000Z', punching_point_id: null, point_name: null, direction: 'in' }],
      first_entry_at: '2026-07-01T08:00:00.000Z',
      last_exit_at: null,
      worked_minutes: 0,
      truncated: true
    }),
    'Fichajes de Ana el 2026-07-01:\n- Entrada: 2026-07-01T08:00:00.000Z\nNota: el resultado esta truncado; se muestran solo los registros disponibles.'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'leave.balance',
      employee_id: 'employee-1',
      employee_name: 'Ana',
      year: 2026,
      time_type_ids: [6],
      include_pending: false,
      records: [
        {
          time_type_id: 6,
          time_type_name: 'Asuntos propios',
          annual_quota: null,
          days_disfrutados: 2,
          days_pendientes: null,
          balance: null,
          message: 'cupo anual no configurado para Asuntos propios'
        }
      ]
    }),
    'Saldo de ausencias de Ana en 2026:\n- Asuntos propios: cupo anual no configurado para Asuntos propios'
  );
});

test('renders HR resolution ambiguity and not-found messages before empty-data messages', () => {
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'punch.day',
      employee_id: null,
      employee_name: 'Ana',
      date: '2026-07-01',
      records: [],
      first_entry_at: null,
      last_exit_at: null,
      worked_minutes: null,
      row_count: 2,
      resolution_status: 'ambiguous',
      resolution_message: 'He encontrado varios resultados para "Ana". Necesito que concretes el trabajador.',
      resolution_candidates: [{ name: 'Ana Garc\u00EDa' }, { name: 'Ana Mar\u00EDa' }]
    }),
    'He encontrado varios resultados para "Ana". Necesito que concretes el trabajador.\n- Ana Garc\u00EDa\n- Ana Mar\u00EDa'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'leave.days',
      employee_id: null,
      employee_name: 'No Existe',
      year: 2026,
      time_type_ids: [5],
      include_pending: false,
      records: [],
      row_count: 0,
      resolution_status: 'not_found',
      resolution_message: 'No he encontrado trabajador para "No Existe".',
      resolution_candidates: []
    }),
    'No he encontrado trabajador para "No Existe".'
  );
  assert.equal(
    renderNumaHrResponseMessage({
      ...base,
      query_id: 'report.month-by-group',
      group_id: null,
      group_name: 'MANINDU',
      year: 2026,
      month: 5,
      limit: 25,
      offset: 0,
      employee_count: 0,
      records: [],
      row_count: 2,
      resolution_status: 'ambiguous',
      resolution_message: 'He encontrado varios resultados para "MANINDU". Necesito que concretes el centro.',
      resolution_candidates: [{ name: 'MANINDU MARTOS' }, { name: 'MANINDU JAEN' }],
      truncated: true
    }),
    'He encontrado varios resultados para "MANINDU". Necesito que concretes el centro.\n- MANINDU MARTOS\n- MANINDU JAEN\nNota: el resultado esta truncado; se muestran solo los registros disponibles.'
  );
});

test('returns null for unknown and malformed payloads', () => {
  assert.equal(renderNumaHrResponseMessage({ query_id: 'other', records: [], truncated: false }), null);
  assert.equal(renderNumaHrResponseMessage({ query_id: 'punch.day', records: 'not-an-array', truncated: false }), null);
  assert.equal(renderNumaHrResponseMessage(null), null);
});

test('uses the rendered message without changing response data and retains the fallback', () => {
  const punchResult = {
    ...base,
    query_id: 'punch.day' as const,
    employee_id: 'employee-1',
    employee_name: 'Ana',
    date: '2026-07-01',
    records: [{ punched_at: '2026-07-01T08:00:00.000Z', punching_point_id: 1, point_name: 'Oficina', direction: 'in' as const }],
    first_entry_at: '2026-07-01T08:00:00.000Z',
    last_exit_at: null,
    worked_minutes: 0
  };
  const port: NumaHrReadPort = {
    punchDay: () => punchResult,
    leaveDays: () => ({ ...base, query_id: 'leave.days', employee_id: null, employee_name: null, year: 2026, time_type_ids: [], include_pending: false, records: [] }),
    leaveBalance: () => ({ ...base, query_id: 'leave.balance', employee_id: null, employee_name: null, year: 2026, time_type_ids: [], include_pending: false, records: [] }),
    worktimeSummary: () => ({ ...base, query_id: 'worktime.summary', employee_id: null, employee_name: null, date_from: '2026-07-01', date_to: '2026-07-01', theoretical_workday_minutes: null, records: [], total_worked_minutes: 0, total_overtime_minutes: null }),
    reportMonthByGroup: () => ({ ...base, query_id: 'report.month-by-group', group_id: null, group_name: null, year: 2026, month: 7, limit: 25, offset: 0, employee_count: 0, records: [] })
  };
  const runtime = new InMemoryGovernedWorkflowRuntime({
    hrReadPort: port,
    organization_id: 'numa',
    now: () => new Date('2026-07-01T00:00:00.000Z'),
    resolveOrganizationContext: buildNumaOrganizationContext,
    resolveIdentityContext: buildNumaIdentityContext
  });
  const rendered = runtime.executeWorkflow({
    kind: 'numa.hr.read',
    workflow_id: 'workflow-rendered',
    organization_hint: 'numa',
    principal_hint: 'human-001',
    correlation_id: 'corr-rendered',
    capability_id: 'punch.day',
    params: { employee_name: 'Ana', date: '2026-07-01' }
  });
  const renderedResponseRecord = runtime
    .getEvidenceLedger()
    .listByCorrelation(rendered.correlation_id)
    .find((record) => record.record_type === 'workflow_response_created');
  assert.equal(rendered.response.message, 'Fichajes de Ana el 2026-07-01:\n- Entrada: 2026-07-01T08:00:00.000Z (Oficina)\nTiempo trabajado: 0 h 00 min');
  assert.deepEqual(rendered.response.data, punchResult);
  assert.equal((renderedResponseRecord?.data as { response?: { message?: string } } | undefined)?.response?.message, rendered.response.message);

  const malformedPort = { ...port, punchDay: () => ({ query_id: 'unknown' }) } as unknown as NumaHrReadPort;
  const fallbackRuntime = new InMemoryGovernedWorkflowRuntime({
    hrReadPort: malformedPort,
    organization_id: 'numa',
    now: () => new Date('2026-07-01T00:00:00.000Z'),
    resolveOrganizationContext: buildNumaOrganizationContext,
    resolveIdentityContext: buildNumaIdentityContext
  });
  const fallback = fallbackRuntime.executeWorkflow({
    kind: 'numa.hr.read',
    workflow_id: 'workflow-fallback',
    organization_hint: 'numa',
    principal_hint: 'human-001',
    correlation_id: 'corr-fallback',
    capability_id: 'punch.day',
    params: { date: '2026-07-01' }
  });
  assert.equal(fallback.response.message, 'capability executed');
});
