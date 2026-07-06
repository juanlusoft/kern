import test from 'node:test';
import assert from 'node:assert/strict';

import { selectChoice } from '../src/pricing-line';

test('selectChoice: boolean rawValue matches whole words for sin/con', () => {
  const attribute = {
    id: 'laminado',
    nombre: 'Laminado',
    valores_posibles: [
      { id: 'sin', nombre: 'Sin laminado' },
      { id: 'con', nombre: 'Con laminado' }
    ]
  } satisfies Parameters<typeof selectChoice>[0];

  assert.deepEqual(selectChoice(attribute, true), { id: 'con', nombre: 'Con laminado' });
  assert.deepEqual(selectChoice(attribute, false), { id: 'sin', nombre: 'Sin laminado' });
});
