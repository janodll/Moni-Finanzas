import test from 'node:test';
import assert from 'node:assert';
import { resolveAccountOrCard, buscarPorUltimos4, normalizarUltimos4, esTransferenciaSegunUsuario } from '../resolver.js';

// Estado real del proyecto (ver ESTADO.md seccion 3). Nota que NO existe ninguna
// tarjeta BCP: BCP es solo cuenta de debito, para Jano y para Andrea.
const state = {
  cuentas: [
    { id: 1, nombre: 'BCP Jano', titular: 'Jano' },
    { id: 2, nombre: 'BCP Andrea', titular: 'Andrea' },
    { id: 3, nombre: 'Interbank Jano', titular: 'Jano' },
    { id: 4, nombre: 'BBVA Andrea', titular: 'Andrea' },
    { id: 5, nombre: 'Interbank Andrea', titular: 'Andrea' }
  ],
  tarjetas: [
    { id: 1, nombre: 'CMR Falabella', titular: 'Jano/Andrea' },
    { id: 2, nombre: 'Interbank Jano', titular: 'Jano' },
    { id: 3, nombre: 'Interbank Andrea', titular: 'Andrea' },
    { id: 5, nombre: 'Tarjeta BBVA', titular: 'Andrea' },
    { id: 6, nombre: 'Cencosud', titular: 'Andrea' },
    { id: 7, nombre: 'SIP Andrea', titular: 'Andrea' }
  ]
};

// Mismo calculo que hace el llamador en server.js: "Tarjeta BCP ..." NO esta en la
// lista, asi que isCreditCard llega en false.
const esTarjetaCredito = (b) =>
  ['falabella', 'cmr', 'tarjeta bbva', 'tarjeta oh', 'tarjeta interbank', 'tarjeta cencosud']
    .some(k => b.toLowerCase().includes(k));

test('una etiqueta "Tarjeta BCP" cae en la cuenta BCP, no en el vacio', () => {
  // Regresion de los ids 686 (US$500 alquiler, 30/08) y 698 (S/250 mantenimiento,
  // 31/08): el lector escribio "Tarjeta BCP Andrea", el resolvedor devolvio los dos
  // ids en null y las filas entraron INERTES — registradas pero invisibles en los
  // saldos. Telegram igual confirmo "Registrado con exito".
  assert.deepStrictEqual(
    resolveAccountOrCard('Tarjeta BCP Andrea', esTarjetaCredito('Tarjeta BCP Andrea'), state),
    { cuenta_id: 2, tarjeta_id: null }
  );
  assert.deepStrictEqual(
    resolveAccountOrCard('Tarjeta BCP Jano', esTarjetaCredito('Tarjeta BCP Jano'), state),
    { cuenta_id: 1, tarjeta_id: null }
  );
});

test('las tarjetas de credito reales siguen resolviendo igual', () => {
  const casos = [
    ['Tarjeta Interbank Jano', { cuenta_id: null, tarjeta_id: 2 }],
    ['Tarjeta Interbank Andrea', { cuenta_id: null, tarjeta_id: 3 }],
    ['CMR Falabella', { cuenta_id: null, tarjeta_id: 1 }],
    ['CMR Falabella Andrea', { cuenta_id: null, tarjeta_id: 1 }],
    ['Tarjeta BBVA Andrea', { cuenta_id: null, tarjeta_id: 5 }],
    ['Tarjeta Cencosud Andrea', { cuenta_id: null, tarjeta_id: 6 }]
  ];
  for (const [banco, esperado] of casos) {
    assert.deepStrictEqual(resolveAccountOrCard(banco, esTarjetaCredito(banco), state), esperado, banco);
  }
});

test('las cuentas de debito y billeteras siguen resolviendo igual', () => {
  const casos = [
    ['BCP Jano', { cuenta_id: 1, tarjeta_id: null }],
    ['BCP Andrea', { cuenta_id: 2, tarjeta_id: null }],
    ['Interbank Jano', { cuenta_id: 3, tarjeta_id: null }],
    ['Yape', { cuenta_id: 1, tarjeta_id: null }],
    ['Yape Jano', { cuenta_id: 1, tarjeta_id: null }],
    ['Plin', { cuenta_id: 3, tarjeta_id: null }]
  ];
  for (const [banco, esperado] of casos) {
    assert.deepStrictEqual(resolveAccountOrCard(banco, esTarjetaCredito(banco), state), esperado, banco);
  }
});

test('un banco que de verdad no existe sigue devolviendo null (no se inventa cuenta)', () => {
  assert.deepStrictEqual(
    resolveAccountOrCard('Tarjeta Scotiabank Jano', false, state),
    { cuenta_id: null, tarjeta_id: null }
  );
  assert.deepStrictEqual(
    resolveAccountOrCard('', false, state),
    { cuenta_id: null, tarjeta_id: null }
  );
});

test('la tarjeta SIP de Andrea se reconoce escrita de varias formas', () => {
  const casos = ['SIP Andrea', 'Tarjeta SIP Andrea', 'sip andrea', 'Tarjeta SIP'];
  for (const banco of casos) {
    assert.deepStrictEqual(
      resolveAccountOrCard(banco, esTarjetaCredito(banco), state),
      { cuenta_id: null, tarjeta_id: 7 }, banco
    );
  }
});

test('una palabra que contenga "sip" no manda el gasto a la tarjeta SIP', () => {
  // "Sipan" contiene sip: no debe calzar. Sin tarjeta ni cuenta que corresponda, da null.
  assert.deepStrictEqual(
    resolveAccountOrCard('Restaurante Sipan', false, state),
    { cuenta_id: null, tarjeta_id: null }
  );
});

// ===========================================================================
// ULTIMOS 4 DIGITOS
// ===========================================================================
// El caso real: Jano tiene cuenta Interbank Y tarjeta Interbank. Cuando el correo
// no decia "Tarjeta de Credito", el lector mandaba "Interbank Jano" pelado y el
// gasto de la tarjeta salia de la cuenta. Paso 5 veces. Los 4 digitos los escribe
// el banco, no la IA, asi que no se prestan a interpretacion.

// Mismo estado de arriba pero con los digitos declarados.
const stateDigitos = {
  cuentas: [
    { id: 1, nombre: 'BCP Jano', titular: 'Jano', ultimos4: '1122' },
    { id: 3, nombre: 'Interbank Jano', titular: 'Jano', ultimos4: '9037' },
    { id: 4, nombre: 'BBVA Andrea', titular: 'Andrea', ultimos4: '7788' }
  ],
  tarjetas: [
    { id: 2, nombre: 'Interbank Jano', titular: 'Jano', tipo: 'Credito', ultimos4: '4821' },
    { id: 5, nombre: 'Tarjeta BBVA', titular: 'Andrea', tipo: 'Credito', ultimos4: ['3344', '3345'] }
  ]
};

test('normalizarUltimos4() acepta las formas en que los bancos los escriben', () => {
  assert.strictEqual(normalizarUltimos4('4821'), '4821');
  assert.strictEqual(normalizarUltimos4('****4821'), '4821');
  assert.strictEqual(normalizarUltimos4('XXXX-XXXX-XXXX-4821'), '4821');
  assert.strictEqual(normalizarUltimos4(4821), '4821');
  assert.strictEqual(normalizarUltimos4('482'), null);   // muy corto: no se inventa
  assert.strictEqual(normalizarUltimos4(''), null);
  assert.strictEqual(normalizarUltimos4(null), null);
});

test('los 4 digitos mandan sobre el nombre que escribio la IA', () => {
  // El correo de la creatina decia "Interbank Jano" (nombre de la CUENTA) pero los
  // digitos eran los de la TARJETA. Antes el gasto salia de la cuenta: 159.50 de
  // descuadre. Ahora el numero gana.
  assert.deepStrictEqual(
    resolveAccountOrCard('Interbank Jano', false, stateDigitos, '4821'),
    { cuenta_id: null, tarjeta_id: 2 }
  );
  // Y al reves: aunque el texto diga "Tarjeta", si los digitos son de la cuenta,
  // es la cuenta.
  assert.deepStrictEqual(
    resolveAccountOrCard('Tarjeta Interbank Jano', true, stateDigitos, '9037'),
    { cuenta_id: 3, tarjeta_id: null }
  );
});

test('una tarjeta puede tener varios finales declarados', () => {
  assert.deepStrictEqual(buscarPorUltimos4('3344', stateDigitos), { cuenta_id: null, tarjeta_id: 5 });
  assert.deepStrictEqual(buscarPorUltimos4('3345', stateDigitos), { cuenta_id: null, tarjeta_id: 5 });
});

test('si los digitos no calzan con nada, se cae al emparejado por nombre', () => {
  // No se inventa nada: sigue el camino de siempre.
  assert.deepStrictEqual(
    resolveAccountOrCard('Interbank Jano', false, stateDigitos, '0000'),
    { cuenta_id: 3, tarjeta_id: null }
  );
  assert.strictEqual(buscarPorUltimos4('0000', stateDigitos), null);
});

test('si dos productos terminan igual, no se adivina', () => {
  const ambiguo = {
    cuentas: [{ id: 1, nombre: 'BCP Jano', ultimos4: '4821' }],
    tarjetas: [{ id: 2, nombre: 'Interbank Jano', tipo: 'Credito', ultimos4: '4821' }]
  };
  // Dos calzan: devuelve null y deja que decida el nombre. Elegir uno al azar es
  // justo lo que descuadra los saldos.
  assert.strictEqual(buscarPorUltimos4('4821', ambiguo), null);
});

test('sin digitos en el correo, todo sigue funcionando como antes', () => {
  assert.deepStrictEqual(
    resolveAccountOrCard('Tarjeta Interbank Jano', true, stateDigitos, null),
    { cuenta_id: null, tarjeta_id: 2 }
  );
  assert.deepStrictEqual(
    resolveAccountOrCard('Interbank Jano', false, stateDigitos, undefined),
    { cuenta_id: 3, tarjeta_id: null }
  );
});

test('los productos sin digitos declarados no capturan correos ajenos', () => {
  // Las cuentas de Andrea no tienen ultimos4 en stateDigitos: un correo con
  // digitos desconocidos no debe caer en ellas por descarte.
  assert.strictEqual(buscarPorUltimos4('5555', stateDigitos), null);
});

// ===========================================================================
// TRANSFERENCIA vs PAGO DE TARJETA
// ===========================================================================

test('una transferencia escrita por Jano no es un pago de tarjeta', () => {
  // Los dos casos reales del 15/10. Se registraron como pagos de tarjeta: la plata
  // no llegó a la cuenta destino y encima bajó la deuda de una tarjeta que nadie pagó.
  assert.strictEqual(esTransferenciaSegunUsuario('Transferencia a interbank Andrea'), true);
  assert.strictEqual(esTransferenciaSegunUsuario('Transferencia a Interbank Jano'), true);
  assert.strictEqual(esTransferenciaSegunUsuario('transferi a mi bbva'), true);
  assert.strictEqual(esTransferenciaSegunUsuario('Transferencia a Andrea'), true);
});

test('si nombra una tarjeta, se respeta el pago de tarjeta', () => {
  // Pagar la tarjeta POR transferencia sigue siendo pagar la tarjeta.
  assert.strictEqual(esTransferenciaSegunUsuario('transferencia para pagar la tarjeta CMR'), false);
  assert.strictEqual(esTransferenciaSegunUsuario('transferencia a mi tc interbank'), false);
  assert.strictEqual(esTransferenciaSegunUsuario('transferencia a la visa'), false);
});

test('sin la palabra transferencia no se mete en el medio', () => {
  assert.strictEqual(esTransferenciaSegunUsuario('Pago mi tc'), false);
  assert.strictEqual(esTransferenciaSegunUsuario('almuerzo'), false);
  assert.strictEqual(esTransferenciaSegunUsuario(''), false);
  assert.strictEqual(esTransferenciaSegunUsuario(null), false);
});
