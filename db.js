// db.js — acceso a la tabla de transacciones en Supabase (PostgREST, sin librerías nuevas)
//
// SUPABASE_URL/KEY se leen de process.env en cada llamada (no como const de módulo):
// server.js carga .env manualmente para uso local, y ese import de db.js se evalúa
// antes de que ese parseo corra, así que capturarlas al importar dejaría siempre
// undefined en local (en Render sí llegan seteadas antes de arrancar node).
function headers(extra = {}) {
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...extra };
}
const BASE = () => `${process.env.SUPABASE_URL}/rest/v1/transacciones`;

// Trae TODAS las transacciones (más nuevas primero, como el unshift de antes).
//
// Hay que paginar: PostgREST nunca devuelve más de 1000 filas por pedido, y lo hace
// en silencio — responde 200 con las primeras 1000 y nadie se entera. Pedirlas sin
// paginar funcionó hasta que el historial paso las 1000 filas; de ahi en adelante la
// app dejo de ver las mas VIEJAS, que son justo los saldos y deudas iniciales del
// 28/05. El 29/10 el dashboard mostraba un balance de -7,473 cuando el real era
// -13,397: le faltaban 28 filas y con ellas S/ 7,559 de deuda inicial.
//
// Se pagina por id (keyset) y no por offset: un INSERT concurrente corre los offsets
// y haria saltar o duplicar filas, mientras que el id ya recorrido no se mueve.
export async function dbGetTransacciones() {
  const PAGINA = 1000;
  const todas = [];
  let cursor = null; // ultimo id traido; las paginas siguientes piden ids menores

  for (let i = 0; i < 1000; i++) { // tope de seguridad: 1M filas
    const filtro = cursor === null ? '' : `&id=lt.${cursor}`;
    const r = await fetch(`${BASE()}?select=*&order=id.desc&limit=${PAGINA}${filtro}`, { headers: headers() });
    if (!r.ok) throw new Error(`dbGetTransacciones ${r.status}: ${await r.text()}`);
    const pagina = await r.json();
    todas.push(...pagina);
    if (pagina.length < PAGINA) return todas;
    cursor = pagina[pagina.length - 1].id;
  }
  throw new Error('dbGetTransacciones: demasiadas páginas, algo anda mal con el cursor');
}

// Inserta una transacción. Devuelve la fila creada (con id). Si choca con el
// índice único de nro_operacion (409), devuelve null (duplicado ignorado).
export async function dbInsert(tx) {
  const r = await fetch(BASE(), {
    method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(tx)
  });
  if (r.status === 409) { console.log('[db] Duplicado por nro_operacion, ignorado:', tx.nro_operacion); return null; }
  if (!r.ok) throw new Error(`dbInsert ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

// Inserta un par de transferencia/pago (gasto + ingreso) enlazadas por transfer_id.
export async function dbInsertPair(gasto, ingreso) {
  const g = await dbInsert(gasto);
  if (!g) return { gasto: null, ingreso: null };
  await dbUpdate(g.id, { transfer_id: g.id });
  const i = await dbInsert({ ...ingreso, transfer_id: g.id });
  return { gasto: { ...g, transfer_id: g.id }, ingreso: i };
}

export async function dbUpdate(id, fields) {
  const r = await fetch(`${BASE()}?id=eq.${id}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(fields)
  });
  if (!r.ok) throw new Error(`dbUpdate ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

export async function dbDelete(id) {
  const r = await fetch(`${BASE()}?id=eq.${id}`, { method: 'DELETE', headers: headers() });
  if (!r.ok) throw new Error(`dbDelete ${r.status}: ${await r.text()}`);
}

export async function dbDeleteByTransfer(transferId) {
  const r = await fetch(`${BASE()}?transfer_id=eq.${transferId}`, { method: 'DELETE', headers: headers() });
  if (!r.ok) throw new Error(`dbDeleteByTransfer ${r.status}: ${await r.text()}`);
}
