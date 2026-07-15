#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://api.holded.com';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PAGE_SIZE = 100;
const CORPUS_ROOT = path.join('data', 'pacoprint-corpus');
const FORBIDDEN_OUTPUT_KEYS = [
  'amount',
  'contact',
  'customer',
  'discount',
  'document_id',
  'document_number',
  'email',
  'holded_id',
  'iva',
  'phone',
  'price',
  'subtotal',
  'tax',
  'total'
];

function parseArgs(argv) {
  const args = {
    documentType: 'estimate',
    limit: DEFAULT_LIMIT,
    output: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--document-type' && next) {
      args.documentType = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      args.limit = Number.parseInt(next, 10);
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
  if (args.documentType !== 'estimate' && args.documentType !== 'invoice') {
    throw new Error('--document-type must be estimate or invoice');
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  HOLDED_API_KEY=... node scripts/export-pacoprint-holded-corpus.mjs [options]

Options:
  --document-type estimate|invoice   Holded document type to inspect. Default: estimate
  --limit N                          Maximum accepted corpus cases. Default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT}
  --output PATH                      NDJSON output path. Default: data/pacoprint-corpus/<timestamp>.ndjson

The output is minimized, local-only and must stay out of Git. It rejects obvious
PII/commercial fields, but still requires human review before using any case.`);
}

function getApiKey() {
  const key = process.env.HOLDED_API_KEY || process.env.KERN_HOLDED_API_KEY || '';
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('Missing HOLDED_API_KEY or KERN_HOLDED_API_KEY');
  }
  return trimmed;
}

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(CORPUS_ROOT, `holded-${stamp}.ndjson`);
}

function resolveOutputPath(output) {
  const requested = output ?? defaultOutputPath();
  const root = path.resolve(CORPUS_ROOT);
  const resolved = path.resolve(requested);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`--output must be inside ${CORPUS_ROOT}`);
  }
  if (!resolved.endsWith('.ndjson')) {
    throw new Error('--output must use .ndjson extension');
  }
  return resolved;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractRecords(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ['items', 'estimates', 'invoices', 'documents', 'data']) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter(isRecord);
    }
  }
  return [];
}

function extractLineRecords(document) {
  const candidates = [
    document.products,
    document.items,
    document.lines,
    document.entries,
    document.rows,
    document.concepts
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }
  return [];
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function pickLineText(line) {
  const parts = [
    line.description,
    line.desc,
    line.name,
    line.title,
    line.concept,
    line.productName,
    line.product_name,
    line.text
  ]
    .map(normalizeText)
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(' - ') : null;
}

function hasForbiddenText(value) {
  const text = value.toLowerCase();
  return (
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value) ||
    /\b(?:\+?\d{1,3}[\s.-]?)?(?:6|7|8|9)\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/.test(value) ||
    /\b[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]\b/i.test(value) ||
    /\b\d{8}[A-Z]\b/i.test(value) ||
    /\b(?:calle|avenida|avda|plaza|poligono|polígono|nave|cp|codigo postal|código postal)\b/i.test(value) ||
    /\b(?:factura|presupuesto|pedido|albar[aá]n|documento|ref(?:erencia)?)\s*[:#-]?\s*[a-z]?\d{2}\/\d+\b/i.test(value) ||
    /\b[a-z]\d{2}\/\d{3,}\b/i.test(value) ||
    /(?:^|[^\d])\d+(?:[.,]\d{1,2})?\s*(?:€|eur|euros?)(?:$|[^\p{L}])/iu.test(value) ||
    /\b(?:neto|iva|incluido|descuento|total|subtotal|precio|importe)\b/i.test(value) ||
    /\b(?:token|secret|api[_ -]?key|password|passwd|contrase[nñ]a)\b/i.test(value) ||
    text.includes('http://') ||
    text.includes('https://')
  );
}

function inferQuantity(line) {
  const value = line.units ?? line.quantity ?? line.qty ?? line.cantidad ?? line.unidades;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function createCase({ batchId, documentType, lineText, line, index }) {
  if (!lineText || hasForbiddenText(lineText)) {
    return null;
  }
  return {
    schema_version: 'pacoprint-intent-corpus.v1',
    example_id: `ppic_${crypto.randomUUID()}`,
    utterance: lineText,
    observed: {
      quantity: inferQuantity(line)
    },
    target: {
      article_id: null,
      article_name: null,
      attributes: {},
      quantity: null,
      width_cm: null,
      height_cm: null,
      not_present: []
    },
    label_status: 'needs_human_review',
    source: {
      kind: `holded_${documentType}_line`,
      batch_id: batchId,
      line_index: index
    }
  };
}

function assertSafeOutput(record) {
  const serialized = JSON.stringify(record);
  for (const key of FORBIDDEN_OUTPUT_KEYS) {
    if (new RegExp(`"${key}"\\s*:`, 'i').test(serialized)) {
      throw new Error(`Forbidden output key detected: ${key}`);
    }
  }
  if (typeof record.utterance === 'string' && hasForbiddenText(record.utterance)) {
    throw new Error('Forbidden output text detected');
  }
}

async function fetchHoldedPage({ apiKey, documentType, page }) {
  const endpoint = new URL(`${DEFAULT_BASE_URL}/api/invoicing/v1/documents/${documentType}`);
  endpoint.searchParams.set('page', String(page));
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      key: apiKey
    }
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Holded authorization denied');
  }
  if (!response.ok) {
    throw new Error(`Holded request failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getApiKey();
  const output = resolveOutputPath(args.output);
  const outputDir = path.dirname(output);
  const batchId = `ppic_batch_${crypto.randomUUID()}`;
  const accepted = [];
  const stats = {
    documents: 0,
    lines: 0,
    accepted: 0,
    rejected_empty: 0,
    rejected_sensitive: 0
  };

  for (let page = 1; accepted.length < args.limit; page += 1) {
    const payload = await fetchHoldedPage({
      apiKey,
      documentType: args.documentType,
      page
    });
    const documents = extractRecords(payload);
    if (documents.length === 0) {
      break;
    }
    stats.documents += documents.length;
    for (const document of documents) {
      const lines = extractLineRecords(document);
      for (const line of lines) {
        stats.lines += 1;
        const lineText = pickLineText(line);
        if (!lineText) {
          stats.rejected_empty += 1;
          continue;
        }
        if (hasForbiddenText(lineText)) {
          stats.rejected_sensitive += 1;
          continue;
        }
        const record = createCase({
          batchId,
          documentType: args.documentType,
          lineText,
          line,
          index: stats.lines - 1
        });
        if (!record) {
          stats.rejected_sensitive += 1;
          continue;
        }
        assertSafeOutput(record);
        accepted.push(record);
        if (accepted.length >= args.limit) {
          break;
        }
      }
      if (accepted.length >= args.limit) {
        break;
      }
    }
    if (documents.length < PAGE_SIZE) {
      break;
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(output, `${accepted.map((record) => JSON.stringify(record)).join('\n')}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  console.log(
    JSON.stringify(
      {
        output,
        document_type: args.documentType,
        batch_id: batchId,
        stats: { ...stats, accepted: accepted.length }
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { assertSafeOutput, createCase, hasForbiddenText, parseArgs, resolveOutputPath };
