type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asRecords(value: unknown): UnknownRecord[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const records = value.map(asRecord);
  return records.every((record): record is UnknownRecord => record !== null) ? records : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown): string | null | undefined {
  return value === null ? null : asString(value) ?? undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableNumber(value: unknown): number | null | undefined {
  return value === null ? null : asNumber(value) ?? undefined;
}

function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const absoluteMinutes = Math.abs(Math.trunc(minutes));
  return `${sign}${Math.floor(absoluteMinutes / 60)} h ${String(absoluteMinutes % 60).padStart(2, '0')} min`;
}

function appendTruncationNotice(message: string, truncated: boolean): string {
  return truncated ? `${message}\nNota: el resultado esta truncado; se muestran solo los registros disponibles.` : message;
}

function renderResolutionMessage(data: UnknownRecord, truncated: boolean): string | null {
  const status = data.resolution_status;
  if (status !== 'ambiguous' && status !== 'not_found') {
    return null;
  }
  const message = asNullableString(data.resolution_message);
  if (!message) {
    return null;
  }
  const candidates = asRecords(data.resolution_candidates);
  if (status === 'not_found' || !candidates || candidates.length === 0) {
    return appendTruncationNotice(message, truncated);
  }
  const renderedCandidates = candidates
    .map((candidate) => asString(candidate.name))
    .filter((candidate): candidate is string => candidate !== null)
    .map((candidate) => `- ${candidate}`);
  if (renderedCandidates.length === 0) {
    return appendTruncationNotice(message, truncated);
  }
  return appendTruncationNotice(`${message}\n${renderedCandidates.join('\n')}`, truncated);
}

function employeeName(value: unknown): string | null | undefined {
  return asNullableString(value);
}

function renderPunchDay(data: UnknownRecord, records: UnknownRecord[], truncated: boolean): string | null {
  const name = employeeName(data.employee_name);
  const date = asString(data.date);
  const workedMinutes = asNullableNumber(data.worked_minutes);
  if (name === undefined || date === null || workedMinutes === undefined) {
    return null;
  }
  const renderedRecords = records.map((record) => {
    const punchedAt = asString(record.punched_at);
    const pointName = asNullableString(record.point_name);
    const direction = record.direction;
    if (punchedAt === null || pointName === undefined || (direction !== 'in' && direction !== 'out' && direction !== 'neutral')) {
      return null;
    }
    const action = direction === 'in' ? 'Entrada' : direction === 'out' ? 'Salida' : 'Fichaje';
    return `- ${action}: ${punchedAt}${pointName === null ? '' : ` (${pointName})`}`;
  });
  if (renderedRecords.some((record) => record === null)) {
    return null;
  }
  const subject = name ?? 'la persona consultada';
  if (renderedRecords.length === 0) {
    return appendTruncationNotice(`No hay fichajes registrados para ${subject} el ${date}.`, truncated);
  }
  const summary = !truncated && workedMinutes !== null ? `\nTiempo trabajado: ${formatMinutes(workedMinutes)}` : '';
  return appendTruncationNotice(`Fichajes de ${subject} el ${date}:\n${renderedRecords.join('\n')}${summary}`, truncated);
}

function renderLeaveDays(data: UnknownRecord, records: UnknownRecord[], truncated: boolean): string | null {
  const name = employeeName(data.employee_name);
  const year = asNumber(data.year);
  const includePending = data.include_pending;
  if (name === undefined || year === null || typeof includePending !== 'boolean') {
    return null;
  }
  const renderedRecords = records.map((record) => {
    const timeTypeName = asNullableString(record.time_type_name);
    const usedDays = asNumber(record.days_disfrutados);
    const pendingDays = asNullableNumber(record.days_pendientes);
    if (timeTypeName === undefined || usedDays === null || pendingDays === undefined) {
      return null;
    }
    const label = timeTypeName ?? 'Tipo de ausencia';
    const pending = includePending && pendingDays !== null ? `; ${pendingDays} dias pendientes` : '';
    return `- ${label}: ${usedDays} dias disfrutados${pending}.`;
  });
  if (renderedRecords.some((record) => record === null)) {
    return null;
  }
  const subject = name ?? 'la persona consultada';
  if (renderedRecords.length === 0) {
    return appendTruncationNotice(`No hay registros de ausencias para ${subject} en ${year}.`, truncated);
  }
  return appendTruncationNotice(`Ausencias de ${subject} en ${year}:\n${renderedRecords.join('\n')}`, truncated);
}

function renderLeaveBalance(data: UnknownRecord, records: UnknownRecord[], truncated: boolean): string | null {
  const name = employeeName(data.employee_name);
  const year = asNumber(data.year);
  if (name === undefined || year === null) {
    return null;
  }
  const renderedRecords = records.map((record) => {
    const timeTypeName = asNullableString(record.time_type_name);
    const quota = asNullableNumber(record.annual_quota);
    const usedDays = asNumber(record.days_disfrutados);
    const balance = asNullableNumber(record.balance);
    const message = asNullableString(record.message);
    if (timeTypeName === undefined || quota === undefined || usedDays === null || balance === undefined || message === undefined) {
      return null;
    }
    const label = timeTypeName ?? 'Tipo de ausencia';
    if (quota === null || balance === null) {
      return `- ${label}: ${message ?? 'cupo y saldo no disponibles.'}`;
    }
    return `- ${label}: cuota ${quota} dias; ${usedDays} dias disfrutados; saldo ${balance} dias.`;
  });
  if (renderedRecords.some((record) => record === null)) {
    return null;
  }
  const subject = name ?? 'la persona consultada';
  if (renderedRecords.length === 0) {
    return appendTruncationNotice(`No hay saldos de ausencias para ${subject} en ${year}.`, truncated);
  }
  return appendTruncationNotice(`Saldo de ausencias de ${subject} en ${year}:\n${renderedRecords.join('\n')}`, truncated);
}

function renderWorktimeSummary(data: UnknownRecord, records: UnknownRecord[], truncated: boolean): string | null {
  const name = employeeName(data.employee_name);
  const dateFrom = asString(data.date_from);
  const dateTo = asString(data.date_to);
  const totalWorkedMinutes = asNumber(data.total_worked_minutes);
  const totalOvertimeMinutes = asNullableNumber(data.total_overtime_minutes);
  if (name === undefined || dateFrom === null || dateTo === null || totalWorkedMinutes === null || totalOvertimeMinutes === undefined) {
    return null;
  }
  const renderedRecords = records.map((record) => {
    const date = asString(record.work_date);
    const firstEntry = asNullableString(record.first_entry_at);
    const lastExit = asNullableString(record.last_exit_at);
    const punchCount = asNumber(record.punch_count);
    const workedMinutes = asNumber(record.worked_minutes);
    const theoreticalMinutes = asNullableNumber(record.theoretical_minutes);
    const overtimeMinutes = asNullableNumber(record.overtime_minutes);
    if (
      date === null ||
      firstEntry === undefined ||
      lastExit === undefined ||
      punchCount === null ||
      workedMinutes === null ||
      theoreticalMinutes === undefined ||
      overtimeMinutes === undefined
    ) {
      return null;
    }
    const theoretical = theoreticalMinutes === null ? '' : `; jornada teorica ${formatMinutes(theoreticalMinutes)}`;
    const overtime = overtimeMinutes === null ? '' : `; saldo ${formatMinutes(overtimeMinutes)}`;
    return `- ${date}: entrada ${firstEntry ?? 'sin registro'}; salida ${lastExit ?? 'sin registro'}; ${punchCount} fichajes; ${formatMinutes(workedMinutes)} trabajados${theoretical}${overtime}.`;
  });
  if (renderedRecords.some((record) => record === null)) {
    return null;
  }
  const subject = name ?? 'la persona consultada';
  if (renderedRecords.length === 0) {
    return appendTruncationNotice(`No hay registros de jornada para ${subject} entre ${dateFrom} y ${dateTo}.`, truncated);
  }
  const total = !truncated
    ? `\nTotal trabajado: ${formatMinutes(totalWorkedMinutes)}${totalOvertimeMinutes === null ? '' : `; saldo total ${formatMinutes(totalOvertimeMinutes)}`}.`
    : '';
  return appendTruncationNotice(`Resumen de jornada de ${subject} entre ${dateFrom} y ${dateTo}:\n${renderedRecords.join('\n')}${total}`, truncated);
}

function renderReportMonthByGroup(data: UnknownRecord, records: UnknownRecord[], truncated: boolean): string | null {
  const groupName = employeeName(data.group_name);
  const year = asNumber(data.year);
  const month = asNumber(data.month);
  const employeeCount = asNumber(data.employee_count);
  if (groupName === undefined || year === null || month === null || employeeCount === null) {
    return null;
  }
  const renderedRecords = records.map((record) => {
    const name = asString(record.employee_name);
    const daysWithPunch = asNumber(record.days_with_punch);
    const workedMinutes = asNullableNumber(record.worked_minutes);
    const leaveDays = asNullableNumber(record.leave_days);
    const vacationDays = asNullableNumber(record.vacation_days);
    const active = record.active;
    if (name === null || daysWithPunch === null || workedMinutes === undefined || leaveDays === undefined || vacationDays === undefined || typeof active !== 'boolean') {
      return null;
    }
    const worked = workedMinutes === null ? 'tiempo trabajado no disponible' : `${formatMinutes(workedMinutes)} trabajados`;
    const leave = leaveDays === null ? 'ausencias no disponibles' : `${leaveDays} dias de ausencia`;
    const vacation = vacationDays === null ? 'vacaciones no disponibles' : `${vacationDays} dias de vacaciones`;
    return `- ${name}: ${daysWithPunch} dias con fichaje; ${worked}; ${leave}; ${vacation}; ${active ? 'activo' : 'inactivo'}.`;
  });
  if (renderedRecords.some((record) => record === null)) {
    return null;
  }
  const group = groupName ?? 'el grupo seleccionado';
  if (renderedRecords.length === 0) {
    return appendTruncationNotice(`No hay registros para ${group} en ${year}-${month}.`, truncated);
  }
  return appendTruncationNotice(`Informe de ${group} para ${year}-${month}:\n${renderedRecords.join('\n')}`, truncated);
}

export function renderNumaHrResponseMessage(data: unknown): string | null {
  const result = asRecord(data);
  if (!result || typeof result.truncated !== 'boolean') {
    return null;
  }
  const resolutionMessage = renderResolutionMessage(result, result.truncated);
  if (resolutionMessage) {
    return resolutionMessage;
  }
  const records = asRecords(result.records);
  if (!records) {
    return null;
  }
  if (result.query_id === 'punch.day') {
    return renderPunchDay(result, records, result.truncated);
  }
  if (result.query_id === 'leave.days') {
    return renderLeaveDays(result, records, result.truncated);
  }
  if (result.query_id === 'leave.balance') {
    return renderLeaveBalance(result, records, result.truncated);
  }
  if (result.query_id === 'worktime.summary') {
    return renderWorktimeSummary(result, records, result.truncated);
  }
  if (result.query_id === 'report.month-by-group') {
    return renderReportMonthByGroup(result, records, result.truncated);
  }
  return null;
}
