import test from 'node:test';
import assert from 'node:assert';
import { buscarCuentaEnTexto } from '../resolver.js';

const state = {
  cuentas: [
    { id: 1, nombre: 'BCP Jano', titular: 'Jano' },
    { id: 2, nombre: 'BCP Andrea', titular: 'Andrea' },
    { id: 3, nombre: 'Interbank Jano', titular: 'Jano' },
    { id: 4, nombre: 'BBVA Andrea', titular: 'Andrea' },
    { id: 5, nombre: 'Interbank Andrea', titular: 'Andrea' }
  ]
};
const id = (txt) => { const c = buscarCuentaEnTexto(txt, state); return c ? c.id : null; };

test('reconoce la cuenta cuando el texto la nombra sin ambiguedad', () => {
  assert.strictEqual(id('Interbank Jano'), 3);
  assert.strictEqual(id('interbank jano'), 3);
  assert.strictEqual(id('de mi cuenta interbank jano'), 3);
  assert.strictEqual(id('BCP Jano'), 1);
  assert.strictEqual(id('pague desde el bcp de andrea'), 2);
  assert.strictEqual(id('salio del bbva de andrea'), 4);
  assert.strictEqual(id('interbank de andrea'), 5);
});

test('devuelve null si el banco existe para las dos personas y no se dice cual', () => {
  // Hay Interbank Jano e Interbank Andrea: sin persona no se puede desempatar.
  assert.strictEqual(id('interbank'), null);
  assert.strictEqual(id('de mi cuenta interbank'), null);
  // Hay BCP Jano y BCP Andrea.
  assert.strictEqual(id('bcp'), null);
});

test('devuelve null si el texto nombra a las dos personas', () => {
  assert.strictEqual(id('interbank de jano y andrea'), null);
});

test('devuelve null cuando no se nombra ninguna cuenta', () => {
  assert.strictEqual(id('almuerzo'), null);
  assert.strictEqual(id('taxi al centro'), null);
  assert.strictEqual(id(''), null);
  assert.strictEqual(id(null), null);
});

test('un banco que no existe no inventa cuenta', () => {
  assert.strictEqual(id('scotiabank jano'), null);
  assert.strictEqual(id('pague con yape'), null);
});

test('"jano" dentro de otra palabra no cuenta como la persona', () => {
  // "cirujano" contiene "jano". No debe desempatar un Interbank ambiguo.
  assert.strictEqual(id('le pague al cirujano con interbank'), null);
});

test('BBVA solo existe para Andrea: no hace falta nombrarla', () => {
  assert.strictEqual(id('bbva'), 4);
});
