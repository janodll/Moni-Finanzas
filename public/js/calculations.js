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

// Realiza todos los cálculos matemáticos del estado actual de transacciones.
// TEST-01: `monthStr` (formato YYYY-MM) es opcional; por defecto usa el mes
// actual del sistema. Pasarlo explícito permite tests deterministas y
// calcular agregados de cualquier mes histórico.
export function calculateBalances(state, monthStr) {
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

  return {
    balanceGeneral,
    ingresosMes,
    egresosMes,
    saldosCuentas,
    deudasTarjetas,
    gastosPorCategoriaEsteMes,
    sumaDebito,
    sumaDeudas
  };
}

// Formatear números con separador de miles y dos decimales
export function formatNumber(num) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
