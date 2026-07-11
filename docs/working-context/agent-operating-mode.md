# Agent operating mode

## Default roles

- Sol: CTO/reviewer/coordinator. Defines scope, reviews reports, approves or blocks PRs, and protects architecture and isolation rules.
- Terra: implementation worker for bounded code changes.
- Luna: diagnostic/review explorer for read-only verification, smoke diagnosis, and independent review.

## Operating rule

For Kern work, use Sol as the main decision layer and delegate bounded tasks to Terra and Luna when useful.

Do not rely on the user copying prompts manually when the local tools can execute the work directly.

When a delegated agent finishes and its result has been checked or integrated, close that agent. Do not leave completed agents open without a current task.

## Constraints

- One branch equals one concept.
- Do not mix clients: Numa, Pacoprint, and future clients stay isolated.
- Do not mix channels: OpenWebUI and Telegram stay isolated unless the task explicitly concerns runtime module wiring.
- Do not print, commit, or document secrets.
- Do not merge without explicit approval in the workflow.
- Preserve fail-closed behavior.
