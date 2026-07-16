# PacoPrint interpretation corpus

Decision record: `decisions/ADR-0007-pacoprint-holded-interpretation-corpus.md`.

## Purpose

The interpretation corpus is a controlled dataset for improving how Kern maps
PacoPrint human order text to PacoPrint catalog inputs.

It is not a pricing source. Prices must continue to come from the PacoPrint
pricing API. Holded records may only be used as historical examples of how
people describe real jobs.

## Problem

PacoPrint users describe products with business language:

- `lona 300x120 con termosellado y ollados cada metro`
- `dibond blanco 70x50 impresion frente y reverso iguales sin laminado`
- `carton pluma 10mm con corte escuadrado`

Kern must convert that text into a deterministic request:

- catalog article
- units
- width and height
- explicit attributes
- missing attributes that require clarification

Kern must not add billable options that the user did not request.

## Sources

Allowed source:

- Holded estimate/order line descriptions, used only as interpretation examples.

Authoritative source:

- PacoPrint catalog and pricing API.

Not allowed:

- Using Holded historical price as current price.
- Persisting real customer names, document ids, emails, phone numbers, addresses,
  tax ids, or free-text notes in Git.
- Training defaults that silently add billable options.

## Workflow

1. Export a small batch of recent Holded estimate/order lines in a secure local
   environment.
2. Remove or hash customer/document identifiers before any file is committed.
3. Keep only the line description and the expected interpretation fields.
4. Compare each interpreted case against the current PacoPrint catalog.
5. Classify every mismatch.
6. Convert representative anonymized cases into tests.

## Local export command

Use the local-only exporter for a first minimized batch. The output path is
ignored by Git.

```bash
HOLDED_API_KEY=... node scripts/export-pacoprint-holded-corpus.mjs \
  --document-type estimate \
  --limit 100 \
  --output data/pacoprint-corpus/holded-estimates-sample.ndjson
```

The exporter writes only below `data/pacoprint-corpus/`, which is ignored by Git.
It calls the official Holded API endpoint only; the API base URL is not
configurable, to avoid sending the API key to an arbitrary host.

The exporter writes a minimized local review file with only allowlisted fields:

- `utterance`
- optional observed quantity
- empty target fields for human review
- non-reversible batch id
- line index

It rejects obvious prices, totals, discounts, document references, emails,
phones, addresses, tax ids and secret-like text. This is a safety filter, not a
formal anonymizer: every generated row remains `needs_human_review` and must be
reviewed before converting it into tests, fixtures or documentation.

## Local labeling command

After exporting a corpus batch and a local PacoPrint catalog structure, run the
local labeler:

```bash
node --import tsx scripts/label-pacoprint-holded-corpus.mjs \
  --input data/pacoprint-corpus/holded-estimates-sample.ndjson \
  --catalog data/pacoprint-corpus/catalog-structure.json \
  --output data/pacoprint-corpus/holded-estimates-labeled.ndjson
```

The labeler never calls external services. It compares each local corpus row with
the local catalog, fills deterministic fields only when the article is
unambiguous, and leaves all generated labels as `auto_labeled_needs_review`.
Ambiguous rows stay as `needs_human_review`; Kern must ask for clarification
rather than guessing.

## Mismatch classes

- `parser_missing_article`: the text names a real product but Kern cannot map it
  to a catalog article.
- `parser_missing_attribute`: the product is found but a user-stated attribute is
  not resolved.
- `parser_added_attribute`: Kern adds an attribute that the user did not state.
- `catalog_changed`: historical wording no longer maps cleanly to the current
  catalog.
- `manual_historical_price`: Holded price likely includes manual override,
  discount, legacy tariff, or exceptional agreement.
- `needs_business_review`: the case cannot be classified technically.

## Safe fixture format

Committed fixtures must be anonymized and must not contain real document ids.

```json
{
  "schema": "pacoprint.interpretation-case.v1",
  "case_id": "pacoprint-case-001",
  "source": {
    "system": "holded",
    "record_ref": "HASHED_OR_LOCAL_ONLY",
    "exported_at": "2026-07-15T00:00:00.000Z"
  },
  "input_text": "lona frontlit 300x120 corte escuadrado termosellado ollado cada 100 cm",
  "expected": {
    "article": "Lona Frontlit 510g",
    "unidades": 1,
    "ancho": 300,
    "alto": 120,
    "attributes": {
      "corte": "escuadrado",
      "refuerzo": "termosellado",
      "ollado": "100"
    },
    "not_present": ["velcro"]
  },
  "notes": "No price assertion. Current price must be queried from PacoPrint API."
}
```

## Acceptance criteria

A corpus case is useful only if it answers these questions:

- What did the human say?
- Which PacoPrint article should be selected?
- Which attributes were explicitly stated?
- Which attributes were not stated and must not be added?
- Which missing fields should trigger clarification?

## Current application

The first regression cases derived from real PacoPrint feedback are:

- Lona Frontlit must not include Velcro unless the user says Velcro.
- Lona Frontlit `ollado cada 100 cm` must resolve to the `100 cm` option, not
  the `50 cm` option.
- `Dibond blanco` must still find the `Dibond` article; `blanco` is an attribute
  qualifier, not necessarily part of the article name.

These cases are covered in workflow/catalog tests. The next step is to extract a
small Holded sample and convert only anonymized representative cases into this
format.

## Local sample findings

The first local Holded sample contained a minimized estimate-line batch. The
sample itself is ignored by Git and must remain local; exact operational counts
stay in local reports, not in versioned documentation.

Current qualitative result after deterministic labeling:

- Many cases still require human review because the article is genuinely
  ambiguous or required attributes are not stated.
- A smaller subset is complete enough to promote into anonymized regression
  tests.

Parser improvements promoted from this sample into anonymized tests:

- `unidad` singular is accepted as a quantity suffix.
- Generic color-only text such as `vinilo blanco` must not invent a more
  specific article subtype.
- Explicit discriminants such as `microventosa`, `pvc suelo`, `carton pluma`,
  `carton microcanal`, `lona camion`, `doble cara blockout`, `metacrilato
  transparente` and `metacrilato blanco opal` are covered by synthetic tests.

## Learning shadow mode

PacoPrint installations can enable a local learning shadow to capture structured
review traces from real conversations while Kern remains the system that answers
the customer.

The shadow is not an agent that replies to the customer. It only appends local
JSONL records after Telegram processing, so the normal runtime path remains:

```text
Telegram user -> Kern -> local model + deterministic parser + PacoPrint API -> Telegram response
```

Example runtime option:

```json
{
  "runtime_options": {
    "learning_shadow": {
      "enabled": true,
      "file_path": "/opt/kern/installations/pacoprint/learning/learning-shadow.jsonl",
      "capture_raw_text": false,
      "capture_model_params": false
    }
  }
}
```

By default, records contain a random trace id, text hash, text length, workflow
status, capability key, validation state and a small runtime summary. They do
not contain Telegram identifiers, principal ids, correlation ids, raw user text,
Telegram replies or model parameters. Raw text and model parameters require
explicit opt-in:

- `capture_raw_text: true`
- `capture_model_params: true`

Use raw capture only in a private, access-controlled installation folder. Do not
commit learning shadow files. Daily review should promote only anonymized or
synthetic patterns into tests, parser rules or documentation.
