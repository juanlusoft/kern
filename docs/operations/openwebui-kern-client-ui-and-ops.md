# OpenWebUI Kern client UI and operations

## Scope

This runbook documents the OpenWebUI customization used for Kern demo/client usage on the Spark.

It covers:

- Visible message actions.
- User feedback collection.
- Update notifications.
- Internal daily operations report.
- Rollback and verification commands.

It does not change Kern runtime code, HR/Postgres SQL, Pacoprint, Telegram, Holded or frontend code in the Kern repository.

## Installation paths

Current OpenWebUI installation paths on the Spark:

```text
/opt/openwebui/
  docker-compose.yml
  branding/
    custom.css
    start-kern.sh
  data/
    webui.db
  reports/
  check-openwebui-update.sh
  kern-daily-ops-report.sh
```

Do not store passwords, API keys or private tokens in this document or in generated reports.

## Message action buttons

Client-facing assistant responses should expose only:

- Copy message.
- Good response.
- Bad response.

The current customization is served from:

```text
/opt/openwebui/branding/custom.css
```

It is copied into the OpenWebUI container on startup by:

```text
/opt/openwebui/branding/start-kern.sh
```

The active CSS hides:

- Edit actions by semantic labels.
- Read aloud / audio actions by semantic labels.
- Regenerate actions by the OpenWebUI `0.10.2` message action classes.

Relevant selector for regenerate:

```css
.buttons > button.regenerate-response-button,
.buttons > button.regenerate-response-button + span[role="button"] {
  display: none !important;
}
```

This keeps:

```text
button.copy-response-button
button[aria-label="Good Response"]
button[aria-label="Bad Response"]
```

### Verify button customization

```bash
curl -fsS http://127.0.0.1:3001/static/custom.css
```

Then hard-refresh the browser:

```text
Ctrl+F5
```

Expected result in the response action bar:

```text
copy, thumbs up, thumbs down
```

No edit, audio/read-aloud or regenerate action should be visible.

## Feedback collection

OpenWebUI stores user ratings in:

```text
/opt/openwebui/data/webui.db
```

Table:

```text
feedback
```

The operational report reads only non-content fields:

- `created_at`
- `user_id` as opaque id
- `data.rating`
- `data.model_id` / `meta.model_id`

It must not read:

- Chat content.
- Message content.
- `snapshot`.
- User email/name unless a future explicit requirement needs it.

Safe feedback aggregate query:

```sql
SELECT
  date(created_at, 'unixepoch', 'localtime') AS day,
  COALESCE(json_extract(data, '$.model_id'), json_extract(meta, '$.model_id'), '[sin modelo]') AS model_id,
  SUM(CASE WHEN CAST(json_extract(data, '$.rating') AS INTEGER) > 0 THEN 1 ELSE 0 END) AS positive,
  SUM(CASE WHEN CAST(json_extract(data, '$.rating') AS INTEGER) < 0 THEN 1 ELSE 0 END) AS negative,
  COUNT(*) AS total
FROM feedback
GROUP BY day, model_id
ORDER BY day, model_id;
```

## Update notifications

Client-facing update notifications are disabled with:

```yaml
ENABLE_VERSION_UPDATE_CHECK: "false"
```

Location:

```text
/opt/openwebui/docker-compose.yml
```

Reason:

- Clients should not receive upstream OpenWebUI update prompts.
- Updates must be reviewed internally, tested, adjusted for Kern branding/customizations, and deployed transparently.

OpenWebUI `0.10.2` exposes update checking through `ENABLE_VERSION_UPDATE_CHECK`.

Operational note:

- With update checks disabled, the panel should not notify clients about upstream updates.
- Internal update awareness is handled by `/opt/openwebui/check-openwebui-update.sh`.

## Internal update check

Run:

```bash
sudo /opt/openwebui/check-openwebui-update.sh openwebui
```

Expected output includes:

```text
status=up-to-date
```

or:

```text
status=update-available
```

If an update is available:

1. Review OpenWebUI release notes and breaking changes.
2. Back up `/opt/openwebui/data` and `/opt/openwebui/branding`.
3. Recreate/update the container during a maintenance window.
4. Verify:
   - Login.
   - Kern model visibility.
   - `X-OpenWebUI-User-Id` forwarding.
   - Numa smoke questions.
   - Client message buttons.
   - Feedback recording.
   - Update notices remain hidden to clients.

## Daily operations report

Run:

```bash
sudo /opt/openwebui/kern-daily-ops-report.sh
```

Optional date:

```bash
sudo /opt/openwebui/kern-daily-ops-report.sh 2026-07-11
```

Report path:

```text
/opt/openwebui/reports/YYYY-MM-DD-openwebui-kern-report.txt
```

The report currently includes:

- Positive/negative feedback counts by model and day.
- OpenWebUI image/update status.

Example verified on `2026-07-11`:

```text
model_id: kern-numa
positive: 1
negative: 1
total: 2
status: up-to-date
```

## Restart OpenWebUI

```bash
cd /opt/openwebui
sudo docker compose up -d
```

Verify:

```bash
curl -fsS -o /tmp/openwebui-index.html -w 'http=%{http_code}\n' http://127.0.0.1:3001/
sudo docker exec openwebui sh -lc 'env | grep "^ENABLE_VERSION_UPDATE_CHECK="'
curl -fsS http://127.0.0.1:3001/static/custom.css
```

Expected:

```text
http=200
ENABLE_VERSION_UPDATE_CHECK=false
custom.css contains regenerate-response-button selector
```

## Rollback

Backups created during this customization:

```text
/opt/openwebui/docker-compose.yml.bak-disable-update-notices-20260711-185908
/opt/openwebui/branding/start-kern.sh.bak-ui-actions-20260711-183844
```

Rollback update notification behavior:

```bash
sudo cp /opt/openwebui/docker-compose.yml.bak-disable-update-notices-20260711-185908 /opt/openwebui/docker-compose.yml
cd /opt/openwebui
sudo docker compose up -d
```

Rollback message button customization:

```bash
sudo sh -c ': > /opt/openwebui/branding/custom.css'
sudo docker cp /opt/openwebui/branding/custom.css openwebui:/app/backend/open_webui/static/custom.css
sudo docker cp /opt/openwebui/branding/custom.css openwebui:/app/build/static/custom.css
```

Hard-refresh the browser after rollback:

```text
Ctrl+F5
```

## Known limitations

- The CSS targets OpenWebUI `0.10.2` DOM/classes. After updating OpenWebUI, verify selectors again.
- This customization hides UI actions; it does not remove backend capabilities.
- If OpenWebUI changes `ResponseMessage.svelte`, regenerate hiding may need an updated selector.
- `ENABLE_VERSION_UPDATE_CHECK=false` disables client-visible update checks; internal update checks must be run from the operations script.

## Pending production hardening

### Simple feedback flow

Status: pending.

OpenWebUI `0.10.2` does not provide a configuration option to keep thumbs up/down while disabling only the detailed rating form.

Current behavior:

- Clicking thumbs up/down may open a detailed rating panel.
- The panel can include:
  - score from 1 to 10;
  - generic reason tags;
  - free-text comments;
  - optional public/community review UI when community sharing is enabled.

Current mitigation:

- `ui.enable_community_sharing=false` disables public review/community sharing.
- `ui.enable_message_rating=true` keeps thumbs up/down enabled.

Required production behavior:

- Clicking thumbs up/down stores the feedback immediately.
- No detailed rating modal is shown to clients.
- No free-text feedback field is shown to clients.
- No public/community review path is shown to clients.
- Feedback storage must not include a full chat `snapshot`.
- The daily report keeps counting positive/negative votes by day and model.

Recommended implementation:

- Build and pin a Kern-owned OpenWebUI image based on the chosen upstream version.
- Patch `src/lib/components/chat/Messages/ResponseMessage.svelte`.
- In `feedbackHandler`, keep the `POST /api/v1/evaluations/feedback` call with `data.rating`.
- Do not set `showRateComment` after thumbs up/down.
- Remove `snapshot: { chat }` from the feedback payload if strict minimization is required.
- Keep only technical metadata required for reporting, for example:
  - `rating`;
  - `model_id`;
  - `message_id`;
  - opaque `user_id`;
  - timestamps.

Acceptance criteria:

- A non-admin client user clicks thumbs up and sees no modal.
- A non-admin client user clicks thumbs down and sees no modal.
- `feedback` receives one row per click.
- The row contains rating and model metadata.
- The row does not contain a chat snapshot.
- The daily report includes the new positive/negative count.
- Copy button still works.
- Regenerate, edit and audio controls remain hidden.
- OpenWebUI update notices remain hidden from clients.

Do not solve this with CSS except as an emergency demo workaround. CSS can hide the panel visually, but it does not provide a robust product behavior or data-minimization guarantee across OpenWebUI upgrades.
