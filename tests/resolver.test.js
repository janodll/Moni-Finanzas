import test from 'node:test';
import assert from 'node:assert';
import { resolveAccountOrCard } from '../resolver.js';

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
