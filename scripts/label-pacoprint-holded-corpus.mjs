#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMeasures, parseQuantity, pickArticleCandidate } from '../packages/workflows/src/pricing-parse.ts';
import { resolveLineAttributes } from '../packages/workflows/src/pricing-line.ts';

const CORPUS_ROOT = path.join('data', 'pacoprint-corpus');
const DEFAULT_INPUT = path.join(CORPUS_ROOT, 'holded-estimates-sample.ndjson');
const DEFAULT_CATALOG = path.join(CORPUS_ROOT, 'catalog-structure.json');
const DEFAULT_OUTPUT = path.join(CORPUS_ROOT, 'holded-estimates-labeled.ndjson');

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    catalog: DEFAULT_CATALOG,
    output: DEFAULT_OUTPUT
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--input' && next) {
      args.input = next;
      index += 1;
    } else if (arg === '--catalog' && next) {
      args.catalog = next;
      index += 1;
    } else if (arg === '--output' && next) {
      args.output = next;
      index += 1;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/label-pacoprint-holded-corpus.mjs [options]

Options:
  --input PATH     Minimized Holded corpus NDJSON. Default: ${DEFAULT_INPUT}
  --catalog PATH   Local PacoPrint catalog structure JSON. Default: ${DEFAULT_CATALOG}
  --output PATH    Labeled NDJSON output path. Default: ${DEFAULT_OUTPUT}

All paths must stay below ${CORPUS_ROOT}. The output remains local-only and must
be reviewed by a human before any case is promoted to committed tests.`);
}

function resolveCorpusPath(value, label, options = {}) {
  const root = fs.existsSync(CORPUS_ROOT) ? fs.realpathSync.native(CORPUS_ROOT) : path.resolve(CORPUS_ROOT);
  const resolved = path.resolve(value);
  const pathForContainment =
    options.mustExist || fs.existsSync(resolved)
      ? fs.realpathSync.native(resolved)
      : fs.realpathSync.native(path.dirname(resolved));
  const relative = path.relative(root, pathForContainment);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside ${CORPUS_ROOT}`);
  }
  if (!options.allowExistingSymlink && fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  return resolved;
}

function readNdjson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function readCatalog(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.articles)) {
    return payload.articles;
  }
  throw new Error('Catalog file must contain an articles array');
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function labelCase(row, catalog) {
  const utterance = typeof row.utterance === 'string' ? row.utterance : '';
  const picked = pickArticleCandidate(utterance, catalog);
  const parsedQuantity = parseQuantity(utterance);
  const observedQuantity = typeof row.observed?.quantity === 'number' ? row.observed.quantity : null;
  const parsedMeasures = parseMeasures(utterance);
  const resolvedQuantity = parsedQuantity ?? observedQuantity ?? row.target?.quantity ?? 1;
  const base = {
    ...row,
    target: {
      ...(row.target ?? {}),
      quantity: resolvedQuantity,
      width_cm: parsedMeasures?.anchoCm ?? row.target?.width_cm ?? null,
      height_cm: parsedMeasures?.altoCm ?? row.target?.height_cm ?? null
    }
  };

  if (!picked.selected) {
    return {
      ...base,
      target: {
        ...base.target,
        article_id: null,
        article_name: null,
        attributes: {}
      },
      label_status: 'needs_human_review',
      analysis: {
        article_status: picked.ambiguous ? 'ambiguous' : 'missing',
        complete: false,
        missing_fields: [],
        invalid_fields: []
      }
    };
  }

  const resolution = resolveLineAttributes(picked.selected, {
    rawMessage: utterance,
    resolvedUnits: resolvedQuantity,
    resolvedAlto: parsedMeasures?.altoCm ?? null,
    resolvedAncho: parsedMeasures?.anchoCm ?? null,
    resolvedOptions: null
  });
  const missingTopLevelFields = [];
  if (picked.selected.json_calcular_precio?.ancho?.obligatorio === true && base.target.width_cm === null) {
    missingTopLevelFields.push('Ancho');
  }
  if (picked.selected.json_calcular_precio?.alto?.obligatorio === true && base.target.height_cm === null) {
    missingTopLevelFields.push('Alto');
  }
  const missingFields = [...new Set([...missingTopLevelFields, ...resolution.missingFields])];

  return {
    ...base,
    target: {
      ...base.target,
      article_id: picked.selected.id,
      article_name: picked.selected.nombre,
      attributes: resolution.resolvedAttributes,
      not_present: base.target.not_present ?? []
    },
    label_status: 'auto_labeled_needs_review',
    analysis: {
      article_status: 'selected',
      complete: missingFields.length === 0 && resolution.invalidFields.length === 0,
      missing_fields: missingFields,
      invalid_fields: resolution.invalidFields
    }
  };
}

function summarize(rows) {
  const summary = {
    records: rows.length,
    selected: 0,
    ambiguous: 0,
    missing: 0,
    complete: 0,
    needsReview: 0,
    missingFields: {},
    invalidFields: {},
    selectedArticleCount: 0
  };

  for (const row of rows) {
    const status = row.analysis?.article_status;
    if (status === 'selected') {
      summary.selected += 1;
      summary.selectedArticleCount += 1;
    } else if (status === 'ambiguous') {
      summary.ambiguous += 1;
    } else {
      summary.missing += 1;
    }
    if (row.analysis?.complete === true) {
      summary.complete += 1;
    } else {
      summary.needsReview += 1;
    }
    for (const field of row.analysis?.missing_fields ?? []) {
      increment(summary.missingFields, field);
    }
    for (const field of row.analysis?.invalid_fields ?? []) {
      increment(summary.invalidFields, field);
    }
  }

  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolveCorpusPath(args.input, '--input', { mustExist: true });
  const catalogPath = resolveCorpusPath(args.catalog, '--catalog', { mustExist: true });
  const output = resolveCorpusPath(args.output, '--output');
  if (!output.endsWith('.ndjson')) {
    throw new Error('--output must use .ndjson extension');
  }

  const rows = readNdjson(input);
  const catalog = readCatalog(catalogPath);
  const labeled = rows.map((row) => labelCase(row, catalog));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${labeled.map((row) => JSON.stringify(row)).join('\n')}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  console.log(JSON.stringify({ output, summary: summarize(labeled) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

export { labelCase, parseArgs, resolveCorpusPath, summarize };
