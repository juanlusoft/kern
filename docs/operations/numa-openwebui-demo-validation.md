# Numa OpenWebUI demo validation

## Purpose

Validate the client-facing Numa demo from OpenWebUI before using it with a real client.

This is a manual acceptance checklist. It should be run with a non-admin OpenWebUI user.

## Preconditions

- OpenWebUI is reachable at `http://192.168.1.21:3001`.
- The user is `role=user`, not admin.
- The user can see exactly one model:
  - `Kern · Numa HR`
- The user is mapped in Kern through `X-OpenWebUI-User-Id`.
- `ENABLE_VERSION_UPDATE_CHECK=false`.
- `ui.enable_community_sharing=false`.
- `ui.enable_message_rating=true`.

If the demo is run from the client's own PC, use a temporary secure tunnel to OpenWebUI.

The tunnel must expose only the OpenWebUI surface, not:

- PostgreSQL;
- Kern runtime port;
- Docker socket;
- internal service ports.

The tunnel must be torn down after the demo unless there is an explicit operations decision to keep it.

## UI Checks

1. Open the model selector.
2. Confirm only `Kern · Numa HR` is visible.
3. Confirm no Pacoprint, Holded, MiPC or personal assistant models are visible.
4. Confirm home suggestions are Numa HR only.
5. Confirm no composer mic/voice controls are visible.
6. Send a test question.
7. Confirm response actions show only:
   - copy;
   - thumbs up;
   - thumbs down.
8. Confirm response actions do not show:
   - edit;
   - regenerate;
   - read aloud/audio.
9. Confirm no OpenWebUI update notice appears.

## Remote Client PC Checks

If using a tunnel:

1. Open the temporary tunnel URL from an external network.
2. Confirm it lands on OpenWebUI login.
3. Login with the non-admin demo/client user.
4. Confirm only `Kern · Numa HR` is visible.
5. Run at least one Numa HR question.
6. Tear down the tunnel.
7. Confirm the tunnel URL no longer works.

## Functional Questions

Run these first:

```text
Días de vacaciones de BEATRIZ VERA en 2025
```

```text
Qué fechas estuvo de vacaciones ALVARO GARCIA en 2025
```

```text
Cuántos días de asuntos propios tuvo AMADOR MOLINA OCAÑA el año pasado
```

```text
A qué hora ha fichado esta mañana EUGENIO MOYA
```

```text
Resumen de horas trabajadas de BEATRIZ VERA en julio de 2025
```

```text
Informe del mes de mayo de los trabajadores del centro Manindu
```

## Variable Employee Tests

Repeat some of the same questions with other real employees.

Examples:

```text
Qué fechas estuvo de vacaciones ALVARO GARCIA en 2025
```

```text
Qué fechas tuvo de asuntos propios AMADOR MOLINA OCAÑA en 2025
```

```text
Resumen de horas trabajadas de ALVARO GARCIA en julio de 2025
```

## Natural Language Variants

The user should not need exact hardcoded wording.

Validate variants:

```text
Cuándo estuvo de vacaciones BEATRIZ VERA el año pasado
```

```text
BEATRIZ VERA tuvo asuntos propios el año pasado?
```

```text
Cuántos días de vacaciones tuvo BEATRIZ VERA en 2025?
```

```text
Qué fichajes tiene BEATRIZ VERA hoy?
```

## Feedback Test

1. Click thumbs up on one answer.
2. Click thumbs down on another answer.
3. Run:

```bash
sudo /opt/openwebui/kern-daily-ops-report.sh
```

Expected:

- Positive count increases by one.
- Negative count increases by one.
- Counts are grouped under `kern-numa`.

Known limitation:

- OpenWebUI `0.10.2` may still open a detailed rating modal.
- This is pending production hardening and should be fixed with a Kern-owned OpenWebUI image/patch before production use.

## Fail-Closed Checks

These are technical checks and do not need to be run from the client browser.

Expected fail-closed behavior:

- Missing `X-OpenWebUI-User-Id` fails.
- Unknown `X-OpenWebUI-User-Id` fails.
- Request body cannot override `organization_id`.

## Pass Criteria

The validation passes when:

- The client user sees only the Numa model.
- The UI does not expose unrelated companies or internal controls.
- The six functional questions work.
- Variable employee questions work.
- Feedback is counted.
- No OpenWebUI update notices are visible.
