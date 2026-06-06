// Gestión y Renderizado de Reportes Financieros Dinámicos de Moni

import { state } from '../state.js';
import { formatNumber, formatDateStr } from '../calculations.js';
import { safeCreateIcons } from './components.js';
import { getOrigenLabel } from './dashboard.js';

// Configurar dropdown de meses e inicializar eventos
export function setupReports() {
  const select = document.getElementById("report-month-select");
  const btnGenerate = document.getElementById("btn-generate-report");

  if (!select || !btnGenerate) return;

  // Llenar select con los últimos 6 meses dinámicamente
  select.innerHTML = "";
  const tempDate = new Date();
  
  for (let i = 0; i < 6; i++) {
    const d = new Date(tempDate.getFullYear(), tempDate.getMonth() - i, 1);
    const monthVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    
    const opt = document.createElement("option");
    opt.value = monthVal;
    opt.text = label.charAt(0).toUpperCase() + label.slice(1);
    select.appendChild(opt);
  }

  btnGenerate.addEventListener("click", () => {
    const selectedMonth = select.value;
    renderMonthlyReport(selectedMonth);
  });
}

// Renderizar el reporte del mes seleccionado
export function renderMonthlyReport(monthKey) {
  const container = document.getElementById("report-view-container");
  if (!container) return;

  const mon = state.configuracion.moneda || "S/.";
  const [year, month] = monthKey.split('-');
  const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthLabel = dateObj.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const monthName = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  // Filtrar transacciones del mes
  const txs = state.transacciones.filter(tx => tx.fecha && tx.fecha.substring(0, 7) === monthKey);

  // Cálculos contables
  let ingresos = 0;
  let egresos = 0;
  let fijos = 0;
  let variables = 0;
  const porCategoria = {};

  txs.forEach(tx => {
    const monto = parseFloat(tx.monto) || 0;
    
    // Excluir transferencias internas y saldos iniciales de los totales
    if (tx.categoria !== "Pago Tarjeta" && tx.categoria !== "Transferencia" && tx.categoria !== "Saldo Inicial" && tx.categoria !== "Deuda Inicial") {
      if (tx.tipo === "INGRESO") {
        ingresos += monto;
      } else if (tx.tipo === "GASTO") {
        egresos += monto;
        
        // Agrupar por categoría
        const cat = tx.categoria || "Otros";
        porCategoria[cat] = (porCategoria[cat] || 0) + monto;

        // Fijos vs Variables
        const isFijo = tx.fijo === "Fijo" || tx.tipo_gasto === "Fijo";
        if (isFijo) {
          fijos += monto;
        } else {
          variables += monto;
        }
      }
    }
  });

  const saldoNeto = ingresos - egresos;
  
  // Tasa de ahorro
  let tasaAhorro = 0;
  if (ingresos > 0 && saldoNeto > 0) {
    tasaAhorro = Math.round((saldoNeto / ingresos) * 100);
  }

  // Ordenar categorías de mayor a menor gasto
  const categoriasOrdenadas = Object.keys(porCategoria)
    .map(name => ({ name, value: porCategoria[name] }))
    .sort((a, b) => b.value - a.value);

  const topCategorias = categoriasOrdenadas.slice(0, 3);

  // Clasificar salud financiera
  let healthMessage = "";
  let healthClass = "alert-info";
  if (saldoNeto < 0) {
    healthMessage = "⚠️ Alerta de Déficit: Tus egresos superaron a tus ingresos este mes. Te sugerimos revisar tus gastos variables o suscripciones no obligatorias.";
    healthClass = "toast-error";
  } else if (tasaAhorro >= 20) {
    healthMessage = "🌟 ¡Excelente Salud Financiera! Has ahorrado el 20% o más de tus ingresos. Cumples con los estándares ideales de ahorro del portafolio profesional.";
    healthClass = "toast-success";
  } else if (saldoNeto > 0) {
    healthMessage = "👍 Flujo Positivo: Mantuviste un saldo a favor. Considera aumentar tu tasa de ahorro recortando gastos fijos o variables.";
    healthClass = "toast-info";
  } else {
    healthMessage = "ℹ️ Presupuesto de subsistencia: Tus ingresos y egresos fueron iguales este mes.";
    healthClass = "toast-warning";
  }

  // Renderizar la maqueta
  container.innerHTML = `
    <div class="report-content" id="printable-report">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--border-color); padding-bottom:15px; margin-bottom:25px;">
        <div>
          <h3 style="font-size:1.4rem; color:var(--text-main); font-weight:700; margin:0;">REPORTE EJECUTIVO MENSUAL</h3>
          <span style="font-size:0.9rem; color:var(--text-muted); font-weight:500;">Periodo: ${monthName}</span>
        </div>
        <div style="text-align:right;">
          <h4 style="font-size:1.2rem; color:var(--color-indigo); font-weight:700; margin:0;">Moni Finance</h4>
          <small class="text-muted">Propietario: ${state.configuracion?.nombre_usuario || 'Jano'}</small>
        </div>
      </div>

      <!-- Métricas del periodo -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:15px; margin-bottom:25px;">
        <div style="background:rgba(0,0,0,0.02); padding:15px; border-radius:12px; border:1px solid var(--border-color); text-align:center;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Ingresos Totales</span>
          <div style="font-size:1.25rem; font-weight:700; color:var(--color-green); margin-top:5px;">${mon} ${formatNumber(ingresos)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.02); padding:15px; border-radius:12px; border:1px solid var(--border-color); text-align:center;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Egresos Totales</span>
          <div style="font-size:1.25rem; font-weight:700; color:var(--color-red); margin-top:5px;">${mon} ${formatNumber(egresos)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.02); padding:15px; border-radius:12px; border:1px solid var(--border-color); text-align:center;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Saldo Neto</span>
          <div style="font-size:1.25rem; font-weight:700; color:${saldoNeto >= 0 ? 'var(--color-green)' : 'var(--color-red)'}; margin-top:5px;">${saldoNeto >= 0 ? '+' : ''}${mon} ${formatNumber(saldoNeto)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.02); padding:15px; border-radius:12px; border:1px solid var(--border-color); text-align:center;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Tasa de Ahorro</span>
          <div style="font-size:1.25rem; font-weight:700; color:var(--color-blue); margin-top:5px;">${tasaAhorro}%</div>
        </div>
      </div>

      <!-- Panel de Diagnóstico -->
      <div style="padding:15px; border-radius:12px; margin-bottom:25px; border:1px solid var(--border-color); font-size:0.9rem;" class="${healthClass}">
        <strong>Diagnóstico de Moni:</strong> ${healthMessage}
      </div>

      <!-- Desglose Gráfico de Gastos -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:25px; margin-bottom:25px;">
        
        <!-- Top Categorías -->
        <div>
          <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Top 3 Categorías de Mayor Gasto</h4>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${topCategorias.length === 0 
              ? '<p class="text-muted" style="font-size:0.85rem;">No se registraron gastos este mes.</p>' 
              : topCategorias.map((cat, idx) => {
                  const pct = egresos > 0 ? Math.round((cat.value / egresos) * 100) : 0;
                  return `
                    <div>
                      <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600; margin-bottom:4px;">
                        <span>${idx + 1}. ${cat.name}</span>
                        <span>${mon} ${formatNumber(cat.value)} (${pct}%)</span>
                      </div>
                      <div class="progress-bar" style="height:6px;">
                        <div class="progress-fill progress-orange" style="width: ${pct}%; height:100%;"></div>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>

        <!-- Fijo vs Variable -->
        <div>
          <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Composición del Gasto</h4>
          <div style="display:flex; flex-direction:column; gap:10px; font-size:0.85rem;">
            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600;">
                <span>Gastos Obligatorios (Fijos)</span>
                <span>${mon} ${formatNumber(fijos)} (${egresos > 0 ? Math.round((fijos / egresos) * 100) : 0}%)</span>
              </div>
              <div class="progress-bar" style="height:6px;">
                <div class="progress-fill progress-red" style="width: ${egresos > 0 ? Math.round((fijos / egresos) * 100) : 0}%; height:100%;"></div>
              </div>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600;">
                <span>Gastos Variables (Discrecionales)</span>
                <span>${mon} ${formatNumber(variables)} (${egresos > 0 ? Math.round((variables / egresos) * 100) : 0}%)</span>
              </div>
              <div class="progress-bar" style="height:6px;">
                <div class="progress-fill progress-blue" style="width: ${egresos > 0 ? Math.round((variables / egresos) * 100) : 0}%; height:100%;"></div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Tabla de Transacciones del Periodo (Detalle) -->
      <div>
        <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Transacciones del Mes</h4>
        <div style="max-height:220px; overflow-y:auto; border:1px solid var(--border-color); border-radius:10px; background:rgba(255,255,255,0.3);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:rgba(0,0,0,0.03); border-bottom:1px solid var(--border-color); text-align:left;">
                <th style="padding:10px;">Fecha</th>
                <th style="padding:10px;">Categoría</th>
                <th style="padding:10px;">Descripción</th>
                <th style="padding:10px;">Origen</th>
                <th style="padding:10px; text-align:right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${txs.length === 0 
                ? '<tr><td colspan="5" style="text-align:center; padding:15px;" class="text-muted">Sin movimientos registrados.</td></tr>' 
                : txs.map(tx => {
                    const esGasto = tx.tipo === "GASTO";
                    return `
                      <tr style="border-bottom:1px solid var(--border-color);">
                        <td style="padding:8px 10px;">${formatDateStr(tx.fecha)}</td>
                        <td style="padding:8px 10px; font-weight:600;">${tx.categoria}</td>
                        <td style="padding:8px 10px;" class="text-muted">${tx.descripcion || 'Sin descripción'}</td>
                        <td style="padding:8px 10px;">${getOrigenLabel(tx)}</td>
                        <td style="padding:8px 10px; text-align:right; font-weight:700; color:${esGasto ? 'var(--color-red)' : 'var(--color-green)'};">
                          ${esGasto ? '-' : '+'}${mon} ${formatNumber(tx.monto)}
                        </td>
                      </tr>
                    `;
                  }).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Botón de impresión -->
    <div style="display:flex; justify-content:flex-end; margin-top:20px; gap:10px;">
      <button class="btn btn-secondary" id="btn-print-report" style="display:flex; align-items:center; gap:6px;">
        <i data-lucide="printer" style="width:16px; height:16px;"></i> Imprimir Reporte
      </button>
    </div>
  `;

  // Asignar evento de impresión
  const btnPrint = document.getElementById("btn-print-report");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      window.print();
    });
  }

  safeCreateIcons();
}
