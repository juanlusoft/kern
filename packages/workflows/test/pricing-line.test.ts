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
      { atributo_id: 'diseno', nombre: 'Diseno diferente', tipo: 'number', obligatorio: true },
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
  nombre: 'Carton Pluma',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [
      { atributo_id: 'diseno', nombre: 'Diseno diferente', tipo: 'number', obligatorio: true },
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

const LONA_FRONTLIT: PacoPrintCatalogCandidate = {
  id: 'lona-1',
  nombre: 'Lona Frontlit 510g',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [
      { atributo_id: 'diseno', nombre: 'Diseno diferente', tipo: 'number', obligatorio: false },
      { atributo_id: 'corte', nombre: 'Corte', tipo: 'select', obligatorio: true },
      { atributo_id: 'refuerzo', nombre: 'Refuerzo', tipo: 'select', obligatorio: false },
      { atributo_id: 'ollado', nombre: 'Ollado metalico', tipo: 'select', obligatorio: false },
      { atributo_id: 'velcro', nombre: 'Velcro', tipo: 'select', obligatorio: false, valor_defecto: 'perimetro' }
    ] as never
  },
  atributos: [
    {
      id: 'diseno',
      nombre: 'Diseno diferente'
    },
    {
      id: 'corte',
      nombre: 'Corte',
      valores_posibles: [
        { id: 'escuadrado', nombre: 'Escuadrado' },
        { id: 'forma', nombre: 'Con Forma' }
      ]
    },
    {
      id: 'refuerzo',
      nombre: 'Refuerzo',
      valores_posibles: [
        { id: 'termosellado', nombre: 'Termosellado (todo el perimetro)' },
        { id: 'sin_refuerzo', nombre: 'Sin refuerzo' }
      ]
    },
    {
      id: 'ollado',
      nombre: 'Ollado metalico',
      valores_posibles: [
        { id: '50', nombre: 'Todo el perimetro (cada 50 cm)' },
        { id: '100', nombre: 'Todo el perimetro (cada 100 cm)' }
      ]
    },
    {
      id: 'velcro',
      nombre: 'Velcro',
      valores_posibles: [
        { id: 'perimetro', nombre: 'Velcro Todo el perimetro' },
        { id: 'hembra', nombre: 'Velcro hembra cosido' }
      ]
    }
  ]
};

const DIBOND_WITH_LAMINADO: PacoPrintCatalogCandidate = {
  id: 'dibond-laminado',
  nombre: 'Dibond',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [
      { atributo_id: 'laminado', nombre: 'Laminado', tipo: 'select', obligatorio: true, valor_defecto: 'mate' }
    ] as never
  },
  atributos: [
    {
      id: 'laminado',
      nombre: 'Laminado',
      valores_posibles: [
        { id: 'sin', nombre: 'Sin laminado' },
        { id: 'mate', nombre: 'Laminado mate' },
        { id: 'brillo', nombre: 'Laminado brillo' }
      ]
    }
  ]
};

const DIBOND_WITHOUT_NEGATIVE_LAMINADO: PacoPrintCatalogCandidate = {
  id: 'dibond-laminado-no-negative',
  nombre: 'Dibond',
  tipo_calculo: 'm2',
  json_calcular_precio: {
    atributos: [
      { atributo_id: 'laminado', nombre: 'Laminado', tipo: 'select', obligatorio: true, valor_defecto: 'mate' }
    ] as never
  },
  atributos: [
    {
      id: 'laminado',
      nombre: 'Laminado',
      valores_posibles: [
        { id: 'mate', nombre: 'Laminado mate' },
        { id: 'brillo', nombre: 'Laminado brillo' }
      ]
    }
  ]
};

test('pricing line resolves numeric diseno diferente from full user text', () => {
  const result = resolveLineAttributes(DIBOND, {
    rawMessage: 'Dime el precio de 10 unidades de dibond de 50x40cm. Diseno diferente: 1. Impresion con frente y reverso iguales y corte escuadrado.',
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

test('pricing line rejects model-proposed select options without text backing', () => {
  const result = resolveLineAttributes(DIBOND, {
    rawMessage: 'solo 1 diseno diferente',
    resolvedUnits: 10,
    resolvedAlto: 40,
    resolvedAncho: 50,
    resolvedOptions: { corte: 'escuadrado' }
  });

  assert.deepEqual(result.missingFields, ['Corte']);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.diseno, 1);
  assert.equal(result.resolvedAttributes.corte, undefined);
});

test('pricing line resolves plural disenos diferentes from clarification text', () => {
  const result = resolveLineAttributes(DIBOND, {
    rawMessage: 'Son 5 unidades de carton pluma, 3 disenos diferentes y corte con forma.',
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
    rawMessage: 'Necesito el precio de 5 unidades de Carton Pluma de 120x50cm. Diseno diferente: 3. Grosor 10mm, impresion anverso y corte con forma.',
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

test('pricing line ignores model-proposed extras unless the raw text backs them', () => {
  const result = resolveLineAttributes(LONA_FRONTLIT, {
    rawMessage:
      'Lona Frontlit 510g 300x120 cm, 1 unidad, corte escuadrado, refuerzo termosellado todo el perimetro, ollado metalico cada 100 cm, sin velcro',
    resolvedUnits: 1,
    resolvedAlto: 120,
    resolvedAncho: 300,
    resolvedOptions: { diseno: 2, velcro: 'perimetro' }
  });

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.corte, 'escuadrado');
  assert.equal(result.resolvedAttributes.refuerzo, 'termosellado');
  assert.equal(result.resolvedAttributes.ollado, '100');
  assert.equal(result.resolvedAttributes.diseno, undefined);
  assert.equal(result.resolvedAttributes.velcro, undefined);
  assert.equal(result.defaultsApplied.includes('Velcro'), false);
  assert.equal(result.optionsSummary.some((item) => item.includes('Diseno')), false);
  assert.equal(result.optionsSummary.some((item) => item.includes('Velcro')), false);
});

test('pricing line ignores model-proposed select options that are not backed by user text', () => {
  const result = resolveLineAttributes(LONA_FRONTLIT, {
    rawMessage:
      'Lona Frontlit 510g 300x120 cm 1 uds Corte Escuadrado, Refuerzo Termosellado todo el perimetro, Ollado metalico todo el perimetro cada 100 cm',
    resolvedUnits: 1,
    resolvedAlto: 120,
    resolvedAncho: 300,
    resolvedOptions: { velcro: 'Velcro Todo el perimetro' }
  });

  assert.equal(result.resolvedAttributes.velcro, undefined);
  assert.equal(result.optionsSummary.some((item) => item.includes('Velcro')), false);
});

test('pricing line resolves explicit negative options before defaults', () => {
  const result = resolveLineAttributes(DIBOND_WITH_LAMINADO, {
    rawMessage: 'Dibond blanco de 70x50 cm, impresion frente y reverso iguales, corte escuadrado, sin laminado.',
    resolvedUnits: 5,
    resolvedAlto: 50,
    resolvedAncho: 70,
    resolvedOptions: {}
  });

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.laminado, 'sin');
  assert.equal(result.defaultsApplied.includes('Laminado'), false);
});

test('pricing line does not apply a required default when the user negates that attribute', () => {
  const result = resolveLineAttributes(DIBOND_WITHOUT_NEGATIVE_LAMINADO, {
    rawMessage: 'Dibond blanco de 70x50 cm, impresion frente y reverso iguales, corte escuadrado, sin laminado.',
    resolvedUnits: 5,
    resolvedAlto: 50,
    resolvedAncho: 70,
    resolvedOptions: {}
  });

  assert.deepEqual(result.missingFields, ['Laminado']);
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.resolvedAttributes.laminado, undefined);
  assert.equal(result.defaultsApplied.includes('Laminado'), false);
});
