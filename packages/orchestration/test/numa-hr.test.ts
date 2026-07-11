import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNumaHrTimeTypeLabelById, deriveNumaHrRoutingOverride, normalizeNumaHrTimeTypeLabels, resolveNumaHrTimeTypeIds } from '../src/numa-hr';

test('Numa HR mapping normaliza etiquetas y resuelve ids deterministas', () => {
  const mapping = {
    vacaciones: [5],
    'asuntos propios': [34]
  };

  assert.deepEqual(normalizeNumaHrTimeTypeLabels([' Vacaciones ', 'ASUNTOS PROPIOS ']), ['vacaciones', 'asuntos propios']);
  assert.deepEqual(resolveNumaHrTimeTypeIds(['vacaciones'], mapping), [5]);
  assert.deepEqual(resolveNumaHrTimeTypeIds(['asuntos propios'], mapping), [34]);
  assert.deepEqual(resolveNumaHrTimeTypeIds(['vacaciones', 'asuntos propios'], mapping), [5, 34]);
  assert.deepEqual(buildNumaHrTimeTypeLabelById(['vacaciones', 'asuntos propios'], mapping), {
    '5': 'Vacaciones',
    '34': 'Asuntos propios'
  });
});

test('Numa HR mapping falla cerrado con etiquetas vac?as o desconocidas', () => {
  const mapping = {
    vacaciones: [5]
  };

  assert.equal(resolveNumaHrTimeTypeIds([], mapping), null);
  assert.equal(resolveNumaHrTimeTypeIds(['desconocido'], mapping), null);
  assert.equal(normalizeNumaHrTimeTypeLabels([' ', 'vacaciones']), null);
  assert.equal(buildNumaHrTimeTypeLabelById(['vacaciones', 'festivo'], { vacaciones: [5], festivo: [5] }), null);
});

test('Numa HR routing deriva asuntos propios del a\u00f1o pasado de forma determinista', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  assert.deepEqual(deriveNumaHrRoutingOverride('BEATRIZ VERA tuvo asuntos propios el a\u00f1o pasado?', now), {
    force_capability_key: 'leave.days',
    force_params: {
      year: '2025',
      time_type_labels: ['asuntos propios']
    }
  });
  assert.deepEqual(deriveNumaHrRoutingOverride('  BEATRIZ VERA tuvo   asuntos propios el ANO PASADO? ', now), {
    force_capability_key: 'leave.days',
    force_params: {
      year: '2025',
      time_type_labels: ['asuntos propios']
    }
  });
});

test('Numa HR routing no fuerza consultas fuera del patron acotado', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  assert.equal(deriveNumaHrRoutingOverride('BEATRIZ VERA tuvo asuntos propios en 2025?', now), null);
  assert.equal(deriveNumaHrRoutingOverride('BEATRIZ VERA estuvo de vacaciones el a\u00f1o pasado?', now), null);
  assert.equal(deriveNumaHrRoutingOverride('BEATRIZ VERA tuvo asuntos propios?', now), null);
});
