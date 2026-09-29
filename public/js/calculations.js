// Motor contable de Moni - Funciones matemáticas puras

// Avanzar fecha de vencimiento exactamente 1 mes con control de días
export function addOneMonth(dateStr) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1-12
  const day = parseInt(parts[2], 10);
  
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  
  // Obtener el último día del mes destino para no desbordar (ej: 31 de ene -> 28 de feb)
  const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
  const nextDay = Math.min(day, lastDayOfNextMonth);
  
  const yyyy = nextYear;
  const mm = String(nextMonth).padStart(2, '0');
  const dd = String(nextDay).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

// Reprograma un recordatorio al próximo vencimiento que todavía no haya pasado.
// Sumar un solo mes no alcanza cuando el recordatorio estuvo congelado meses (las
// tarjetas quedaron sin renovar desde julio): volvería con una fecha ya vencida.
// Se conserva el DÍA del mes original y se salta directo al primer mes que sirva,
// para que un vencimiento el 31 no se degrade a 28 al pasar por febrero.
export function proximoVencimiento(dateStr) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const dia = parseInt(parts[2], 10);
  if (!dia) return dateStr;

  const ahora = new Date();
  const hoy = ahora.toISOString().substring(0, 10);
  if (dateStr >= hoy) return dateStr; // todavía no vence: no se toca

  let y = ahora.getFullYear();
  let m = ahora.getMonth() + 1; // 1-12
  for (let i = 0; i < 24; i++) {
    const ultimoDia = new Date(y, m, 0).getDate(); // día 0 del mes siguiente = último de este
    const candidato = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
    if (candidato >= hoy) return candidato;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return dateStr;
}

// Obtener mes actual en formato YYYY-MM
export function getCurrentMonthString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}`;
}

// Formatear fecha para mostrarla amigable
export function formatDateStr(dateStr, format = "DD/MM/YYYY") {
  if (!dateStr) return "N/A";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  if (format === "YYYY-MM-DD") {
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// v6: Monto de una transacción expresado en Soles.
// Las transacciones pueden tener un campo `moneda` ("S/." o "US$").
// Si es US$, el monto se almacena en dólares y se convierte con el tipo de cambio.
// Las transacciones antiguas sin campo `moneda` se asumen en Soles (retrocompatible).
export function getMontoEnSoles(tx, tipoCambio) {
  const monto = parseFloat(tx.monto) || 0;
  if (tx.moneda === "US$") {
    return monto * (parseFloat(tipoCambio) || 3.80);
  }
  return monto;
}

// ---------------------------------------------------------------------------
// CUOTAS
// ---------------------------------------------------------------------------
// Una compra en cuotas se marca con tres campos:
//
//   cuota_total     cuántas cuotas tiene el plan.
//   cuota_actual    cuántas van PAGADAS según la última confirmación.
//   cuota_es_total  qué representa el `monto` de esta fila.
//
// El último existe porque los bancos reportan de dos maneras distintas y las dos
// tienen que convivir:
//
//   cuota_es_total = true  -> CARGO ÚNICO POR EL TOTAL. Es la moto en Cencosud:
//     un solo cargo de S/ 6,995 y después cuotas que no llegan por correo.
//     La cuota mensual es monto / cuota_total, y el total YA está dentro de la
//     deuda de la tarjeta.
//
//   cuota_es_total = false -> CARGO MENSUAL DE UNA CUOTA. Es Interbank cobrando
//     "Mercado Pago (Cuota 7/12)" por S/ 240.75 cada mes. La cuota mensual es el
//     monto tal cual, y lo que falta TODAVÍA NO está en la deuda de la tarjeta.
//
// Por eso el pendiente se devuelve partido: `saldoEnDeuda` (ya contabilizado) y
// `comprometidoFuturo` (aún por cobrar). Sumarlos y restarlos juntos de la deuda
// daría un número inventado.
//
// REGLA DURA: las cuotas pagadas SOLO salen de `cuota_actual`, que es lo que dijo
// el banco o lo que corrigió Jano. NUNCA se deducen contando meses del calendario:
// que hayan pasado dos meses no prueba que se pagaron dos cuotas. La moto es el
// caso exacto — comprada el 22/07, primera cuota recién pagada el 16/09. Contar
// por fechas la daba en 2 de 12 y la verdad era 1 de 12. Cuando el dato está viejo
// se marca con `mesesSinConfirmar` y se avisa, que es muy distinto de rellenarlo.

// Meses completos entre dos fechas YYYY-MM-DD. Si aún no se cumple el día del
// mes, ese mes no cuenta (del 22/07 al 21/08 va 0; al 22/08 va 1).
// Se usa para avisar que un dato está viejo, nunca para deducir cuotas pagadas.
export function mesesTranscurridos(desde, hasta) {
  if (!desde || !hasta) return 0;
  const a = desde.split('-').map(Number);
  const b = hasta.split('-').map(Number);
  if (a.length !== 3 || b.length !== 3) return 0;
  let meses = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) meses -= 1;
  return Math.max(0, meses);
}

// Estado de todas las compras en cuotas vivas a la fecha `hoyStr`.
export function calcularCuotas(transacciones, tipoCambio = 3.80, hoyStr) {
  const hoy = hoyStr || new Date().toISOString().substring(0, 10);
  const planes = [];
  const ultimaPorCompra = new Map();

  (transacciones || []).forEach(tx => {
    if (tx.tipo !== 'GASTO') return;
    const total = parseInt(tx.cuota_total, 10);
    if (!total || total < 2) return;

    if (tx.cuota_es_total) {
      planes.push(tx);
      return;
    }
    // El banco manda un correo por cada cuota, así que la misma compra aparece
    // un mes tras otro. Nos quedamos solo con la confirmación más reciente;
    // contarlas todas multiplicaría la deuda por la cantidad de correos leídos.
    const clave = [
      tx.tarjeta_id || tx.cuenta_id || 'x',
      (tx.descripcion_original || tx.descripcion || '').toLowerCase().trim(),
      total
    ].join('|');
    const previa = ultimaPorCompra.get(clave);
    if (!previa || (parseInt(tx.cuota_actual, 10) || 0) > (parseInt(previa.cuota_actual, 10) || 0)) {
      ultimaPorCompra.set(clave, tx);
    }
  });
  ultimaPorCompra.forEach(tx => planes.push(tx));

  let cuotaMensual = 0;
  let saldoEnDeuda = 0;
  let comprometidoFuturo = 0;
  const detalle = [];

  planes.forEach(tx => {
    const total = parseInt(tx.cuota_total, 10);
    const montoSoles = getMontoEnSoles(tx, tipoCambio);
    const esTotal = !!tx.cuota_es_total;

    const cuota = esTotal ? montoSoles / total : montoSoles;
    // Solo lo confirmado. Si nadie dijo cuántas van, van cero: preferible pasarse
    // por prudente que inventar un avance que no existe.
    const pagadas = Math.min(parseInt(tx.cuota_actual, 10) || 0, total);
    const restantes = total - pagadas;
    if (restantes <= 0) return; // ya terminó de pagarse

    cuotaMensual += cuota;
    if (esTotal) saldoEnDeuda += cuota * restantes;
    else comprometidoFuturo += cuota * restantes;

    const confirmadoEl = tx.cuota_confirmada_el || tx.fecha || null;
    detalle.push({
      id: tx.id,
      descripcion: tx.descripcion || tx.descripcion_original || 'Compra en cuotas',
      tarjeta_id: tx.tarjeta_id || null,
      cuenta_id: tx.cuenta_id || null,
      cuota,
      pagadas,
      total,
      restantes,
      pendiente: cuota * restantes,
      enDeuda: esTotal,
      confirmadoEl,
      mesesSinConfirmar: mesesTranscurridos(confirmadoEl, hoy)
    });
  });

  detalle.sort((x, y) => y.pendiente - x.pendiente);
  return { cuotaMensual, saldoEnDeuda, comprometidoFuturo, detalle };
}

// Realiza todos los cálculos matemáticos del estado actual de transacciones.
// TEST-01: `monthStr` (formato YYYY-MM) es opcional; por defecto usa el mes
// actual del sistema. Pasarlo explícito permite tests deterministas y
// calcular agregados de cualquier mes histórico.
export function calculateBalances(state, monthStr, hoyStr) {
  const currentMonthStr = monthStr || getCurrentMonthString(); // Formato YYYY-MM
  const tipoCambio = parseFloat(state.configuracion?.tipo_cambio_usd) || 3.80;

  let balanceGeneral = 0;
  let ingresosMes = 0;
  let egresosMes = 0;

  // Mapa para saldos de cuentas
  const saldosCuentas = {};
  if (state.cuentas) {
    state.cuentas.forEach(c => {
      saldosCuentas[c.id] = 0;
    });
  }

  // Mapa para deudas de tarjetas
  const deudasTarjetas = {};
  if (state.tarjetas) {
    state.tarjetas.forEach(t => {
      deudasTarjetas[t.id] = 0;
    });
  }

  // Mapa para gastos por categoría de este mes
  const gastosPorCategoriaEsteMes = {};

  // Procesar todas las transacciones
  if (state.transacciones) {
    state.transacciones.forEach(tx => {
      const monto = getMontoEnSoles(tx, tipoCambio);
      if (!tx.fecha) return;
      const txMonth = tx.fecha.substring(0, 7); // extrae YYYY-MM

      // 1. Afectar Cuentas de Débito
      if (tx.cuenta_id && saldosCuentas[tx.cuenta_id] !== undefined) {
        if (tx.tipo === "INGRESO") {
          saldosCuentas[tx.cuenta_id] += monto;
        } else if (tx.tipo === "GASTO") {
          saldosCuentas[tx.cuenta_id] -= monto;
        }
      }

      // 2. Afectar Tarjetas de Crédito
      if (tx.tarjeta_id && deudasTarjetas[tx.tarjeta_id] !== undefined) {
        if (tx.tipo === "GASTO") {
          deudasTarjetas[tx.tarjeta_id] += monto; // Gasto en tarjeta aumenta deuda
        } else if (tx.tipo === "INGRESO") {
          deudasTarjetas[tx.tarjeta_id] -= monto; // Pago de tarjeta reduce deuda
        }
      }

      // 3. Calcular ingresos y egresos globales del mes en curso
      if (txMonth === currentMonthStr) {
        // Excluimos traspasos internos como "Pago Tarjeta", "Transferencia" y saldos/deudas iniciales de los agregados globales
        if (tx.categoria !== "Pago Tarjeta" && tx.categoria !== "Transferencia" && tx.categoria !== "Saldo Inicial" && tx.categoria !== "Deuda Inicial") {
          if (tx.tipo === "INGRESO") {
            ingresosMes += monto;
          } else if (tx.tipo === "GASTO") {
            egresosMes += monto;
            
            // Agrupar gastos por categoría
            const cat = tx.categoria || "Otros";
            gastosPorCategoriaEsteMes[cat] = (gastosPorCategoriaEsteMes[cat] || 0) + monto;
          }
        }
      }
    });
  }

  // El balance general es: Suma de saldos de débito - Suma de deudas de tarjetas de crédito
  let sumaDebito = 0;
  if (state.cuentas) {
    state.cuentas.forEach(c => {
      sumaDebito += saldosCuentas[c.id] || 0;
    });
  }

  let sumaDeudas = 0;
  if (state.tarjetas) {
    state.tarjetas.forEach(t => {
      if (t.tipo === "Credito") {
        sumaDeudas += deudasTarjetas[t.id] || 0;
      }
    });
  }

  balanceGeneral = sumaDebito - sumaDeudas;

  // Partir la deuda de tarjetas en dos cosas que no se parecen en nada:
  // lo que son cuotas ya comprometidas y lo que es consumo del último ciclo,
  // que se paga solo el mes que viene. Mostrarlas juntas hace que un consumo
  // normal se lea como deuda.
  const cuotas = calcularCuotas(state.transacciones, tipoCambio, hoyStr);
  const consumoRotativo = Math.max(0, sumaDeudas - cuotas.saldoEnDeuda);

  return {
    balanceGeneral,
    ingresosMes,
    egresosMes,
    saldosCuentas,
    deudasTarjetas,
    gastosPorCategoriaEsteMes,
    sumaDebito,
    sumaDeudas,
    cuotas,
    consumoRotativo
  };
}

// Formatear números con separador de miles y dos decimales
export function formatNumber(num) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
