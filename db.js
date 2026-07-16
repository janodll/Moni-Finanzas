// db.js — acceso a la tabla de transacciones en Supabase (PostgREST, sin librerías nuevas)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function headers(extra = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...extra };
}
const BASE = () => `${SUPABASE_URL}/rest/v1/transacciones`;

// Trae todas las transacciones (más nuevas primero, como el unshift de antes)
export async function dbGetTransacciones() {
  const r = await fetch(`${BASE()}?select=*&order=id.desc`, { headers: headers() });
  if (!r.ok) throw new Error(`dbGetTransacciones ${r.status}: ${await r.text()}`);
  return await r.json();
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
