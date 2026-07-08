import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeNumaHrTimeTypeLabels, resolveNumaHrTimeTypeIds } from '../src/numa-hr';

test('Numa HR mapping normaliza etiquetas y resuelve ids deterministas', () => {
  const mapping = {
    vacaciones: [5],
    'asuntos propios': [34]
  };

  assert.deepEqual(normalizeNumaHrTimeTypeLabels([' Vacaciones ', 'ASUNTOS PROPIOS ']), ['vacaciones', 'asuntos propios']);
  assert.deepEqual(resolveNumaHrTimeTypeIds(['vacaciones'], mapping), [5]);
  assert.deepEqual(resolveNumaHrTimeTypeIds(['asuntos propios'], mapping), [34]);
  assert.deepEqual(resolveNumaHrTimeTypeIds(['vacaciones', 'asuntos propios'], mapping), [5, 34]);
});

test('Numa HR mapping falla cerrado con etiquetas vac?as o desconocidas', () => {
  const mapping = {
    vacaciones: [5]
  };

  assert.equal(resolveNumaHrTimeTypeIds([], mapping), null);
  assert.equal(resolveNumaHrTimeTypeIds(['desconocido'], mapping), null);
  assert.equal(normalizeNumaHrTimeTypeLabels([' ', 'vacaciones']), null);
});
