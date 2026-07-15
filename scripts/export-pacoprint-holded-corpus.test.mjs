import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  assertSafeOutput,
  createCase,
  hasForbiddenText,
  parseArgs,
  resolveOutputPath
} from './export-pacoprint-holded-corpus.mjs';

test('Holded corpus exporter rejects custom base URLs', () => {
  assert.throws(
    () => parseArgs(['--base-url', 'https://example.invalid']),
    /Unknown or incomplete argument: --base-url/
  );
});

test('Holded corpus exporter only writes inside the ignored corpus directory', () => {
  const resolved = resolveOutputPath('data/pacoprint-corpus/sample.ndjson');

  assert.equal(path.basename(resolved), 'sample.ndjson');
  assert.match(resolved, /data[\\/]pacoprint-corpus[\\/]sample\.ndjson$/);
  assert.throws(() => resolveOutputPath('docs/leak.ndjson'), /--output must be inside data\/pacoprint-corpus/);
  assert.throws(() => resolveOutputPath('data/pacoprint-corpus/sample.json'), /--output must use \.ndjson/);
});

test('Holded corpus exporter rejects obvious sensitive text', () => {
  const blocked = [
    'Cliente ejemplo cliente@example.com',
    'Telefono 600 123 456',
    'CIF B12345678',
    'Calle Mayor 1',
    'Presupuesto P26/04685',
    'Lona 91,73 €',
    'Importe neto 75,81',
    'api key secreta'
  ];

  for (const value of blocked) {
    assert.equal(hasForbiddenText(value), true, value);
  }

  assert.equal(hasForbiddenText('Lona Frontlit 510g 300x120 cm Corte Escuadrado Ollado cada 100 cm'), false);
});

test('Holded corpus exporter creates minimized cases that require human review', () => {
  const record = createCase({
    batchId: 'ppic_batch_test',
    documentType: 'estimate',
    lineText: 'Dibond blanco 70x50 cm impresion frente y reverso corte escuadrado',
    line: { units: '5' },
    index: 3
  });

  assert.ok(record);
  assert.equal(record.observed.quantity, 5);
  assert.equal(record.target.article_id, null);
  assert.deepEqual(record.target.attributes, {});
  assert.equal(record.label_status, 'needs_human_review');
  assertSafeOutput(record);
});

test('Holded corpus exporter rejects unsafe output records', () => {
  assert.throws(
    () =>
      assertSafeOutput({
        utterance: 'Lona 91,73 €'
      }),
    /Forbidden output text detected/
  );
  assert.throws(
    () =>
      assertSafeOutput({
        utterance: 'Lona segura',
        total: 10
      }),
    /Forbidden output key detected: total/
  );
});
