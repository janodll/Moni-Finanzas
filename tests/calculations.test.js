import test from 'node:test';
import assert from 'node:assert';
import { addOneMonth, formatDateStr, calculateBalances } from '../public/js/calculations.js';

test('addOneMonth() date rollover tests', () => {
  // Test basic rollover
  assert.strictEqual(addOneMonth('2026-06-10'), '2026-07-10');
  // Test end of month clipping
  assert.strictEqual(addOneMonth('2026-01-31'), '2026-02-28');
  // Test leap year
  assert.strictEqual(addOneMonth('2024-01-31'), '2024-02-29');
  // Test year rollover
  assert.strictEqual(addOneMonth('2026-12-15'), '2027-01-15');
});

test('formatDateStr() format formatting tests', () => {
  assert.strictEqual(formatDateStr('2026-06-05', 'DD/MM/YYYY'), '05/06/2026');
  assert.strictEqual(formatDateStr('2026-06-05', 'YYYY-MM-DD'), '2026-06-05');
  assert.strictEqual(formatDateStr(null), 'N/A');
});

test('calculateBalances() accounting engine calculations', () => {
  // Mock state
  const mockState = {
    cuentas: [
      { id: 1, nombre: 'Efectivo', tipo: 'Debito' },
      { id: 2, nombre: 'Ahorros', tipo: 'Debito' }
    ],
    tarjetas: [
      { id: 1, nombre: 'Interbank', tipo: 'Credito' }
    ],
    transacciones: [
      // Saldo inicial
      { id: '1', fecha: '2026-06-01', tipo: 'INGRESO', monto: 1000, categoria: 'Saldo Inicial', cuenta_id: 1, tarjeta_id: null },
      // Gasto normal
      { id: '2', fecha: '2026-06-02', tipo: 'GASTO', monto: 100, categoria: 'Comida', cuenta_id: 1, tarjeta_id: null },
      // Gasto en tarjeta de crédito (incrementa deuda)
      { id: '3', fecha: '2026-06-03', tipo: 'GASTO', monto: 300, categoria: 'Servicios', cuenta_id: null, tarjeta_id: 1 },
      // Transferencia interna (no afecta balance global, pero cambia saldos de cuentas)
      { id: '4', fecha: '2026-06-04', tipo: 'GASTO', categoria: 'Transferencia', monto: 200, cuenta_id: 1, tarjeta_id: null },
      { id: '5', fecha: '2026-06-04', tipo: 'INGRESO', categoria: 'Transferencia', monto: 200, cuenta_id: 2, tarjeta_id: null }
    ]
  };

  const result = calculateBalances(mockState);

  // Cuentas:
  // Cuenta 1: 1000 (inicial) - 100 (gasto) - 200 (transferencia) = 700
  assert.strictEqual(result.saldosCuentas[1], 700);
  // Cuenta 2: 200 (transferencia) = 200
  assert.strictEqual(result.saldosCuentas[2], 200);

  // Tarjetas:
  // Tarjeta 1: 300 (gasto) = 300 deuda
  assert.strictEqual(result.deudasTarjetas[1], 300);

  // Balance General:
  // (700 + 200) - 300 = 600
  assert.strictEqual(result.balanceGeneral, 600);

  // Totales mensuales (este mes):
  // Ingresos del mes (excluyendo Saldo Inicial y Transferencias): 0
  // Egresos del mes (excluyendo Transferencias): 100 (Comida) + 300 (Servicios) = 400
  assert.strictEqual(result.ingresosMes, 0);
  assert.strictEqual(result.egresosMes, 400);

  // Gastos por categoría:
  assert.strictEqual(result.gastosPorCategoriaEsteMes['Comida'], 100);
  assert.strictEqual(result.gastosPorCategoriaEsteMes['Servicios'], 300);
});
