import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { labelCase, parseArgs, resolveCorpusPath, summarize } from './label-pacoprint-holded-corpus.mjs';

const catalog = [
  {
    id: 10,
    nombre: 'Lona Frontlit 510g',
    tipo_calculo: 'm2',
    json_calcular_precio: {
      alto: { obligatorio: true },
      ancho: { obligatorio: true },
      atributos: [
        { atributo_id: 'corte', nombre: 'Corte', tipo: 'select', obligatorio: true },
        { atributo_id: 'ojales', nombre: 'Ollado metálico', tipo: 'select', obligatorio: false }
      ]
    },
    atributos: [
      {
        id: 'corte',
        nombre: 'Corte',
        valores_posibles: [
          { id: 'escuadrado', nombre: 'Corte Escuadrado' },
          { id: 'contorno', nombre: 'Corte Contorno' }
        ]
      },
      {
        id: 'ojales',
        nombre: 'Ollado metálico',
        valores_posibles: [
          { id: '50', nombre: 'Todo el perímetro (cada 50 cm)' },
          { id: '100', nombre: 'Todo el perímetro (cada 100 cm)' }
        ]
      }
    ]
  },
  {
    id: 20,
    nombre: 'Lona Microperforada Mesh',
    tipo_calculo: 'm2',
    json_calcular_precio: {
      alto: { obligatorio: true },
      ancho: { obligatorio: true },
      atributos: []
    },
    atributos: []
  },
  {
    id: 30,
    nombre: 'Vinilo Monomérico',
    tipo_calculo: 'm2',
    json_calcular_precio: {
      alto: { obligatorio: true },
      ancho: { obligatorio: true },
      atributos: []
    },
    atributos: []
  },
  {
    id: 31,
    nombre: 'Vinilo Polimérico',
    tipo_calculo: 'm2',
    json_calcular_precio: {
      alto: { obligatorio: true },
      ancho: { obligatorio: true },
      atributos: []
    },
    atributos: []
  }
];

test('PacoPrint corpus labeler rejects paths outside the ignored corpus directory', () => {
  assert.throws(() => resolveCorpusPath('docs/leak.ndjson', '--output'), /--output must be inside data\/pacoprint-corpus/);
  assert.match(resolveCorpusPath('data/pacoprint-corpus/labeled.ndjson', '--output'), /data[\\/]pacoprint-corpus[\\/]labeled\.ndjson$/);
});

test('PacoPrint corpus labeler rejects symlink escapes from the ignored corpus directory', (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kern-pacoprint-corpus-'));
  const outsideFile = path.join(outside, 'outside.ndjson');
  const link = path.join('data', 'pacoprint-corpus', 'symlink-outside.ndjson');
  fs.writeFileSync(outsideFile, '{}\n', { encoding: 'utf8' });
  try {
    fs.rmSync(link, { force: true });
    fs.symlinkSync(outsideFile, link);
  } catch (error) {
    t.skip(`symlink not available: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  t.after(() => {
    fs.rmSync(link, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  assert.throws(() => resolveCorpusPath(link, '--input', { mustExist: true }), /--input must be inside data\/pacoprint-corpus/);
});

test('PacoPrint corpus labeler parses args without network settings', () => {
  assert.deepEqual(parseArgs(['--input', 'data/pacoprint-corpus/in.ndjson', '--catalog', 'data/pacoprint-corpus/cat.json']), {
    input: 'data/pacoprint-corpus/in.ndjson',
    catalog: 'data/pacoprint-corpus/cat.json',
    output: 'data/pacoprint-corpus/holded-estimates-labeled.ndjson'
  });
  assert.throws(() => parseArgs(['--base-url', 'https://example.invalid']), /Unknown or incomplete argument/);
});

test('PacoPrint corpus labeler auto-labels clear catalog matches but keeps human review status', () => {
  const labeled = labelCase(
    {
      utterance: 'Lona Frontlit 510g 300x120 cm corte escuadrado ollado cada 100 cm',
      observed: { quantity: 2 },
      target: {}
    },
    catalog
  );

  assert.equal(labeled.label_status, 'auto_labeled_needs_review');
  assert.equal(labeled.target.article_name, 'Lona Frontlit 510g');
  assert.equal(labeled.target.quantity, 2);
  assert.equal(labeled.target.width_cm, 300);
  assert.equal(labeled.target.height_cm, 120);
  assert.equal(labeled.target.attributes.corte, 'escuadrado');
  assert.equal(labeled.target.attributes.ojales, '100');
  assert.equal(labeled.analysis.article_status, 'selected');
  assert.equal(labeled.analysis.complete, true);
});

test('PacoPrint corpus labeler leaves ambiguous article text for human review', () => {
  const labeled = labelCase(
    {
      utterance: 'Vinilo 100x50 cm',
      observed: { quantity: 1 },
      target: {
        article_id: 'stale',
        article_name: 'Stale',
        attributes: { stale: true }
      }
    },
    catalog
  );

  assert.equal(labeled.label_status, 'needs_human_review');
  assert.equal(labeled.target.article_id, null);
  assert.equal(labeled.target.article_name, null);
  assert.deepEqual(labeled.target.attributes, {});
  assert.equal(labeled.analysis.article_status, 'ambiguous');
  assert.equal(labeled.analysis.complete, false);
});

test('PacoPrint corpus labeler does not mark selected m2 cases complete without required measures', () => {
  const labeled = labelCase(
    {
      utterance: 'Lona Frontlit 510g corte escuadrado',
      observed: { quantity: 1 },
      target: {}
    },
    catalog
  );

  assert.equal(labeled.label_status, 'auto_labeled_needs_review');
  assert.equal(labeled.target.article_name, 'Lona Frontlit 510g');
  assert.equal(labeled.analysis.complete, false);
  assert.deepEqual(labeled.analysis.missing_fields, ['Ancho', 'Alto']);
});

test('PacoPrint corpus labeler summary does not include utterance text', () => {
  const rows = [
    labelCase({ utterance: 'Lona Frontlit 510g 100x100 cm corte escuadrado', observed: { quantity: 1 }, target: {} }, catalog),
    labelCase({ utterance: 'Vinilo 100x50 cm', observed: { quantity: 1 }, target: {} }, catalog)
  ];

  const result = summarize(rows);

  assert.equal(result.records, 2);
  assert.equal(result.selected, 1);
  assert.equal(result.ambiguous, 1);
  assert.equal(JSON.stringify(result).includes('Vinilo 100x50'), false);
  assert.equal(JSON.stringify(result).includes('Lona Frontlit 510g'), false);
});
