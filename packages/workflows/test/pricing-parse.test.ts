import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchOptionInText,
  parseMeasures,
  parseQuantity,
  pickArticleCandidate,
  scoreCandidate
} from '../src/pricing-parse';

test('parseMeasures: formato libre en metros sin unidad explícita ("2x1")', () => {
  assert.deepEqual(parseMeasures('lona de 2x1'), { altoCm: 100, anchoCm: 200 });
});

test('parseMeasures: metros con unidad ("3x2 metros")', () => {
  assert.deepEqual(parseMeasures('una lona de 3x2 metros'), { altoCm: 200, anchoCm: 300 });
});

test('parseMeasures: centímetros ("200x100")', () => {
  assert.deepEqual(parseMeasures('200x100 corte escuadrado'), { altoCm: 100, anchoCm: 200 });
});

test('parseMeasures: estructurado Alto/Ancho en cualquier orden', () => {
  assert.deepEqual(parseMeasures('Ancho: 100 cm, Alto: 200 cm'), { altoCm: 200, anchoCm: 100 });
});

test('parseMeasures: milímetros', () => {
  assert.deepEqual(parseMeasures('1500x1500 mm'), { altoCm: 150, anchoCm: 150 });
});

test('parseMeasures: sin medidas devuelve null', () => {
  assert.equal(parseMeasures('quiero una lona frontlit con ollados'), null);
});

test('parseQuantity: detecta cantidad con sufijo', () => {
  assert.equal(parseQuantity('5 uds'), 5);
  assert.equal(parseQuantity('10 unidades'), 10);
  assert.equal(parseQuantity('1 unidad'), 1);
  assert.equal(parseQuantity('1 ud de lona'), 1);
  assert.equal(parseQuantity('pon 25 und'), 25);
});

test('parseQuantity: no confunde una medida con cantidad', () => {
  assert.equal(parseQuantity('lona de 200x100'), null);
  assert.equal(parseQuantity('200'), null);
});

test('scoreCandidate: excluye frontlit <-> mesh', () => {
  assert.equal(scoreCandidate('lona frontlit 2x1', 'Lona Microperforada (Mesh)'), -1);
  assert.equal(scoreCandidate('lona mesh', 'Lona Frontlit 510g'), -1);
});

test('pickArticleCandidate: desambigua "lona frontlit" entre varias lonas', () => {
  const candidates = [
    { nombre: 'Lona Frontlit 510g' },
    { nombre: 'Lona Doble Cara Blockout' },
    { nombre: 'Lona Microperforada (Mesh)' },
    { nombre: 'Lona camión' }
  ];
  const picked = pickArticleCandidate('precio de una lona frontlit de 2x1', candidates);
  assert.equal(picked.ambiguous, false);
  assert.equal(picked.selected?.nombre, 'Lona Frontlit 510g');
});

test('pickArticleCandidate: un único candidato se selecciona directo', () => {
  const picked = pickArticleCandidate('lo que sea', [{ nombre: 'Lona Frontlit 510g' }]);
  assert.equal(picked.selected?.nombre, 'Lona Frontlit 510g');
  assert.equal(picked.ambiguous, false);
});

test('pickArticleCandidate: sin señal en el texto queda ambiguo', () => {
  const picked = pickArticleCandidate('quiero un precio', [{ nombre: 'Roll Up 85x200' }, { nombre: 'Vinilo Monomérico' }]);
  assert.equal(picked.selected, null);
  assert.equal(picked.ambiguous, true);
});

test('pickArticleCandidate: color-only qualifiers do not invent a more specific article subtype', () => {
  const candidates = [
    { nombre: 'Vinilo Monomérico' },
    { nombre: 'Vinilo Polimérico' },
    { nombre: 'Vinilo Transparente' },
    { nombre: 'Vinilo Microventosa Blanco' },
    { nombre: 'Vinilo Microventosa Transparente' },
    { nombre: 'Vinilo Especial Rojo' }
  ];

  const genericWhite = pickArticleCandidate('vinilo blanco 100x50', candidates);
  assert.equal(genericWhite.selected, null);
  assert.equal(genericWhite.ambiguous, true);

  const transparent = pickArticleCandidate('vinilo transparente 100x50', candidates);
  assert.equal(transparent.ambiguous, false);
  assert.equal(transparent.selected?.nombre, 'Vinilo Transparente');

  const microventosaWhite = pickArticleCandidate('vinilo microventosa blanco 100x50', candidates);
  assert.equal(microventosaWhite.ambiguous, false);
  assert.equal(microventosaWhite.selected?.nombre, 'Vinilo Microventosa Blanco');

  const genericRed = pickArticleCandidate('vinilo rojo 100x50', candidates);
  assert.equal(genericRed.selected, null);
  assert.equal(genericRed.ambiguous, true);
});

test('pickArticleCandidate: corpus-derived material discriminants select the intended article', () => {
  const candidates = [
    { nombre: 'PVC' },
    { nombre: 'PVC Suelo (Print floor)' },
    { nombre: 'Cartón Compacto' },
    { nombre: 'Cartón Microcanal' },
    { nombre: 'Cartón Pluma' },
    { nombre: 'Lona Frontlit 510g' },
    { nombre: 'Lona Doble Cara Blockout' },
    { nombre: 'Lona camión' },
    { nombre: 'Metacrilato Blanco Opal' },
    { nombre: 'Metacrilato Transparente' },
    { nombre: 'Trofeos Metacrilato' }
  ];

  assert.equal(pickArticleCandidate('pvc suelo 100x50', candidates).selected?.nombre, 'PVC Suelo (Print floor)');
  assert.equal(pickArticleCandidate('carton pluma 100x50', candidates).selected?.nombre, 'Cartón Pluma');
  assert.equal(pickArticleCandidate('carton microcanal 100x50', candidates).selected?.nombre, 'Cartón Microcanal');
  assert.equal(pickArticleCandidate('lona camion 100x50', candidates).selected?.nombre, 'Lona camión');
  assert.equal(pickArticleCandidate('lona doble cara blockout 100x50', candidates).selected?.nombre, 'Lona Doble Cara Blockout');
  assert.equal(pickArticleCandidate('metacrilato transparente 100x50', candidates).selected?.nombre, 'Metacrilato Transparente');
  assert.equal(pickArticleCandidate('metacrilato blanco opal 100x50', candidates).selected?.nombre, 'Metacrilato Blanco Opal');
});

test('matchOptionInText: resuelve la opción por su nombre real del catálogo', () => {
  const options = [
    { id: 117, nombre: 'Escuadrado' },
    { id: 118, nombre: 'Con Forma' }
  ];
  assert.deepEqual(matchOptionInText('lona con corte escuadrado', options), { id: 117, nombre: 'Escuadrado' });
  assert.deepEqual(matchOptionInText('la quiero con forma', options), { id: 118, nombre: 'Con Forma' });
});

test('matchOptionInText: casa por la raíz aunque el nombre tenga paréntesis', () => {
  const options = [
    { id: 17, nombre: 'Termosellado (todo el perímetro)' },
    { id: 18, nombre: 'sin refuerzo (a sangre)' }
  ];
  assert.deepEqual(matchOptionInText('con termosellado', options), {
    id: 17,
    nombre: 'Termosellado (todo el perímetro)'
  });
});

test('matchOptionInText: casa opciones numéricas aunque el usuario omita espacios', () => {
  const options = [
    { id: 10, nombre: '10 mm' },
    { id: 5, nombre: '5 mm' }
  ];
  assert.deepEqual(matchOptionInText('grosor 10mm', options), { id: 10, nombre: '10 mm' });
});

test('matchOptionInText: prioriza la opcion numerica especifica frente a prefijos genericos', () => {
  const options = [
    { id: 50, nombre: 'Todo el perímetro (cada 50 cm)' },
    { id: 100, nombre: 'Todo el perímetro (cada 100 cm)' }
  ];

  assert.deepEqual(matchOptionInText('ollado metálico todo el perímetro cada 100 cm', options), {
    id: 100,
    nombre: 'Todo el perímetro (cada 100 cm)'
  });
});

test('matchOptionInText: null si no aparece ninguna opción', () => {
  const options = [
    { id: 117, nombre: 'Escuadrado' },
    { id: 118, nombre: 'Con Forma' }
  ];
  assert.equal(matchOptionInText('una lona sin nada especial', options), null);
});
