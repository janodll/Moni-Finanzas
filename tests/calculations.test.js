import test from 'node:test';
import assert from 'node:assert';
import { addOneMonth, formatDateStr, calculateBalances, getMontoEnSoles, mesesTranscurridos, calcularCuotas } from '../public/js/calculations.js';

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

  // TEST-01: se fija el mes de cálculo para que el test sea determinista
  // (no depende de la fecha real en que se ejecute la suite)
  const result = calculateBalances(mockState, '2026-06');

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

test('getMontoEnSoles() multi-currency conversion', () => {
  // Transacción en US$ se convierte con el tipo de cambio
  assert.strictEqual(getMontoEnSoles({ monto: 10, moneda: 'US$' }, 3.5), 35);
  // Transacción en soles (explícita o legacy sin campo moneda) no se convierte
  assert.strictEqual(getMontoEnSoles({ monto: 10, moneda: 'S/.' }, 3.5), 10);
  assert.strictEqual(getMontoEnSoles({ monto: 10 }, 3.5), 10);
  // Monto inválido no rompe el cálculo
  assert.strictEqual(getMontoEnSoles({ monto: 'abc', moneda: 'US$' }, 3.5), 0);
});

test('calculateBalances() with USD transactions', () => {
  const mockState = {
    cuentas: [{ id: 1, nombre: 'BCP', tipo: 'Debito' }],
    tarjetas: [{ id: 1, nombre: 'Visa', tipo: 'Credito' }],
    configuracion: { tipo_cambio_usd: 4.0 },
    transacciones: [
      { id: 1, fecha: '2026-06-01', tipo: 'INGRESO', monto: 1000, categoria: 'Sueldo', cuenta_id: 1, tarjeta_id: null },
      // Gasto de 10 USD desde cuenta de débito -> 40 soles
      { id: 2, fecha: '2026-06-02', tipo: 'GASTO', monto: 10, moneda: 'US$', categoria: 'Comida', cuenta_id: 1, tarjeta_id: null },
      // Gasto de 25 USD en tarjeta de crédito -> 100 soles de deuda
      { id: 3, fecha: '2026-06-03', tipo: 'GASTO', monto: 25, moneda: 'US$', categoria: 'Otros', cuenta_id: null, tarjeta_id: 1 }
    ]
  };

  const result = calculateBalances(mockState, '2026-06');

  assert.strictEqual(result.saldosCuentas[1], 960);     // 1000 - 40
  assert.strictEqual(result.deudasTarjetas[1], 100);    // 25 * 4.0
  assert.strictEqual(result.balanceGeneral, 860);       // 960 - 100
  assert.strictEqual(result.egresosMes, 140);           // 40 + 100
  assert.strictEqual(result.gastosPorCategoriaEsteMes['Comida'], 40);
});

// ===========================================================================
// CUOTAS
// ===========================================================================

test('mesesTranscurridos() no cuenta el mes hasta que se cumple el día', () => {
  assert.strictEqual(mesesTranscurridos('2026-07-22', '2026-08-21'), 0);
  assert.strictEqual(mesesTranscurridos('2026-07-22', '2026-08-22'), 1);
  assert.strictEqual(mesesTranscurridos('2026-07-22', '2026-09-28'), 2);
  assert.strictEqual(mesesTranscurridos('2026-09-01', '2026-08-01'), 0); // nunca negativo
});

// REGRESIÓN: el error que rompió la confianza. El cálculo contaba los meses del
// calendario y daba por pagada una cuota por mes. La moto se compró el 22/07 y
// la primera cuota se pagó recién el 16/09: al 28/09 va 1 de 12, no 2.
test('calcularCuotas() NO deduce cuotas pagadas del paso del tiempo', () => {
  const moto = {
    id: 1, fecha: '2026-07-22', tipo: 'GASTO', monto: 6995, tarjeta_id: 6,
    descripcion: 'Compra de Moto', cuota_total: 12, cuota_actual: 1
  };

  const enSetiembre = calcularCuotas([moto], 3.4, '2026-09-28');
  const unAnoDespues = calcularCuotas([moto], 3.4, '2027-09-28');

  // Pase el tiempo que pase, si nadie confirmó otra cuota, sigue en 1 de 12.
  assert.strictEqual(enSetiembre.detalle[0].pagadas, 1);
  assert.strictEqual(unAnoDespues.detalle[0].pagadas, 1);
  assert.strictEqual(enSetiembre.detalle[0].restantes, 11);
  assert.strictEqual(unAnoDespues.detalle[0].restantes, 11);
});

test('calcularCuotas() caso A: un solo cargo por el total (la moto)', () => {
  const txs = [
    { id: 1, fecha: '2026-07-22', tipo: 'GASTO', monto: 6995, tarjeta_id: 6,
      descripcion: 'Compra de Moto', cuota_total: 12, cuota_actual: 1, cuota_es_total: true }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-28');

  assert.ok(Math.abs(r.cuotaMensual - 582.9166) < 0.01); // 6995 / 12
  assert.strictEqual(r.detalle[0].restantes, 11);
  assert.ok(Math.abs(r.saldoEnDeuda - 6412.0833) < 0.01); // 11 cuotas, ya en la deuda
  assert.strictEqual(r.comprometidoFuturo, 0);
});

test('calcularCuotas() sin confirmación de cuotas pagadas, asume cero', () => {
  // Se sabe que son 12 cuotas pero nadie dijo cuántas van: se debe todo.
  // Preferible pasarse por prudente que inventar un avance que no existe.
  const txs = [
    { id: 1, fecha: '2026-07-22', tipo: 'GASTO', monto: 6995, tarjeta_id: 6,
      descripcion: 'Compra de Moto', cuota_total: 12, cuota_actual: null, cuota_es_total: true }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-28');
  assert.strictEqual(r.detalle[0].pagadas, 0);
  assert.strictEqual(r.detalle[0].restantes, 12);
});

test('calcularCuotas() caso B: el banco cobra una cuota por mes', () => {
  // Interbank cobró "Mercado Pago (Cuota 7/12)" de S/ 240.75 el 19/06.
  const txs = [
    { id: 2, fecha: '2026-06-19', tipo: 'GASTO', monto: 240.75, tarjeta_id: 3,
      descripcion: 'Mercado Pago', cuota_actual: 7, cuota_total: 12 }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-28');

  assert.strictEqual(r.cuotaMensual, 240.75);
  assert.strictEqual(r.detalle[0].pagadas, 7);   // lo que dijo el banco, sin adornos
  assert.strictEqual(r.detalle[0].restantes, 5);
  assert.strictEqual(r.saldoEnDeuda, 0);         // lo que falta aún no está cargado
  assert.ok(Math.abs(r.comprometidoFuturo - 1203.75) < 0.01);
  // Y avisa que el dato tiene 3 meses encima.
  assert.strictEqual(r.detalle[0].mesesSinConfirmar, 3);
});

test('calcularCuotas() no cuenta dos veces la misma compra del caso B', () => {
  // El lector leyó el correo de la cuota 7 y el de la 8. Es UNA compra.
  const txs = [
    { id: 3, fecha: '2026-06-19', tipo: 'GASTO', monto: 240.75, tarjeta_id: 3,
      descripcion_original: 'Mercado Pago', cuota_actual: 7, cuota_total: 12 },
    { id: 4, fecha: '2026-07-19', tipo: 'GASTO', monto: 240.75, tarjeta_id: 3,
      descripcion_original: 'Mercado Pago', cuota_actual: 8, cuota_total: 12 }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-28');

  assert.strictEqual(r.detalle.length, 1);
  assert.strictEqual(r.cuotaMensual, 240.75); // no 481.50
  assert.strictEqual(r.detalle[0].pagadas, 8); // la confirmación más reciente
});

test('calcularCuotas() ignora las cuotas que ya terminaron', () => {
  const txs = [
    { id: 5, fecha: '2026-06-19', tipo: 'GASTO', monto: 299.85, tarjeta_id: 3,
      descripcion: 'Mercadolibre', cuota_actual: 6, cuota_total: 6 }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-28');
  assert.strictEqual(r.detalle.length, 0);
  assert.strictEqual(r.cuotaMensual, 0);
});

test('calcularCuotas() convierte las cuotas en dólares a soles', () => {
  const txs = [
    { id: 7, fecha: '2026-08-10', tipo: 'GASTO', monto: 100, moneda: 'US$', tarjeta_id: 2,
      descripcion: 'Compra internacional', cuota_actual: 1, cuota_total: 6 }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-10');
  assert.strictEqual(r.cuotaMensual, 340); // 100 USD * 3.4
});

test('calcularCuotas() ignora transacciones sin cuotas y los pagos', () => {
  const txs = [
    { id: 8, fecha: '2026-09-01', tipo: 'GASTO', monto: 50, tarjeta_id: 1, descripcion: 'Almuerzo' },
    { id: 9, fecha: '2026-09-01', tipo: 'GASTO', monto: 50, tarjeta_id: 1, cuota_total: 1 },
    { id: 10, fecha: '2026-09-02', tipo: 'INGRESO', monto: 500, tarjeta_id: 1, cuota_total: 12 }
  ];
  const r = calcularCuotas(txs, 3.4, '2026-09-28');
  assert.strictEqual(r.detalle.length, 0);
});

test('calculateBalances() separa el consumo rotativo de la deuda en cuotas', () => {
  const mockState = {
    cuentas: [{ id: 1, nombre: 'BCP', tipo: 'Debito' }],
    tarjetas: [{ id: 6, nombre: 'Cencosud', tipo: 'Credito' }],
    configuracion: { tipo_cambio_usd: 3.4 },
    transacciones: [
      { id: 1, fecha: '2026-07-22', tipo: 'GASTO', monto: 6995, categoria: 'Transporte',
        cuenta_id: null, tarjeta_id: 6, cuota_total: 12, cuota_actual: 1, cuota_es_total: true },
      { id: 2, fecha: '2026-09-26', tipo: 'GASTO', monto: 142.04, categoria: 'Comida',
        cuenta_id: null, tarjeta_id: 6 }
    ]
  };
  const r = calculateBalances(mockState, '2026-09', '2026-09-28');

  assert.ok(Math.abs(r.sumaDeudas - 7137.04) < 0.01);
  assert.ok(Math.abs(r.cuotas.saldoEnDeuda - 6412.0833) < 0.01); // 11 cuotas vivas
  assert.ok(Math.abs(r.consumoRotativo - 724.9567) < 0.01);
});
