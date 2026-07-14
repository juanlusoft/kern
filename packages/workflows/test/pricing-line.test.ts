import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLineAttributes } from '../src/pricing-line';
import type { PacoPrintCatalogCandidate } from '../../contracts/src/index';

const DIBOND: PacoPrintCatalogCandidate = {
  id: 'dibond-1',
  nombre: 'Dibond',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [
      { atributo_id: 'diseno', nombre: 'Diseño diferente', tipo: 'number', obligatorio: true },
      { atributo_id: 'corte', nombre: 'Corte', tipo: 'select', obligatorio: true }
    ] as never
  },
  atributos: [
    {
      id: 'corte',
      nombre: 'Corte',
      valores_posibles: [
        { id: 'escuadrado', nombre: 'Escuadrado' },
        { id: 'forma', nombre: 'Con Forma' }
      ]
    }
  ]
};

const CARTON_PLUMA: PacoPrintCatalogCandidate = {
  id: 'carton-1',
  nombre: 'Cartón Pluma',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [
      { atributo_id: 'diseno', nombre: 'Diseño diferente', tipo: 'number', obligatorio: true },
      { atributo_id: 'grosor', nombre: 'Grosor', tipo: 'select', obligatorio: true },
      { atributo_id: 'corte', nombre: 'Corte', tipo: 'select', obligatorio: true }
    ] as never
  },
  atributos: [
    {
      id: 'grosor',
      nombre: 'Grosor',
      valores_posibles: [
        { id: '10', nombre: '10 mm' },
        { id: '5', nombre: '5 mm' }
      ]
    },
    {
      id: 'corte',
      nombre: 'Corte',
      valores_posibles: [
        { id: 'escuadrado', nombre: 'Escuadrado' },
        { id: 'forma', nombre: 'Con Forma' }
      ]
    }
  ]
};

test('pricing line resolves numeric diseño diferente from full user text', () => {
  const result = resolveLineAttributes(DIBOND, {
    rawMessage: 'Dime el precio de 10 unidades de dibond de 50x40cm. Diseño diferente: 1. Impresión con frente y reverso iguales y corte escuadrado.',
    resolvedUnits: 10,
    resolvedAlto: 40,
    resolvedAncho: 50,
    resolvedOptions: {}
  });

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.diseno, 1);
  assert.equal(result.resolvedAttributes.corte, 'escuadrado');
});

test('pricing line resolves numeric diseño diferente from short clarification text', () => {
  const result = resolveLineAttributes(DIBOND, {
    rawMessage: 'solo 1 diseño diferente',
    resolvedUnits: 10,
    resolvedAlto: 40,
    resolvedAncho: 50,
    resolvedOptions: { corte: 'escuadrado' }
  });

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.diseno, 1);
  assert.equal(result.resolvedAttributes.corte, 'escuadrado');
});

test('pricing line resolves plural diseños diferentes from clarification text', () => {
  const result = resolveLineAttributes(DIBOND, {
    rawMessage: 'Son 5 unidades de cartón pluma y 3 diseños diferentes.',
    resolvedUnits: 5,
    resolvedAlto: 50,
    resolvedAncho: 120,
    resolvedOptions: { corte: 'Con Forma' }
  });

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.diseno, 3);
  assert.equal(result.resolvedAttributes.corte, 'forma');
});

test('pricing line resolves compact numeric select options such as 10mm', () => {
  const result = resolveLineAttributes(CARTON_PLUMA, {
    rawMessage: 'Necesito el precio de 5 unidades de Cartón Pluma de 120x50cm. Diseño diferente: 3. Grosor 10mm, impresión anverso y corte con forma.',
    resolvedUnits: 5,
    resolvedAlto: 50,
    resolvedAncho: 120,
    resolvedOptions: {}
  });

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.diseno, 3);
  assert.equal(result.resolvedAttributes.grosor, '10');
  assert.equal(result.resolvedAttributes.corte, 'forma');
});
