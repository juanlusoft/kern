import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHoldedReadRoutingOverride } from '../src/holded-read';

test('derives invoice status list routes without customer when request is explicit', () => {
  assert.deepEqual(deriveHoldedReadRoutingOverride('Dime las facturas vencidas'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'invoice',
      payment_status: 'overdue'
    }
  });

  assert.deepEqual(deriveHoldedReadRoutingOverride('Dime las facturas pagadas'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'invoice',
      payment_status: 'paid'
    }
  });
});

test('derives invoice status list routes with customer when present', () => {
  assert.deepEqual(deriveHoldedReadRoutingOverride('Dime las facturas pendientes de DANIEL GARCIA BENITEZ'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'invoice',
      payment_status: 'pending',
      customer_id: 'DANIEL GARCIA BENITEZ'
    }
  });
});

test('derives year and latest document routes for Holded reads', () => {
  assert.deepEqual(deriveHoldedReadRoutingOverride('Dime las facturas de 2026'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'invoice',
      year: '2026'
    }
  });

  assert.deepEqual(deriveHoldedReadRoutingOverride('Dime el último presupuesto de DANIEL GARCIA BENITEZ'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'estimate',
      customer_id: 'DANIEL GARCIA BENITEZ'
    }
  });

  assert.deepEqual(deriveHoldedReadRoutingOverride('Necesito las 3 últimas facturas de Granapublic'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'invoice',
      customer_id: 'Granapublic',
      limit: 3
    }
  });
});

test('derives direct document code routes for Holded reads', () => {
  assert.deepEqual(deriveHoldedReadRoutingOverride('Necesito la información del presupuesto de Grupo M&T (P26/04685)'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'estimate',
      estimate_id: 'P26/04685'
    }
  });

  assert.deepEqual(deriveHoldedReadRoutingOverride('Dame la factura F26/1931'), {
    force_capability_key: 'mock.resource.read',
    force_params: {
      resource_type: 'invoice',
      estimate_id: 'F26/1931'
    }
  });
});

test('does not route vague Holded mentions', () => {
  assert.equal(deriveHoldedReadRoutingOverride('Dime las facturas'), null);
  assert.equal(deriveHoldedReadRoutingOverride('Necesito las 3 facturas vencidas de Granapublic'), null);
  assert.equal(deriveHoldedReadRoutingOverride('Puedes acceder a la web de pacoprint?'), null);
});
