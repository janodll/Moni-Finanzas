// Rellena cuota_actual / cuota_total en las transacciones que YA están guardadas.
//
// Dos fuentes:
//   1. La descripción. Los cargos de Interbank y Falabella ya venían con el texto
//      "(Cuota 7/12)" adentro; el dato siempre estuvo, solo que en una cadena.
//   2. La lista MANUALES de abajo, para compras que se cargaron por el total y
//      no dicen cuotas en ninguna parte (la moto de Cencosud).
//
// Requiere haber corrido antes sql/2026-09-28-cuotas.sql.
// Uso:  node scripts/backfill_cuotas.mjs          (solo muestra qué haría)
//       node scripts/backfill_cuotas.mjs --apply  (escribe)

const APPLY = process.argv.includes('--apply');
const { SUPABASE_URL, SUPABASE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_KEY en el entorno.');
  process.exit(1);
}
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// Compras cargadas por el total, que hay que marcar a mano porque el banco
// nunca mandó un correo diciendo en cuántas cuotas quedaron.
const MANUALES = [
  { match: /compra de moto/i, cuota_total: 12 }
];

const RE_CUOTA = /cuota\s*(\d+)\s*(?:\/|de)\s*(\d+)/i;

const txs = await (await fetch(`${SUPABASE_URL}/rest/v1/transacciones?select=*&order=id`, { headers: H })).json();
const cambios = [];

for (const t of txs) {
  if (t.tipo !== 'GASTO') continue;
  const texto = `${t.descripcion || ''} ${t.descripcion_original || ''}`;

  const m = RE_CUOTA.exec(texto);
  if (m) {
    const actual = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (total >= 2 && actual >= 1 && actual <= total &&
        (t.cuota_actual !== actual || t.cuota_total !== total)) {
      cambios.push({ id: t.id, fields: { cuota_actual: actual, cuota_total: total }, txt: `cuota ${actual}/${total}`, desc: texto.trim().slice(0, 46) });
    }
    continue;
  }

  const man = MANUALES.find(x => x.match.test(texto));
  if (man && t.cuota_total !== man.cuota_total) {
    cambios.push({ id: t.id, fields: { cuota_actual: null, cuota_total: man.cuota_total }, txt: `${man.cuota_total} cuotas (manual)`, desc: texto.trim().slice(0, 46) });
  }
}

if (!cambios.length) {
  console.log('No hay nada que rellenar. Todo al día.');
  process.exit(0);
}

console.log(`${cambios.length} transacciones por marcar:\n`);
for (const c of cambios) console.log(`  id ${String(c.id).padStart(4)}  ${c.txt.padEnd(20)} ${c.desc}`);

if (!APPLY) {
  console.log('\nEsto fue solo una simulación. Para escribir: node scripts/backfill_cuotas.mjs --apply');
  process.exit(0);
}

let ok = 0;
for (const c of cambios) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/transacciones?id=eq.${c.id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(c.fields)
  });
  if (r.ok) ok++;
  else console.error(`  ERROR en id ${c.id}: ${r.status} ${await r.text()}`);
}
console.log(`\nListo: ${ok}/${cambios.length} transacciones actualizadas.`);
