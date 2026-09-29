// Rellena los campos de cuotas en las transacciones que YA están guardadas.
//
// Solo escribe lo que está CONFIRMADO por una fuente real:
//   1. La descripción, cuando el propio banco escribió "(Cuota 7/12)" adentro.
//      El dato siempre estuvo, solo que atrapado en una cadena de texto.
//   2. La lista MANUALES, para compras que Jano confirmó a mano.
//
// Lo que NO calza entre una fuente y otra va a CONFLICTOS: se reporta y no se
// toca. Es preferible un hueco visible a un número inventado que después nadie
// puede distinguir de uno real.
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

// Compras cargadas por el total, confirmadas por Jano. De estas no llega ningún
// correo que diga en cuántas cuotas quedaron, así que no hay de dónde leerlas.
const MANUALES = [
  {
    // El préstamo Falabella no es una compra en cuotas de la tarjeta: son pagos
    // mensuales sueltos, cada uno su propia fila. Contar filas no dice cuántas
    // faltan (los meses sin registrar no dejan rastro), así que el plan se
    // ancla en el ÚLTIMO pago hecho y lo confirmó Jano.
    id: 737,                                  // pago del 10/09, el 4to de 6
    fields: {
      cuota_total: 6,
      cuota_actual: 4,
      cuota_es_total: false,                  // el monto de la fila es UNA cuota
      cuota_confirmada_el: '2026-09-10'
    },
    nota: 'prestamo S/1000 en 6 cuotas, van 4 (confirmado por Jano)'
  },
  {
    match: /compra de moto/i,
    fields: {
      cuota_total: 12,
      cuota_actual: 1,                        // único pago a Cencosud: 16/09
      cuota_es_total: true,                   // el monto es la moto entera
      cuota_confirmada_el: '2026-09-16'
    },
    nota: '12 cuotas, 1 pagada (confirmado por Jano)'
  }
];

// Filas que el script NO sabe interpretar y por lo tanto no toca.
const CONFLICTOS = [];

// Filas cuyo texto SÍ calza con "Cuota N/M" pero que hay que dejar limpias,
// porque el plan ya está anclado en otra fila y contarlas lo duplicaría.
// La 81 es el mismo préstamo Falabella que la 737: alguien tipeó "Cuota 1/12"
// a mano en mayo, el plan real es de 6 cuotas y va anclado en el último pago.
const LIMPIAR = [81];

const RE_CUOTA = /cuota\s*(\d+)\s*(?:\/|de)\s*(\d+)/i;

const txs = await (await fetch(`${SUPABASE_URL}/rest/v1/transacciones?select=*&order=id`, { headers: H })).json();
const cambios = [];
const pendientes = [];

for (const t of txs) {
  if (t.tipo !== 'GASTO') continue;
  const texto = `${t.descripcion || ''} ${t.descripcion_original || ''}`.trim();

  if (LIMPIAR.includes(t.id)) {
    if (t.cuota_total !== null) {
      cambios.push({
        id: t.id,
        fields: { cuota_actual: null, cuota_total: null, cuota_es_total: null, cuota_confirmada_el: null },
        txt: 'LIMPIAR: duplica un plan ya anclado en otra fila',
        desc: texto.slice(0, 44)
      });
    }
    continue;
  }

  const conflicto = CONFLICTOS.find(c => c.match.test(texto));
  if (conflicto) {
    pendientes.push({ id: t.id, desc: texto.slice(0, 44), ...conflicto });
    continue;
  }

  const man = MANUALES.find(x => (x.id ? x.id === t.id : x.match.test(texto)));
  if (man) {
    cambios.push({ id: t.id, fields: { ...man.fields }, txt: man.nota, desc: texto.slice(0, 44) });
    continue;
  }

  const m = RE_CUOTA.exec(texto);
  if (m) {
    const actual = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (total >= 2 && actual >= 1 && actual <= total) {
      cambios.push({
        id: t.id,
        fields: { cuota_actual: actual, cuota_total: total, cuota_es_total: false, cuota_confirmada_el: t.fecha },
        txt: `cuota ${actual}/${total} segun el banco`,
        desc: texto.slice(0, 44)
      });
    }
  }
}

if (cambios.length) {
  console.log(`${cambios.length} transacciones por marcar:\n`);
  for (const c of cambios) console.log(`  id ${String(c.id).padStart(4)}  ${c.txt.padEnd(38)} ${c.desc}`);
} else {
  console.log('No hay nada que rellenar.');
}

if (pendientes.length) {
  console.log(`\n${pendientes.length} necesitan que Jano confirme (NO se tocan):\n`);
  for (const p of pendientes) console.log(`  id ${String(p.id).padStart(4)}  ${p.desc}\n          ${p.motivo}\n          ${p.jano}`);
}

if (!cambios.length) process.exit(0);
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
