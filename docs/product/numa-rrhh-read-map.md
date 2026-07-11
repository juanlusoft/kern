# Numa RRHH read map

## Purpose

This document defines how Kern should grow from a small Numa demo into a safe RRHH read assistant.

The goal is not to let the model query the database freely. The goal is to support many RRHH questions through a closed catalog of read-only capabilities.

## Non-goals

- No model-generated SQL.
- No writes to the Numa database.
- No cross-client logic with Pacoprint, Holded, Telegram, or future customers.
- No fallback organizations, demo users, or invented identifiers.
- No direct exposure of database table names or internal ids to the user unless a capability explicitly requires it.

## Current safe capabilities

| Capability | Functional area | User questions covered |
| --- | --- | --- |
| `punch.day` | Fichajes | Fichajes, primera entrada, ultima salida, horas trabajadas for one worker and one date. |
| `leave.days` | Ausencias | Days used/pending by worker, year, and configured absence type labels. |
| `leave.balance` | Saldos | Annual quota, used days, and remaining balance by worker, year, and configured absence type labels. |
| `worktime.summary` | Jornadas | Worked time summary by worker and date range. |
| `report.month-by-group` | Centros/grupos | Monthly group/center summary with worked days, leave days, vacation days, and worked minutes. |

## Functional sections

### Employees

Purpose: identify and disambiguate workers before reading RRHH data.

Already supported internally:

- Resolve employee names before data queries.
- Fail closed on ambiguous names.
- Fail closed when no worker exists.

Future capabilities:

- `employee.search`
- `employee.profile`
- `employee.by-group`

Example questions:

- "Busca trabajadores llamados Juan."
- "Quienes trabajan en Manindu?"
- "A que centro pertenece Eugenio Moya?"

### Groups and centers

Purpose: identify Numa groups/centers and use them as scope.

Already supported internally:

- Resolve group names before `report.month-by-group`.
- Fail closed on ambiguous group names.

Future capabilities:

- `group.search`
- `group.profile`
- `group.employees`

Example questions:

- "Que centros hay?"
- "Busca centros que contengan Manindu."
- "Lista los trabajadores del centro Manindu Martos."

### Punches

Purpose: read clock-in/clock-out data.

Already supported:

- `punch.day`
- `worktime.summary`

Future capabilities:

- `punch.range`
- `punch.anomalies`
- `punch.missing-days`

Example questions:

- "A que hora entro Eugenio el 1 de julio?"
- "Dame los fichajes de Mariola en mayo."
- "Que dias no ficho Juan en junio?"
- "Quien entro tarde ayer?"

### Absences

Purpose: read vacations, personal days, and other configured time types.

Already supported:

- `leave.days`
- `leave.balance`

Next priority:

- `leave.detail`

Future capabilities:

- `leave.by-range`
- `leave.by-group`
- `leave.pending`
- `leave.type-summary`

Example questions:

- "Que dias estuvo de vacaciones Eugenio en 2025?"
- "Que ausencias tuvo Mariola en mayo?"
- "Quien tiene vacaciones aprobadas la semana que viene?"
- "Cuantos asuntos propios ha usado Ana este ano?"

### Worktime and schedules

Purpose: compare actual punches and worked minutes against expected workday rules when the database/config supports it.

Already supported:

- `worktime.summary`

Future capabilities:

- `worktime.deviation`
- `worktime.overtime`
- `worktime.group-summary`

Example questions:

- "Cuantas horas hizo Eugenio la semana pasada?"
- "Quien tiene mas horas extra este mes?"
- "Que dias trabajo menos de la jornada teorica?"

### Requests and validations

Purpose: read RRHH requests if the database contains validation status and request metadata.

Future capabilities:

- `request.search`
- `request.status`
- `request.pending-by-validator`

Example questions:

- "Que solicitudes pendientes tiene Eugenio?"
- "Que vacaciones estan pendientes de aprobar?"
- "Quien aprobo la ausencia de Mariola?"

### Catalogs and configuration

Purpose: help the user understand what can be asked without exposing raw schema.

Future capabilities:

- `time-type.search`
- `time-type.list`
- `supported-question.list`

Example questions:

- "Que tipos de ausencia hay?"
- "Que preguntas puedes responder sobre RRHH?"
- "Como se llama en el sistema asuntos propios?"

## Priority backlog

### P0 - Demo reliability

1. `leave.detail`
   - Answer exact dates/ranges for vacations, personal days, and other configured absence labels.
   - Reuse existing employee resolution and time type config.
   - Keep SQL closed and parameter-bound.

2. `punch.range`
   - Answer punch timelines over a date range.
   - Reuse existing employee resolution.
   - Enforce maximum date range and truncation metadata.

3. `employee.search`
   - Let the assistant clarify ambiguous workers using real candidates.
   - Do not expose unnecessary internal ids.

### P1 - RRHH usefulness

4. `group.employees`
   - List workers in a center/group.

5. `leave.by-group`
   - Summaries of absences by center/group and date range.

6. `worktime.deviation`
   - Days with missing punches, short days, or overtime when enough data exists.

### P2 - Operational visibility

7. `time-type.list`
   - Show configured time types available to the assistant.

8. `request.status`
   - Read validation state of requests if the real Numa schema is confirmed.

## Capability design rules

Each new RRHH capability must include:

- A narrow business purpose.
- A closed SQL statement or a fixed set of named statements.
- Parameter binding only.
- `company_id` scoping resolved from logical `organization_id`.
- Employee/group/time-type deterministic resolution before the data query.
- `row_count`, `truncated`, `queryId`, `tables`, and correlation evidence.
- A renderer path that produces a useful business answer.
- Tests for happy path, no data, ambiguous input, missing config, and scope.

## Fail-closed rules

Return a blocking/clarifying result instead of querying when:

- The user does not provide enough date/range information.
- The employee or group name is ambiguous.
- The employee or group does not exist.
- The absence/time type label is not configured.
- The requested area has no supported capability.
- The requested date range exceeds the safe limit.
- Required config or mapping is missing.

## Naming note

The codebase currently uses `HR` for Human Resources. Product-facing documentation may use `RRHH` when speaking about the business domain. Code may continue using `NumaHr*` unless a larger rename is planned separately.

