// Renderizado de métricas y gráficos del inicio (Dashboard) de Moni

import { state, CATEGORY_STYLES, saveState } from '../state.js';
import { formatNumber, formatDateStr, getCurrentMonthString } from '../calculations.js';
import { safeCreateIcons } from './components.js';

let chartFlowInstance = null;
let chartCategoriesInstance = null;

// Renderiza los totales numéricos en la parte superior
export function renderTotals(balances) {
  const mon = state.configuracion.moneda || "S/.";
  
  document.getElementById("val-balance").innerHTML = `<span class="metric-symbol">${mon}</span><span class="metric-num">${formatNumber(balances.balanceGeneral)}</span>`;
  document.getElementById("val-ingresos").innerHTML = `<span class="metric-symbol">${mon}</span><span class="metric-num">${formatNumber(balances.ingresosMes)}</span>`;
  document.getElementById("val-egresos").innerHTML = `<span class="metric-symbol">${mon}</span><span class="metric-num">${formatNumber(balances.egresosMes)}</span>`;

  // Tasa de ahorro
  let tasaAhorro = 0;
  let ahorroMonto = balances.ingresosMes - balances.egresosMes;
  if (balances.ingresosMes > 0 && ahorroMonto > 0) {
    tasaAhorro = Math.round((ahorroMonto / balances.ingresosMes) * 100);
  }

  document.getElementById("val-ahorro").innerHTML = `<span class="metric-num">${tasaAhorro}%</span>`;
  document.getElementById("sub-ahorro").innerText = `${mon} ${formatNumber(Math.max(0, ahorroMonto))} de excedente este mes`;
}

// Renderiza listas de cuentas y tarjetas
export function renderDashboardLists(balances) {
  const mon = state.configuracion.moneda || "S/.";

  // Actualizar los totales del encabezado
  const totalCuentasHeader = document.getElementById("total-cuentas-header");
  if (totalCuentasHeader) {
    totalCuentasHeader.innerText = `${mon} ${formatNumber(balances.sumaDebito)}`;
  }

  const totalTarjetasHeader = document.getElementById("total-tarjetas-header");
  if (totalTarjetasHeader) {
    totalTarjetasHeader.innerText = `${mon} ${formatNumber(balances.sumaDeudas)}`;
  }

  // 1. Cuentas Débito
  const accountsContainer = document.getElementById("dash-accounts-list");
  if (accountsContainer) {
    accountsContainer.innerHTML = "";
    state.cuentas.forEach(c => {
      const saldo = balances.saldosCuentas[c.id] || 0;
      const item = document.createElement("div");
      item.className = "account-item";
      item.innerHTML = `
        <div class="account-info">
          <div class="account-icon"><i data-lucide="building"></i></div>
          <div class="account-details-text">
            <div class="account-name">${c.nombre}</div>
            <div class="account-holder">${c.titular}</div>
          </div>
        </div>
        <div class="account-balance text-green">${mon} ${formatNumber(saldo)}</div>
      `;
      accountsContainer.appendChild(item);
    });
  }

  // 2. Tarjetas de Crédito
  const cardsContainer = document.getElementById("dash-cards-list");
  if (cardsContainer) {
    cardsContainer.innerHTML = "";
    
    // Mostrar el botón de "Pagar Tarjeta" en el dashboard si hay tarjetas de crédito
    const payCardBtn = document.getElementById("dash-pay-card-quick");
    let tieneCredito = state.tarjetas.some(t => t.tipo === "Credito");
    if (payCardBtn) payCardBtn.style.display = tieneCredito ? "block" : "none";

    state.tarjetas.forEach(t => {
      const deuda = balances.deudasTarjetas[t.id] || 0;
      const isCredito = t.tipo === "Credito";
      
      const item = document.createElement("div");
      item.className = "card-item";
      
      // Si es crédito y tiene deudas, calculamos por separado Soles y Dólares dinámicamente
      let solesDebt = 0;
      let usdDebt = 0;
      
      if (isCredito && deuda > 0) {
        const txs = state.transacciones.filter(tx => tx.tarjeta_id === t.id);
        const tc = parseFloat(state.configuracion?.tipo_cambio_usd || 3.80);
        
        solesDebt = parseFloat(t.deuda_inicial_soles || 0);
        usdDebt = parseFloat(t.deuda_inicial_usd || 0);
        
        txs.forEach(tx => {
          const monto = parseFloat(tx.monto);
          const desc = tx.descripcion || "";
          const isGasto = tx.tipo === "GASTO";
          const isIngreso = tx.tipo === "INGRESO";
          
          if (desc === "Deuda Inicial") {
            const hasInitialDebtProperty = parseFloat(t.deuda_inicial_soles || 0) !== 0 || parseFloat(t.deuda_inicial_usd || 0) !== 0;
            if (hasInitialDebtProperty) {
              return;
            }
          }
          
          if (isGasto) {
            if (desc.toUpperCase().includes("USD") || desc.includes("US$") || desc.includes("$")) {
              let usdVal = 0;
              const match = desc.match(/\$(\d+\.?\d*)/);
              if (match) {
                usdVal = parseFloat(match[1]);
              } else {
                usdVal = monto / tc;
              }
              usdDebt += usdVal;
            } else {
              solesDebt += monto;
            }
          } else if (isIngreso) {
            if (desc.toUpperCase().includes("USD") || desc.includes("US$") || desc.includes("$")) {
              let usdVal = 0;
              const match = desc.match(/\$(\d+\.?\d*)/);
              if (match) {
                usdVal = parseFloat(match[1]);
              } else {
                usdVal = monto / tc;
              }
              usdDebt -= usdVal;
            } else {
              solesDebt -= monto;
            }
          }
        });
      }

      // Formato de deuda
      let debtHtml = "";
      if (isCredito) {
        if (solesDebt > 0 && usdDebt > 0) {
          debtHtml = `
            <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.2;">
              <span style="color:var(--color-red); font-weight:700;">${mon} ${formatNumber(solesDebt)}</span>
              <span style="color:#2563eb; font-weight:700; font-size:0.82em;">US$ ${formatNumber(usdDebt)}</span>
            </div>
          `;
        } else if (usdDebt > 0) {
          debtHtml = `<span style="color:#2563eb; font-weight:700;">US$ ${formatNumber(usdDebt)}</span>`;
        } else if (solesDebt > 0) {
          debtHtml = `<span style="color:var(--color-red); font-weight:700;">${mon} ${formatNumber(solesDebt)}</span>`;
        } else {
          debtHtml = `<span class="text-muted">S/. 0.00</span>`;
        }
      } else {
        debtHtml = `<span class="text-muted">Activa</span>`;
      }

      let tooltipHtml = "";
      if (isCredito && solesDebt > 0 && usdDebt > 0) {
        const tc = parseFloat(state.configuracion?.tipo_cambio_usd || 3.80);
        const consolidado = solesDebt + (usdDebt * tc);
        tooltipHtml = `
          <div class="card-tooltip">
            <div style="font-weight: 700; margin-bottom: 4px; color: #FFF; font-size: 0.8rem;">Deuda Consolidada</div>
            <div style="color: #ccc; margin: 2px 0;">Total equivalente en Soles:</div>
            <strong style="color: #6ee7b7; font-size: 1.05em;">S/ ${consolidado.toFixed(2)}</strong>
            <div style="font-size: 0.85em; color: #aaa; margin-top: 4px;">(Calculado a T.C. ${tc.toFixed(2)})</div>
          </div>
        `;
      }

      item.innerHTML = `
        <div class="card-info">
          <div class="card-icon" style="${!isCredito ? 'background-color:var(--color-blue-light); color:var(--color-blue);' : ''}">
            <i data-lucide="${isCredito ? 'credit-card' : 'smartphone'}"></i>
          </div>
          <div class="card-details-text">
            <div class="card-name">${t.nombre}</div>
            <div class="card-holder">${isCredito ? 'Crédito • ' + t.titular : 'Débito • ' + t.titular}</div>
          </div>
        </div>
        <div class="card-debt">
          ${debtHtml}
        </div>
        ${tooltipHtml}
      `;
      cardsContainer.appendChild(item);
    });
  }

  // 3. Transacciones Recientes en Dashboard (Últimas 5)
  const dashTxBody = document.getElementById("dash-transactions-body");
  if (dashTxBody) {
    dashTxBody.innerHTML = "";
    const recientes = state.transacciones.slice(0, 5);
    if (recientes.length === 0) {
      dashTxBody.innerHTML = `<tr><td colspan="5" style="text-align:center;" class="text-muted">No hay transacciones registradas.</td></tr>`;
    } else {
      recientes.forEach(tx => {
        const estiloCat = CATEGORY_STYLES[tx.categoria] || CATEGORY_STYLES["Otros"];
        const esGasto = tx.tipo === "GASTO";
        const procedencia = getOrigenLabel(tx);

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${formatDateStr(tx.fecha, state.configuracion?.formato_fecha)}</td>
          <td>
            <div class="td-category">
              <span class="category-badge-icon" style="background-color:${estiloCat.bg}; color:${estiloCat.color};">
                <i data-lucide="${estiloCat.icon}" style="width:14px; height:14px;"></i>
              </span>
              <span>${tx.categoria}</span>
            </div>
          </td>
          <td class="text-muted">${tx.descripcion || "Sin detalle"}</td>
          <td><span style="font-size:0.85em; font-weight:600; color:var(--text-muted);">${procedencia}</span></td>
          <td class="td-amount ${esGasto ? 'text-red' : 'text-green'}">
            ${esGasto ? '-' : '+'}${mon} ${formatNumber(tx.monto)}
          </td>
        `;
        dashTxBody.appendChild(row);
      });
    }
  }
}

// Obtener etiqueta legible sobre el origen/destino del dinero
export function getOrigenLabel(tx) {
  if (tx.cuenta_id) {
    const c = state.cuentas.find(item => parseInt(item.id) === parseInt(tx.cuenta_id));
    return c ? `${c.nombre} (Cta)` : "Cuenta";
  }
  if (tx.tarjeta_id) {
    const t = state.tarjetas.find(item => parseInt(item.id) === parseInt(tx.tarjeta_id));
    return t ? `${t.nombre} (Tarj)` : "Tarjeta";
  }
  return "N/A";
}

// Renderiza los Gráficos de Flujo de Caja y Gastos por Categoría
export function renderCharts() {
  const ctxFlow = document.getElementById('chart-flow');
  const ctxCategories = document.getElementById('chart-categories');
  
  if (!ctxFlow || !ctxCategories) return;

  // --- 1. GRÁFICO DE FLUJO DE CAJA (ÚLTIMOS 6 MESES) ---
  const flowData = getFlowDataLast6Months();
  
  if (chartFlowInstance) chartFlowInstance.destroy();
  chartFlowInstance = new Chart(ctxFlow, {
    type: 'bar',
    data: {
      labels: flowData.labels,
      datasets: [
        {
          label: 'Ingresos',
          data: flowData.ingresos,
          backgroundColor: '#10B981',
          borderRadius: 4,
          maxBarThickness: 30
        },
        {
          label: 'Gastos',
          data: flowData.gastos,
          backgroundColor: '#F43F5E',
          borderRadius: 4,
          maxBarThickness: 30
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          grid: { color: '#EAE8E4' },
          ticks: { font: { family: 'Inter', size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10, weight: 600 } }
        }
      }
    }
  });

  // --- 2. GRÁFICO DE DONA (GASTOS POR CATEGORÍA ESTE MES) ---
  const catData = getCategoryDataThisMonth();
  
  if (chartCategoriesInstance) chartCategoriesInstance.destroy();
  
  if (catData.data.length === 0) {
    chartCategoriesInstance = new Chart(ctxCategories, {
      type: 'doughnut',
      data: {
        labels: ['Sin gastos este mes'],
        datasets: [{
          data: [1],
          backgroundColor: ['#E5E7EB']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { family: 'Inter', size: 11 } } } }
      }
    });
  } else {
    chartCategoriesInstance = new Chart(ctxCategories, {
      type: 'doughnut',
      data: {
        labels: catData.labels,
        datasets: [{
          data: catData.data,
          backgroundColor: catData.colors,
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              font: { family: 'Inter', size: 11, weight: 500 },
              padding: 10
            }
          }
        },
        cutout: '70%'
      }
    });
  }
}

function getFlowDataLast6Months() {
  const meses = [];
  const ingresosPorMes = {};
  const gastosPorMes = {};

  const tempDate = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(tempDate.getFullYear(), tempDate.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('es-ES', { month: 'short' });
    meses.push({ key: monthKey, label: label.charAt(0).toUpperCase() + label.slice(1) });
    ingresosPorMes[monthKey] = 0;
    gastosPorMes[monthKey] = 0;
  }

  state.transacciones.forEach(tx => {
    const txMonth = tx.fecha.substring(0, 7);
    if (ingresosPorMes[txMonth] !== undefined) {
      if (tx.categoria !== "Pago Tarjeta" && tx.categoria !== "Transferencia" && tx.categoria !== "Saldo Inicial" && tx.categoria !== "Deuda Inicial") {
        const monto = parseFloat(tx.monto);
        if (tx.tipo === "INGRESO") {
          ingresosPorMes[txMonth] += monto;
        } else if (tx.tipo === "GASTO") {
          gastosPorMes[txMonth] += monto;
        }
      }
    }
  });

  return {
    labels: meses.map(m => m.label),
    ingresos: meses.map(m => ingresosPorMes[m.key]),
    gastos: meses.map(m => gastosPorMes[m.key])
  };
}

function getCategoryDataThisMonth() {
  const currentMonthStr = getCurrentMonthString();
  const sums = {};

  state.transacciones.forEach(tx => {
    const txMonth = tx.fecha.substring(0, 7);
    if (txMonth === currentMonthStr && tx.tipo === "GASTO" && tx.categoria !== "Pago Tarjeta" && tx.categoria !== "Transferencia" && tx.categoria !== "Saldo Inicial" && tx.categoria !== "Deuda Inicial") {
      const cat = tx.categoria || "Otros";
      sums[cat] = (sums[cat] || 0) + parseFloat(tx.monto);
    }
  });

  const labels = Object.keys(sums);
  const data = Object.values(sums);
  const colors = labels.map(l => (CATEGORY_STYLES[l] || CATEGORY_STYLES["Otros"]).color);

  return { labels, data, colors };
}

// Renderiza los presupuestos mensuales con su barra de progreso
export function renderBudgets(gastosCategoria) {
  const container = document.getElementById("budgets-list");
  if (!container) return;

  container.innerHTML = "";
  const mon = state.configuracion.moneda || "S/.";

  if (state.presupuestos.length === 0) {
    container.innerHTML = `<p class="text-muted" style="grid-column: 1/-1; text-align: center; margin: 15px 0;">No tienes presupuestos creados.</p>`;
    return;
  }

  state.presupuestos.forEach(b => {
    const gastado = gastosCategoria[b.categoria] || 0;
    const porcentaje = Math.min(100, Math.round((gastado / b.limite) * 100));
    
    let colorClass = "progress-green";
    if (porcentaje >= 90) colorClass = "progress-red";
    else if (porcentaje >= 70) colorClass = "progress-orange";

    const item = document.createElement("div");
    item.className = "budget-item";
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-weight:600; color:var(--text-main);">${b.categoria}</span>
          <button class="btn-delete-budget" data-category="${b.categoria}" style="color:var(--text-red); border:none; background:transparent; cursor:pointer; padding:2px; display:flex; align-items:center; justify-content:center; width:20px; height:20px;" title="Eliminar presupuesto">
            <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
          </button>
        </div>
        <span style="font-size:0.88em; color:var(--text-muted);">${porcentaje}% (${mon} ${formatNumber(gastado)} / ${formatNumber(b.limite)})</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${colorClass}" style="width: ${porcentaje}%"></div>
      </div>
    `;
    container.appendChild(item);
  });

  // Event listener para eliminar presupuestos
  container.querySelectorAll(".btn-delete-budget").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const category = e.currentTarget.getAttribute("data-category");
      if (confirm(`¿Estás seguro de que deseas eliminar el presupuesto de la categoría "${category}"?`)) {
        state.presupuestos = state.presupuestos.filter(b => b.categoria !== category);
        saveState();
      }
    });
  });
}

// Renderiza los próximos pagos y recordatorios
export function renderReminders() {
  const mon = state.configuracion.moneda || "S/.";
  const pendientes = state.recordatorios.filter(r => r.estado === "Pendiente");
  
  // Ordenar por fecha de vencimiento ascendente
  pendientes.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  // Calcular la suma de recordatorios pendientes
  let sumaRecordatoriosPendientes = 0;
  pendientes.forEach(r => {
    sumaRecordatoriosPendientes += parseFloat(r.monto) || 0;
  });

  // 1. Encabezado de total en el dashboard Resumen
  const totalRemPendingHeader = document.getElementById("total-recordatorios-header");
  if (totalRemPendingHeader) {
    totalRemPendingHeader.innerText = `${mon} ${formatNumber(sumaRecordatoriosPendientes)}`;
  }

  // 2. Encabezado de total en la vista completa
  const totalRemPending = document.getElementById("total-reminders-header");
  if (totalRemPending) {
    totalRemPending.innerText = `${mon} ${formatNumber(sumaRecordatoriosPendientes)}`;
  }

  const renderList = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    if (pendientes.length === 0) {
      container.innerHTML = `<p class="text-muted" style="text-align: center; margin: 15px 0; padding: 10px;">No tienes recordatorios pendientes.</p>`;
      return;
    }

    pendientes.forEach(r => {
      const item = document.createElement("div");
      item.className = "reminder-item";
      
      const isTarjeta = r.tipo === "Tarjeta";
      const iconName = isTarjeta ? "credit-card" : "lightbulb";

      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="category-badge-icon" style="background-color:${isTarjeta ? 'var(--color-blue-light)' : 'var(--color-red-light)'}; color:${isTarjeta ? 'var(--color-blue)' : 'var(--color-red)'}; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:8px;">
            <i data-lucide="${iconName}" style="width:16px; height:16px;"></i>
          </span>
          <div>
            <div style="font-weight:600; color:var(--text-main);">${r.nombre}</div>
            <small class="text-muted">Vence: ${formatDateStr(r.fecha_vencimiento, state.configuracion?.formato_fecha)}</small>
          </div>
        </div>
        <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
          <strong style="color:var(--text-main);">${mon} ${formatNumber(r.monto)}</strong>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn btn-secondary btn-pay-reminder" data-id="${r.id}" style="padding:4px 8px; font-size:0.78em; height:24px; border-radius:6px; display:flex; align-items:center; gap:4px;">
              <i data-lucide="check" style="width:12px; height:12px;"></i> Pagar
            </button>
            <button class="btn-delete-reminder" data-id="${r.id}" style="color:var(--text-red); border:none; background:transparent; cursor:pointer; padding:4px; display:flex; align-items:center; justify-content:center; width:24px; height:24px;" title="Eliminar recordatorio">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>
      `;
      container.appendChild(item);
    });

    // Agregar event listeners a los botones de pagar
    container.querySelectorAll(".btn-pay-reminder").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = parseInt(e.currentTarget.getAttribute("data-id"));
        openPayReminderModal(id);
      });
    });

    // Agregar event listeners a los botones de eliminar
    container.querySelectorAll(".btn-delete-reminder").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = parseInt(e.currentTarget.getAttribute("data-id"));
        const rem = state.recordatorios.find(r => parseInt(r.id) === id);
        const remName = rem ? rem.nombre : "este recordatorio";
        if (confirm(`¿Estás seguro de que deseas eliminar el recordatorio "${remName}"?`)) {
          state.recordatorios = state.recordatorios.filter(r => parseInt(r.id) !== id);
          saveState();
        }
      });
    });
  };

  // Renderizar en ambos contenedores
  renderList("reminders-full-container");
  renderList("dash-reminders-list");

  safeCreateIcons();
}

// Renderiza las metas de ahorro
export function renderSavingsGoals() {
  const container = document.getElementById("savings-goals-grid");
  if (!container) return;

  container.innerHTML = "";
  const mon = state.configuracion.moneda || "S/.";

  if (state.metas.length === 0) {
    container.innerHTML = `<p class="text-muted" style="text-align: center; grid-column: 1 / -1; margin: 15px 0;">No tienes metas de ahorro configuradas.</p>`;
    return;
  }

  state.metas.forEach(m => {
    const progreso = Math.min(100, Math.round((m.actual / m.objetivo) * 100));
    const card = document.createElement("div");
    card.className = "savings-goal-card";
    card.innerHTML = `
      <div class="goal-card-header">
        <span class="goal-card-title">${m.nombre}</span>
        <span class="goal-card-target" style="font-weight:700; color:var(--color-indigo);">${mon} ${formatNumber(m.objetivo)}</span>
      </div>
      <div class="goal-card-progress">
        <div class="progress-bar goal-progress-bar">
          <div class="progress-fill progress-blue" style="width: ${progreso}%"></div>
        </div>
        <span class="goal-percent-text">${progreso}%</span>
      </div>
      <div class="goal-details">
        <span>${mon} ${formatNumber(m.actual)} ahorrado</span>
        <span class="goal-date"><i data-lucide="calendar"></i> Límite: ${formatDateStr(m.fecha_limite, state.configuracion?.formato_fecha)}</span>
      </div>
      <div class="goal-card-actions" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <button class="btn btn-secondary btn-aporte-meta" data-id="${m.id}" style="padding: 4px 10px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
          <i data-lucide="plus"></i> Aportar
        </button>
        <button class="btn-delete-meta" data-id="${m.id}" style="color:var(--text-red); border:none; background:transparent; cursor:pointer; padding:4px; display:flex; align-items:center;" title="Eliminar meta">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Event listener para aportar a metas
  container.querySelectorAll(".btn-aporte-meta").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      openAporteModal(id);
    });
  });

  // Event listener para eliminar metas
  container.querySelectorAll(".btn-delete-meta").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      const meta = state.metas.find(m => parseInt(m.id) === id);
      const metaName = meta ? meta.nombre : "esta meta";
      if (confirm(`¿Estás seguro de que deseas eliminar la meta de ahorro "${metaName}"?`)) {
        state.metas = state.metas.filter(m => parseInt(m.id) !== id);
        saveState();
      }
    });
  });

  safeCreateIcons();
}

// Renderiza trabajos por cobrar (Freelance)
export function renderPorCobrar() {
  const listPending = document.getElementById("list-jobs-pending");
  const listCollected = document.getElementById("list-jobs-collected");
  const valTotal = document.getElementById("val-total-por-cobrar");

  if (!listPending || !listCollected || !valTotal) return;

  listPending.innerHTML = "";
  listCollected.innerHTML = "";

  const mon = state.configuracion.moneda || "S/.";
  let totalPendiente = 0;

  const pendientes = state.trabajos_pendientes.filter(j => j.estado === "Pendiente");
  const cobrados = state.trabajos_pendientes.filter(j => j.estado === "Cobrado");

  // Pendientes
  if (pendientes.length === 0) {
    listPending.innerHTML = `<p class="text-muted" style="text-align: center; padding: 20px;">No tienes cobros pendientes.</p>`;
  } else {
    pendientes.forEach(job => {
      totalPendiente += job.monto;
      const card = document.createElement("div");
      card.className = "job-card pending";
      card.innerHTML = `
        <div class="job-header-details">
          <div>
            <div class="job-client">${job.cliente}</div>
            <div class="text-muted" style="font-size: 0.85em;">${job.descripcion} • Emisión: ${formatDateStr(job.fecha_emision, state.configuracion?.formato_fecha)}</div>
          </div>
          <div style="text-align: right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <div class="job-amount text-orange">${mon} ${formatNumber(job.monto)}</div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn btn-secondary btn-cobrar-trabajo" data-id="${job.id}" style="padding:4px 8px; font-size:0.8em; height:24px; border-radius:6px; display:flex; align-items:center; gap:4px;">
                <i data-lucide="check-square" style="width:12px; height:12px;"></i> Registrar Cobro
              </button>
              <button class="btn-delete-job" data-id="${job.id}" style="color:var(--text-red); border:none; background:transparent; cursor:pointer; padding:4px; display:flex; align-items:center;" title="Eliminar cobro pendiente">
                <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
              </button>
            </div>
          </div>
        </div>
      `;
      listPending.appendChild(card);
    });
  }

  // Cobrados
  if (cobrados.length === 0) {
    listCollected.innerHTML = `<p class="text-muted" style="text-align: center; padding: 20px;">No tienes cobros registrados históricamente.</p>`;
  } else {
    cobrados.forEach(job => {
      const cta = state.cuentas.find(c => parseInt(c.id) === parseInt(job.cuenta_id));
      const ctaNombre = cta ? cta.nombre : "Cuenta";

      const card = document.createElement("div");
      card.className = "job-card collected";
      card.innerHTML = `
        <div class="job-header-details">
          <div>
            <div class="job-client">${job.cliente}</div>
            <div class="text-muted" style="font-size: 0.85em;">${job.descripcion} • Cobrado en: ${ctaNombre} el ${formatDateStr(job.fecha_cobro, state.configuracion?.formato_fecha)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="job-amount text-green">${mon} ${formatNumber(job.monto)}</div>
            <button class="btn-delete-job" data-id="${job.id}" style="color:var(--text-red); border:none; background:transparent; cursor:pointer; padding:4px; display:flex; align-items:center;" title="Eliminar cobro realizado">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>
      `;
      listCollected.appendChild(card);
    });
  }

  valTotal.innerText = `${mon} ${formatNumber(totalPendiente)}`;

  // Bindear botones de cobrar trabajo
  listPending.querySelectorAll(".btn-cobrar-trabajo").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      openCobrarModal(id);
    });
  });

  // Bindear botones de eliminar cobro
  const deleteJobHandler = (btn) => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      const job = state.trabajos_pendientes.find(j => parseInt(j.id) === id);
      const clientName = job ? job.cliente : "este cobro";
      if (confirm(`¿Estás seguro de que deseas eliminar el registro de cobro para "${clientName}"?`)) {
        state.trabajos_pendientes = state.trabajos_pendientes.filter(j => parseInt(j.id) !== id);
        saveState();
      }
    });
  };

  listPending.querySelectorAll(".btn-delete-job").forEach(deleteJobHandler);
  listCollected.querySelectorAll(".btn-delete-job").forEach(deleteJobHandler);

  safeCreateIcons();
}

// Abrir modal aporte
export function openAporteModal(metaId) {
  const meta = state.metas.find(m => parseInt(m.id) === parseInt(metaId));
  if (!meta) return;

  document.getElementById("aporte-meta-id").value = metaId;
  document.getElementById("ahorro-aporte-title").innerText = `Gestionar Ahorro: ${meta.nombre}`;
  document.getElementById("form-ahorro-aporte").reset();
  
  document.getElementById("aporte-meta-id").value = metaId;
  document.getElementById("modal-ahorro-aporte").classList.add("active");
}

// Abrir modal de pagar recordatorio
export function openPayReminderModal(remId) {
  const rem = state.recordatorios.find(r => parseInt(r.id) === parseInt(remId));
  if (!rem) return;

  document.getElementById("pay-rem-id").value = remId;
  document.getElementById("pay-rem-name").innerText = rem.nombre;
  document.getElementById("pay-rem-monto").value = rem.monto > 0 ? rem.monto : "";

  const isTarjeta = rem.tipo === "Tarjeta";
  document.getElementById("pay-rem-tarjeta-container").style.display = isTarjeta ? "block" : "none";

  document.getElementById("modal-pagar-recordatorio").classList.add("active");
}

// Abrir modal registrar cobro freelance
export function openCobrarModal(id) {
  const job = state.trabajos_pendientes.find(j => parseInt(j.id) === parseInt(id));
  if (!job) return;

  document.getElementById("cobrar-job-id").value = job.id;
  document.getElementById("cobrar-job-title").innerText = `${job.cliente} — ${job.descripcion}`;
  document.getElementById("cobrar-monto-real").value = job.monto;

  const ctaDestSelect = document.getElementById("cobrar-cuenta-destino");
  if (ctaDestSelect) {
    ctaDestSelect.innerHTML = "";
    state.cuentas.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.text = c.nombre;
      ctaDestSelect.appendChild(opt);
    });
  }

  const today = new Date().toISOString().substring(0, 10);
  document.getElementById("cobrar-fecha-real").value = today;

  document.getElementById("modal-cobrar-trabajo").classList.add("active");
}
