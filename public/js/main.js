// Punto de entrada y Orquestador de UI SPA de Moni

import {
  state,
  CATEGORY_STYLES,
  initLocalAuth,
  fetchData,
  saveState,
  isLocalStorageMode,
  editingTransactionId,
  setEditingTransactionId,
  generateUniqueId,
  apiAddTransaccion,
  apiAddPar,
  apiUpdateTransaccion
} from './state.js';
import { 
  calculateBalances, 
  formatDateStr, 
  getCurrentMonthString,
  addOneMonth
} from './calculations.js';
import { 
  safeCreateIcons, 
  showToast 
} from './ui/components.js';
import { 
  renderTotals, 
  renderDashboardLists, 
  renderCharts, 
  renderBudgets, 
  renderReminders, 
  renderSavingsGoals, 
  renderPorCobrar 
} from './ui/dashboard.js';
import { 
  setupFilters, 
  filterTransactions 
} from './ui/history.js';
import { 
  populateConfigForm, 
  renderCategoriesSettings, 
  setupSettings,
  renderAccountsSettings,
  renderCardsSettings
} from './ui/settings.js';
import { 
  setupCommandPalette, 
  initGeminiConfig 
} from './ai/client.js';
import { 
  setupReports, 
  renderMonthlyReport 
} from './ui/reports.js';

// PWA: registrar Service Worker (solo sobre http/https; no en file://)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('No se pudo registrar el Service Worker:', err);
    });
  });
}

// Inicializar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", async () => {
  // Inicializar la autenticación local (carga de token)
  await initLocalAuth();

  // Cargar Fecha Actual en la Cabecera
  renderHeaderDate();
  
  // Cargar Datos desde Servidor Local o LocalStorage
  fetchData();

  // Configurar Eventos de Navegación del Sidebar
  setupNavigation();

  // Configurar Eventos de Formularios y Modales
  setupModalEvents();
  setupFormSubmits();
  setupFilters();
  
  // Inicializar Barra de Comandos y Toasts
  setupCommandPalette();
  initGeminiConfig();
  createToastContainer();
  setupSettings();
  setupReports();
  setupQuickBatch();
});

// Renderizar la fecha de la cabecera
export function renderHeaderDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date();
  const dateStr = today.toLocaleDateString('es-ES', options);
  const headerDateEl = document.getElementById("header-date");
  if (headerDateEl) {
    headerDateEl.innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  }
}

// Crear contenedor de toasts
export function createToastContainer() {
  if (document.getElementById("toast-container")) return;
  const container = document.createElement("div");
  container.id = "toast-container";
  container.className = "toast-container";
  document.body.appendChild(container);
}

// Configurar el sistema de navegación de pestañas (Tabs)
export function setupNavigation() {
  document.querySelectorAll(".sidebar-menu .menu-item:not(.link-externo), .view-all-btn").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      
      const targetId = e.currentTarget.getAttribute("data-target");
      
      // 1. Quitar clase activo de todos los enlaces
      document.querySelectorAll(".sidebar-menu .menu-item").forEach(item => {
        item.classList.remove("active");
      });

      // 2. Colocar activo al enlace correspondiente del menú
      const menuItem = document.querySelector(`.sidebar-menu .menu-item[data-target="${targetId}"]`);
      if (menuItem) menuItem.classList.add("active");

      // 3. Ocultar todas las vistas y mostrar la deseada
      document.querySelectorAll(".app-view").forEach(view => {
        view.classList.remove("active");
      });
      const targetView = document.getElementById(targetId);
      if (targetView) targetView.classList.add("active");
    });
  });
}

// Configurar comportamiento de ventanas modales
export function setupModalEvents() {
  // Modal de Transacción
  const modalTx = document.getElementById("modal-transaccion");
  const btnNewTx = document.getElementById("btn-nueva-transaccion");
  if (btnNewTx && modalTx) {
    btnNewTx.addEventListener("click", () => {
      setEditingTransactionId(null);
      document.getElementById("modal-title").innerText = "Registrar Transacción";
      const submitBtn = document.querySelector("#form-transaccion button[type='submit']");
      if (submitBtn) submitBtn.innerText = "Registrar Movimiento";

      // Establecer fecha de hoy por defecto en el selector
      document.getElementById("tx-fecha").valueAsDate = new Date();
      
      document.getElementById("form-transaccion").reset();
      document.getElementById("tx-fecha").valueAsDate = new Date();
      
      // Filtrar a GASTO inicialmente
      filterCategorySelect(document.getElementById("tx-categoria"), "GASTO");
      
      modalTx.classList.add("active");
    });
  }

  // Escuchar cambio de tipo (Gasto / Ingreso) para actualizar categorías dinámicamente
  const txTipoSelect = document.getElementById("tx-tipo");
  if (txTipoSelect) {
    txTipoSelect.addEventListener("change", (e) => {
      filterCategorySelect(document.getElementById("tx-categoria"), e.target.value);
    });
  }
  
  const btnCloseModalTx = document.getElementById("btn-close-modal-tx");
  if (btnCloseModalTx && modalTx) {
    btnCloseModalTx.addEventListener("click", () => {
      modalTx.classList.remove("active");
    });
  }

  // Modal de Transferencia
  const modalTrans = document.getElementById("modal-transferencia");
  const btnTransf = document.getElementById("btn-transferencia");
  if (btnTransf && modalTrans) {
    btnTransf.addEventListener("click", () => {
      document.getElementById("transf-fecha").valueAsDate = new Date();
      document.getElementById("form-transferencia-modal").reset();
      document.getElementById("transf-fecha").valueAsDate = new Date();
      modalTrans.classList.add("active");
    });
  }

  const btnCloseModalTransf = document.getElementById("btn-close-modal-transf");
  if (btnCloseModalTransf && modalTrans) {
    btnCloseModalTransf.addEventListener("click", () => {
      modalTrans.classList.remove("active");
    });
  }

  // Cerrar modales clickeando afuera
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.classList.remove("active");
    }
  });

  // Modal Aporte
  const btnCloseModalAporte = document.getElementById("btn-close-modal-aporte");
  if (btnCloseModalAporte) {
    btnCloseModalAporte.addEventListener("click", () => {
      document.getElementById("modal-ahorro-aporte").classList.remove("active");
    });
  }

  // Modal Pagar Recordatorio
  const btnCloseModalPayRem = document.getElementById("btn-close-modal-pay-rem");
  if (btnCloseModalPayRem) {
    btnCloseModalPayRem.addEventListener("click", () => {
      document.getElementById("modal-pagar-recordatorio").classList.remove("active");
    });
  }

  // Modal Cobrar Trabajo (Freelance)
  const btnCloseCobrar = document.getElementById("btn-close-modal-cobrar");
  if (btnCloseCobrar) {
    btnCloseCobrar.addEventListener("click", () => {
      document.getElementById("modal-cobrar-trabajo").classList.remove("active");
    });
  }

  // Toggles de Pestañas "Pendientes" / "Cobrados" en Trabajos
  const tabPending = document.getElementById("tab-jobs-pending");
  const tabCollected = document.getElementById("tab-jobs-collected");
  const listPending = document.getElementById("list-jobs-pending");
  const listCollected = document.getElementById("list-jobs-collected");

  if (tabPending && tabCollected && listPending && listCollected) {
    tabPending.addEventListener("click", () => {
      tabPending.classList.add("active");
      tabPending.style.background = "#ffffff";
      tabPending.style.color = "var(--text-main)";

      tabCollected.classList.remove("active");
      tabCollected.style.background = "transparent";
      tabCollected.style.color = "var(--text-muted)";

      listPending.style.display = "flex";
      listCollected.style.display = "none";
    });

    tabCollected.addEventListener("click", () => {
      tabCollected.classList.add("active");
      tabCollected.style.background = "#ffffff";
      tabCollected.style.color = "var(--text-main)";

      tabPending.classList.remove("active");
      tabPending.style.background = "transparent";
      tabPending.style.color = "var(--text-muted)";

      listPending.style.display = "none";
      listCollected.style.display = "flex";
    });
  }
}

// v6: Registro Rápido — modal multi-fila para registrar varios movimientos a la vez
export function setupQuickBatch() {
  const modal = document.getElementById("modal-registro-rapido");
  const btnOpen = document.getElementById("btn-registro-rapido");
  const btnClose = document.getElementById("btn-close-modal-batch");
  const btnAdd = document.getElementById("btn-batch-add-row");
  const btnSave = document.getElementById("btn-batch-save");
  const container = document.getElementById("batch-rows-container");
  const summary = document.getElementById("batch-summary");

  if (!modal || !btnOpen || !container) return;

  const todayStr = () => new Date().toISOString().substring(0, 10);

  const updateSummary = () => {
    if (!summary) return;
    const listos = [...container.querySelectorAll(".batch-monto")]
      .filter(inp => parseFloat(inp.value) > 0).length;
    summary.innerText = listos > 0 ? `${listos} movimiento${listos > 1 ? 's' : ''} listo${listos > 1 ? 's' : ''}` : "";
  };

  const mkSelect = (className, options) => {
    const sel = document.createElement("select");
    sel.className = `form-control ${className}`;
    options.forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.text = label;
      sel.appendChild(opt);
    });
    return sel;
  };

  const createRow = () => {
    const row = document.createElement("div");
    row.className = "batch-row";

    const fecha = document.createElement("input");
    fecha.type = "date";
    fecha.className = "form-control batch-fecha";
    fecha.value = todayStr();

    const tipo = mkSelect("batch-tipo", [["GASTO", "Gasto"], ["INGRESO", "Ingreso"]]);

    const moneda = mkSelect("batch-moneda", [["S/.", "S/."], ["US$", "US$"]]);

    const monto = document.createElement("input");
    monto.type = "number";
    monto.step = "0.01";
    monto.min = "0.01";
    monto.placeholder = "0.00";
    monto.className = "form-control batch-monto";
    monto.addEventListener("input", updateSummary);

    const categoria = document.createElement("select");
    categoria.className = "form-control batch-categoria";

    const updateBatchCatSelect = (tVal) => {
      filterCategorySelect(categoria, tVal);
      if (tVal === "GASTO") {
        if (categoria.querySelector("option[value='Comida']")) categoria.value = "Comida";
      } else if (tVal === "INGRESO") {
        if (categoria.querySelector("option[value='Sueldo']")) categoria.value = "Sueldo";
      }
    };

    tipo.addEventListener("change", (e) => {
      updateBatchCatSelect(e.target.value);
    });

    // Inicializar la fila en GASTO por defecto
    updateBatchCatSelect("GASTO");

    const origenOptions = [
      ...state.cuentas.map(c => [`cta-${c.id}`, `[Cta] ${c.nombre}`]),
      ...state.tarjetas.map(t => [`tarj-${t.id}`, `[Tarj] ${t.nombre}`])
    ];
    const origen = mkSelect("batch-origen", origenOptions);

    const desc = document.createElement("input");
    desc.type = "text";
    desc.placeholder = "Descripción (opcional)";
    desc.className = "form-control batch-desc";

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.title = "Quitar fila";
    btnDel.style.cssText = "color:var(--text-red); border:none; background:transparent; cursor:pointer; font-size:1.1rem; font-weight:700; line-height:1;";
    btnDel.innerText = "×";
    btnDel.addEventListener("click", () => {
      if (container.querySelectorAll(".batch-row").length > 1) {
        row.remove();
      } else {
        // Última fila: solo limpiar
        monto.value = "";
        desc.value = "";
      }
      updateSummary();
    });

    [fecha, tipo, moneda, monto, categoria, origen, desc, btnDel].forEach(el => row.appendChild(el));
    return row;
  };

  const openModal = () => {
    container.innerHTML = "";
    for (let i = 0; i < 3; i++) container.appendChild(createRow());
    updateSummary();
    modal.classList.add("active");
    // Foco en el primer monto para empezar a teclear de inmediato
    setTimeout(() => container.querySelector(".batch-monto")?.focus(), 100);
  };

  btnOpen.addEventListener("click", openModal);
  if (btnClose) btnClose.addEventListener("click", () => modal.classList.remove("active"));
  if (btnAdd) btnAdd.addEventListener("click", () => {
    const row = createRow();
    container.appendChild(row);
    row.querySelector(".batch-monto")?.focus();
  });

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const rows = [...container.querySelectorAll(".batch-row")];
      const nuevas = [];

      rows.forEach(row => {
        const monto = parseFloat(row.querySelector(".batch-monto").value);
        if (!monto || monto <= 0) return; // filas vacías se ignoran

        const origenRaw = row.querySelector(".batch-origen").value;
        let cuenta_id = null;
        let tarjeta_id = null;
        if (origenRaw.startsWith("cta-")) cuenta_id = parseInt(origenRaw.replace("cta-", ""));
        else if (origenRaw.startsWith("tarj-")) tarjeta_id = parseInt(origenRaw.replace("tarj-", ""));

        nuevas.push({
          fecha: row.querySelector(".batch-fecha").value || todayStr(),
          tipo: row.querySelector(".batch-tipo").value,
          moneda: row.querySelector(".batch-moneda").value === "US$" ? "US$" : "S/.",
          monto,
          categoria: row.querySelector(".batch-categoria").value,
          descripcion: row.querySelector(".batch-desc").value.trim(),
          cuenta_id,
          tarjeta_id,
          fijo: "Variable"
        });
      });

      if (nuevas.length === 0) {
        showToast("Sin movimientos", "Ingresa al menos un monto para registrar.", "error");
        return;
      }

      if (isLocalStorageMode) {
        let nextId = generateUniqueId();
        nuevas.forEach(tx => state.transacciones.unshift({ id: nextId++, ...tx }));
        saveState();
      } else {
        try {
          for (const tx of nuevas) {
            const saved = await apiAddTransaccion(tx);
            if (saved) state.transacciones.unshift(saved);
          }
          updateUI();
        } catch (err) {
          showToast("Error de conexión", "No se pudieron guardar los movimientos. Intenta de nuevo.", "error");
          return;
        }
      }

      modal.classList.remove("active");
      showToast("Registro Rápido", `${nuevas.length} movimiento${nuevas.length > 1 ? 's' : ''} registrado${nuevas.length > 1 ? 's' : ''} con éxito.`, "success");
    });
  }
}

// Filtrar dinámicamente un select de categorías según el tipo de transacción (Gasto o Ingreso)
export function filterCategorySelect(selectEl, transactionType) {
  if (!selectEl) return;
  const prevVal = selectEl.value;
  selectEl.innerHTML = "";

  Object.keys(CATEGORY_STYLES).forEach(cat => {
    const estilo = CATEGORY_STYLES[cat];
    let catTipo = estilo.tipo;
    
    // Sobrescribir tipos fijos del sistema para evitar que datos antiguos guarden "SISTEMA" en Transferencia
    if (cat === "Sueldo") catTipo = "INGRESO";
    else if (["Saldo Inicial", "Deuda Inicial", "Pago Tarjeta"].includes(cat)) catTipo = "SISTEMA";
    else if (["Otros", "Transferencia"].includes(cat)) catTipo = "AMBOS";
    else if (!catTipo) catTipo = "GASTO";

    const match = 
      (transactionType === "GASTO" && (catTipo === "GASTO" || catTipo === "AMBOS")) ||
      (transactionType === "INGRESO" && (catTipo === "INGRESO" || catTipo === "AMBOS"));

    if (match) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.text = cat;
      selectEl.appendChild(opt);
    }
  });

  if (prevVal && selectEl.querySelector(`option[value="${prevVal}"]`)) {
    selectEl.value = prevVal;
  }
}

// Rellenar selectores de cuentas y categorías en formularios dinámicos
export function populateFormSelects() {
  const txOrigenSelect = document.getElementById("tx-origen");
  if (txOrigenSelect) {
    txOrigenSelect.innerHTML = "";
    
    // Añadir cuentas de debito
    const optGroupCta = document.createElement("optgroup");
    optGroupCta.label = "Cuentas de Débito (Bancarias)";
    state.cuentas.forEach(c => {
      const opt = document.createElement("option");
      opt.value = `cta-${c.id}`;
      opt.text = c.nombre;
      optGroupCta.appendChild(opt);
    });
    txOrigenSelect.appendChild(optGroupCta);

    // Añadir tarjetas de crédito
    const optGroupTarj = document.createElement("optgroup");
    optGroupTarj.label = "Tarjetas de Crédito";
    state.tarjetas.forEach(t => {
      const opt = document.createElement("option");
      opt.value = `tarj-${t.id}`;
      opt.text = t.nombre;
      optGroupTarj.appendChild(opt);
    });
    txOrigenSelect.appendChild(optGroupTarj);
  }

  const txCatSelect = document.getElementById("tx-categoria");
  if (txCatSelect) {
    const txTipo = document.getElementById("tx-tipo")?.value || "GASTO";
    filterCategorySelect(txCatSelect, txTipo);
  }

  const budgetCatSelect = document.getElementById("budget-category");
  if (budgetCatSelect) {
    const prevVal = budgetCatSelect.value;
    budgetCatSelect.innerHTML = "";
    Object.keys(CATEGORY_STYLES).forEach(cat => {
      const isSystemOnly = ["Saldo Inicial", "Deuda Inicial", "Sueldo", "Pago Tarjeta", "Transferencia"].includes(cat);
      if (!isSystemOnly) {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.text = cat;
        budgetCatSelect.appendChild(opt);
      }
    });
    if (prevVal && CATEGORY_STYLES[prevVal]) {
      budgetCatSelect.value = prevVal;
    }
  }

  // Rellenar filtros del historial
  const filterCat = document.getElementById("tx-filter-categoria");
  if (filterCat) {
    const prevVal = filterCat.value;
    filterCat.innerHTML = `<option value="">Todas las categorías</option>`;
    Object.keys(CATEGORY_STYLES).forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.text = cat;
      filterCat.appendChild(opt);
    });
    if (prevVal) filterCat.value = prevVal;
  }

  const filterCta = document.getElementById("tx-filter-cuenta");
  if (filterCta && filterCta.children.length <= 1) {
    filterCta.innerHTML = `<option value="">Todas las cuentas/tarjetas</option>`;
    
    state.cuentas.forEach(c => {
      const opt = document.createElement("option");
      opt.value = `cta-${c.id}`;
      opt.text = `[Cta] ${c.nombre}`;
      filterCta.appendChild(opt);
    });

    state.tarjetas.forEach(t => {
      const opt = document.createElement("option");
      opt.value = `tarj-${t.id}`;
      opt.text = `[Tarj] ${t.nombre}`;
      filterCta.appendChild(opt);
    });
  }

  // Rellenar modales de traspasos y recordatorios
  const transfOrigen = document.getElementById("transf-origen");
  const transfDestino = document.getElementById("transf-destino");
  if (transfOrigen && transfDestino) {
    transfOrigen.innerHTML = "";
    transfDestino.innerHTML = "";
    state.cuentas.forEach(c => {
      const opt1 = document.createElement("option");
      opt1.value = c.id;
      opt1.text = c.nombre;
      transfOrigen.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = c.id;
      opt2.text = c.nombre;
      transfDestino.appendChild(opt2);
    });
  }

  const aporteCuenta = document.getElementById("aporte-cuenta");
  if (aporteCuenta) {
    aporteCuenta.innerHTML = "";
    state.cuentas.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.text = c.nombre;
      aporteCuenta.appendChild(opt);
    });
  }

  const remCuenta = document.getElementById("pay-rem-cuenta");
  if (remCuenta) {
    remCuenta.innerHTML = "";
    state.cuentas.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.text = c.nombre;
      remCuenta.appendChild(opt);
    });
  }

  const remTarj = document.getElementById("pay-rem-tarjeta");
  if (remTarj) {
    remTarj.innerHTML = "";
    state.tarjetas.filter(t => t.tipo === "Credito").forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.text = t.nombre;
      remTarj.appendChild(opt);
    });
  }
}

// Bindeo de submits de formularios
export function setupFormSubmits() {
  // 1. REGISTRAR O EDITAR TRANSACCIÓN
  const formTx = document.getElementById("form-transaccion");
  if (formTx) {
    formTx.addEventListener("submit", async (e) => {
      e.preventDefault();

      const tipo = document.getElementById("tx-tipo").value;
      const fecha = document.getElementById("tx-fecha").value;
      const monto = parseFloat(document.getElementById("tx-monto").value);
      const moneda = document.getElementById("tx-moneda")?.value || "S/.";
      const categoria = document.getElementById("tx-categoria").value;
      const descripcion = document.getElementById("tx-descripcion").value;
      const fijo = document.getElementById("tx-fijo").value;

      const origenRaw = document.getElementById("tx-origen").value;
      let cuenta_id = null;
      let tarjeta_id = null;

      if (origenRaw.startsWith("cta-")) {
        cuenta_id = parseInt(origenRaw.replace("cta-", ""));
      } else if (origenRaw.startsWith("tarj-")) {
        tarjeta_id = parseInt(origenRaw.replace("tarj-", ""));
      }

      try {
        if (editingTransactionId !== null) {
          const campos = { tipo, fecha, monto, moneda, categoria, descripcion, cuenta_id, tarjeta_id, fijo };
          if (isLocalStorageMode) {
            const tx = state.transacciones.find(t => t.id === editingTransactionId);
            if (tx) Object.assign(tx, campos);
            saveState();
          } else {
            const updated = await apiUpdateTransaccion(editingTransactionId, campos);
            const tx = state.transacciones.find(t => t.id === editingTransactionId);
            if (tx && updated) Object.assign(tx, updated);
            updateUI();
          }
          setEditingTransactionId(null);
        } else {
          const nuevaTx = { fecha, tipo, categoria, descripcion, monto, moneda, tarjeta_id, cuenta_id, fijo };
          if (isLocalStorageMode) {
            state.transacciones.unshift({ id: generateUniqueId(), ...nuevaTx });
            saveState();
          } else {
            const saved = await apiAddTransaccion(nuevaTx);
            if (saved) state.transacciones.unshift(saved);
            updateUI();
          }
        }
      } catch (err) {
        showToast("Error de conexión", "No se pudo guardar la transacción. Intenta de nuevo.", "error");
        return;
      }

      document.getElementById("modal-transaccion").classList.remove("active");
    });
  }

  // 2. REGISTRAR TRANSFERENCIA ENTRE CUENTAS
  const formTransf = document.getElementById("form-transferencia-modal");
  if (formTransf) {
    formTransf.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fecha = document.getElementById("transf-fecha").value;
      const cOrig = parseInt(document.getElementById("transf-origen").value);
      const cDest = parseInt(document.getElementById("transf-destino").value);
      const monto = parseFloat(document.getElementById("transf-monto").value);
      const desc = document.getElementById("transf-desc").value || "Transferencia entre cuentas";

      if (cOrig === cDest) {
        showToast("Error de validación", "La cuenta de origen y destino no pueden ser iguales.", "error");
        return;
      }

      const cOrigCta = state.cuentas.find(c => parseInt(c.id) === cOrig);
      const cDestCta = state.cuentas.find(c => parseInt(c.id) === cDest);
      const cOrigNombre = cOrigCta ? cOrigCta.nombre : "Origen";
      const cDestNombre = cDestCta ? cDestCta.nombre : "Destino";

      const txGasto = {
        fecha,
        tipo: "GASTO",
        categoria: "Transferencia",
        descripcion: `${desc} -> ${cDestNombre}`,
        monto,
        tarjeta_id: null,
        cuenta_id: cOrig,
        fijo: "Variable"
      };

      const txIngreso = {
        fecha,
        tipo: "INGRESO",
        categoria: "Transferencia",
        descripcion: `${desc} <- ${cOrigNombre}`,
        monto,
        tarjeta_id: null,
        cuenta_id: cDest,
        fijo: "Variable"
      };

      try {
        if (isLocalStorageMode) {
          // v6: ambas piernas comparten transfer_id para editarse/borrarse en par
          const gastoId = generateUniqueId();
          state.transacciones.unshift({ id: gastoId, ...txGasto, transfer_id: gastoId });
          state.transacciones.unshift({ id: generateUniqueId(), ...txIngreso, transfer_id: gastoId });
          saveState();
        } else {
          const r = await apiAddPar(txGasto, txIngreso);
          if (r?.gasto) state.transacciones.unshift(r.gasto);
          if (r?.ingreso) state.transacciones.unshift(r.ingreso);
          updateUI();
        }
      } catch (err) {
        showToast("Error de conexión", "No se pudo registrar la transferencia. Intenta de nuevo.", "error");
        return;
      }

      document.getElementById("modal-transferencia").classList.remove("active");
    });
  }

  // 3. NUEVO PRESUPUESTO
  const formBudget = document.getElementById("form-presupuesto");
  if (formBudget) {
    formBudget.addEventListener("submit", (e) => {
      e.preventDefault();
      const cat = document.getElementById("budget-category").value;
      const lim = parseFloat(document.getElementById("budget-amount").value);

      const existIdx = state.presupuestos.findIndex(b => b.categoria === cat);
      if (existIdx >= 0) {
        state.presupuestos[existIdx].limite = lim;
      } else {
        state.presupuestos.push({ categoria: cat, limite: lim });
      }

      formBudget.reset();
      saveState();
    });
  }

  // 4. NUEVO RECORDATORIO
  const formRem = document.getElementById("form-recordatorio");
  if (formRem) {
    formRem.addEventListener("submit", (e) => {
      e.preventDefault();
      const nombre = document.getElementById("rem-nombre").value;
      const monto = parseFloat(document.getElementById("rem-monto").value || 0);
      const fecha = document.getElementById("rem-fecha").value;
      const tipo = document.getElementById("rem-tipo").value;

      const nuevoRem = {
        id: generateUniqueId(),
        nombre,
        monto,
        fecha_vencimiento: fecha,
        estado: "Pendiente",
        tipo
      };

      state.recordatorios.push(nuevoRem);
      formRem.reset();
      saveState();
    });
  }

  // 5. NUEVA META DE AHORRO
  const formGoal = document.getElementById("form-meta");
  if (formGoal) {
    formGoal.addEventListener("submit", (e) => {
      e.preventDefault();
      const nombre = document.getElementById("goal-nombre").value;
      const objetivo = parseFloat(document.getElementById("goal-objetivo").value);
      const actual = parseFloat(document.getElementById("goal-actual").value || 0);
      const fecha = document.getElementById("goal-fecha").value;

      const nuevaMeta = {
        id: generateUniqueId(),
        nombre,
        objetivo,
        actual,
        fecha_limite: fecha
      };

      state.metas.push(nuevaMeta);
      formGoal.reset();
      saveState();
    });
  }

  // 6. GESTIONAR APORTE A METAS
  const formAporte = document.getElementById("form-ahorro-aporte");
  if (formAporte) {
    formAporte.addEventListener("submit", async (e) => {
      e.preventDefault();
      const metaId = parseInt(document.getElementById("aporte-meta-id").value);
      const tipo = document.getElementById("aporte-tipo").value;
      const monto = parseFloat(document.getElementById("aporte-monto").value);
      const ctaId = parseInt(document.getElementById("aporte-cuenta").value);

      const meta = state.metas.find(m => m.id === metaId);
      if (!meta) return;

      const todayStr = new Date().toISOString().substring(0, 10);
      let tx;

      if (tipo === "APORTE") {
        meta.actual += monto;
        tx = {
          fecha: todayStr,
          tipo: "GASTO",
          categoria: "Ahorro",
          descripcion: `Aporte a meta: ${meta.nombre}`,
          monto,
          tarjeta_id: null,
          cuenta_id: ctaId,
          fijo: "Variable"
        };
      } else {
        if (meta.actual < monto) {
          showToast("Saldo insuficiente", "No puedes retirar más de lo que has ahorrado en esta meta.", "error");
          return;
        }
        meta.actual -= monto;
        tx = {
          fecha: todayStr,
          tipo: "INGRESO",
          categoria: "Ahorro",
          descripcion: `Retiro de meta: ${meta.nombre}`,
          monto,
          tarjeta_id: null,
          cuenta_id: ctaId,
          fijo: "Variable"
        };
      }

      try {
        if (isLocalStorageMode) {
          state.transacciones.unshift({ id: generateUniqueId(), ...tx });
        } else {
          const saved = await apiAddTransaccion(tx);
          if (saved) state.transacciones.unshift(saved);
        }
      } catch (err) {
        showToast("Error de conexión", "No se pudo registrar el movimiento de la meta. Intenta de nuevo.", "error");
        return;
      }

      document.getElementById("modal-ahorro-aporte").classList.remove("active");
      saveState(); // persiste el cambio de meta.actual (blob); la transacción ya se guardó arriba
    });
  }

  // 7. CONFIRMAR PAGO RECORDATORIO
  const formPayRem = document.getElementById("form-pagar-recordatorio");
  if (formPayRem) {
    formPayRem.addEventListener("submit", async (e) => {
      e.preventDefault();
      const remId = parseInt(document.getElementById("pay-rem-id").value);
      const monto = parseFloat(document.getElementById("pay-rem-monto").value);
      const ctaId = parseInt(document.getElementById("pay-rem-cuenta").value);

      const rem = state.recordatorios.find(r => parseInt(r.id) === remId);
      if (!rem) {
        showToast("Error", "No se encontró el recordatorio.", "error");
        return;
      }

      const todayStr = new Date().toISOString().substring(0, 10);

      try {
        if (rem.tipo === "Tarjeta") {
          const tarjId = parseInt(document.getElementById("pay-rem-tarjeta").value);
          const tarj = state.tarjetas.find(t => parseInt(t.id) === tarjId);
          const tarjNombre = tarj ? tarj.nombre : "Tarjeta";

          const txGasto = {
            fecha: todayStr,
            tipo: "GASTO",
            categoria: "Pago Tarjeta",
            descripcion: `Pago de Tarjeta ${tarjNombre}`,
            monto,
            tarjeta_id: null,
            cuenta_id: ctaId,
            fijo: "Variable"
          };
          const txIngreso = {
            fecha: todayStr,
            tipo: "INGRESO",
            categoria: "Pago Tarjeta",
            descripcion: `Pago de Tarjeta ${tarjNombre}`,
            monto,
            tarjeta_id: tarj ? tarj.id : null,
            cuenta_id: null,
            fijo: "Variable"
          };

          if (isLocalStorageMode) {
            state.transacciones.unshift({ id: generateUniqueId(), ...txGasto });
            state.transacciones.unshift({ id: generateUniqueId(), ...txIngreso });
          } else {
            const r = await apiAddPar(txGasto, txIngreso);
            if (r?.gasto) state.transacciones.unshift(r.gasto);
            if (r?.ingreso) state.transacciones.unshift(r.ingreso);
          }
        } else {
          const txServicio = {
            fecha: todayStr,
            tipo: "GASTO",
            categoria: "Servicios",
            descripcion: `Pago de servicio: ${rem.nombre}`,
            monto,
            tarjeta_id: null,
            cuenta_id: ctaId,
            fijo: "Fijo"
          };

          if (isLocalStorageMode) {
            state.transacciones.unshift({ id: generateUniqueId(), ...txServicio });
          } else {
            const saved = await apiAddTransaccion(txServicio);
            if (saved) state.transacciones.unshift(saved);
          }
        }
      } catch (err) {
        showToast("Error de conexión", "No se pudo registrar el pago. Intenta de nuevo.", "error");
        return;
      }

      if (rem.tipo !== "Tarjeta") {
        rem.fecha_vencimiento = addOneMonth(rem.fecha_vencimiento);
        rem.estado = "Pendiente";
      } else {
        rem.estado = "Pagado";
      }

      document.getElementById("modal-pagar-recordatorio").classList.remove("active");
      saveState(); // persiste el cambio del recordatorio (blob); las transacciones ya se guardaron arriba
    });
  }

  // 8. NUEVO TRABAJO FREELANCE
  const formTrabajo = document.getElementById("form-trabajo-por-cobrar");
  if (formTrabajo) {
    formTrabajo.addEventListener("submit", (e) => {
      e.preventDefault();
      const cliente = document.getElementById("job-cliente").value;
      const descripcion = document.getElementById("job-descripcion").value;
      const monto = parseFloat(document.getElementById("job-monto").value);
      const fecha_emision = document.getElementById("job-fecha").value;

      if (!state.trabajos_pendientes) state.trabajos_pendientes = [];

      const nuevoJob = {
        id: generateUniqueId(),
        cliente,
        descripcion,
        monto,
        fecha_emision,
        estado: "Pendiente",
        fecha_cobro: null,
        cuenta_id: null
      };

      state.trabajos_pendientes.push(nuevoJob);
      formTrabajo.reset();
      saveState();
    });
  }

  // 9. REGISTRAR COBRO FREELANCE
  const formCobrar = document.getElementById("form-cobrar-trabajo");
  if (formCobrar) {
    formCobrar.addEventListener("submit", async (e) => {
      e.preventDefault();
      const jobId = parseInt(document.getElementById("cobrar-job-id").value);
      const montoReal = parseFloat(document.getElementById("cobrar-monto-real").value);
      const ctaId = parseInt(document.getElementById("cobrar-cuenta-destino").value);
      const fechaCobro = document.getElementById("cobrar-fecha-real").value;

      const job = state.trabajos_pendientes.find(j => j.id === jobId);
      if (!job) return;

      job.estado = "Cobrado";
      job.fecha_cobro = fechaCobro;
      job.cuenta_id = ctaId;
      job.monto = montoReal;

      const nuevoIngreso = {
        fecha: fechaCobro,
        tipo: "INGRESO",
        categoria: "Sueldo",
        descripcion: `Cobro: ${job.cliente} - ${job.descripcion}`,
        monto: montoReal,
        tarjeta_id: null,
        cuenta_id: ctaId,
        fijo: "Variable"
      };

      try {
        if (isLocalStorageMode) {
          state.transacciones.unshift({ id: generateUniqueId(), ...nuevoIngreso });
        } else {
          const saved = await apiAddTransaccion(nuevoIngreso);
          if (saved) state.transacciones.unshift(saved);
        }
      } catch (err) {
        showToast("Error de conexión", "No se pudo registrar el cobro. Intenta de nuevo.", "error");
        return;
      }

      document.getElementById("modal-cobrar-trabajo").classList.remove("active");
      saveState(); // persiste el cambio del trabajo (blob); la transacción ya se guardó arriba
    });
  }
}

// Orquestador Reactivo Principal
export function updateUI() {
  if (!state.trabajos_pendientes) state.trabajos_pendientes = [];

  // Actualizar texto de bienvenida dinámicamente
  const welcomeTextEl = document.getElementById("welcome-text");
  if (welcomeTextEl) {
    const userName = state.configuracion?.nombre_usuario || "Jano";
    welcomeTextEl.innerText = `Hola, ${userName}`;
  }

  // 1. Cálculos de Balances
  const calculatedBalances = calculateBalances(state);

  // 2. Renderizar Totales Principales
  renderTotals(calculatedBalances);

  // 3. Renderizar Listas en Dashboard
  renderDashboardLists(calculatedBalances);

  // 4. Renderizar Gráficos
  renderCharts();

  // 5. Inicializar/Refrescar Lucide Icons
  safeCreateIcons();

  // 6. Rellenar selectores de cuentas en formularios dinámicos
  populateFormSelects();

  // 7. Renderizar Historial de Transacciones Completo
  filterTransactions();

  // 8. Renderizar Presupuestos, Recordatorios y Metas
  renderBudgets(calculatedBalances.gastosPorCategoriaEsteMes);
  renderReminders();
  renderSavingsGoals();

  // 9. Renderizar Trabajos por Cobrar (Freelance)
  renderPorCobrar();

  // 10. Rellenar formulario de Ajustes
  populateConfigForm();

  // 11. Renderizar gestión de categorías
  renderCategoriesSettings();

  // 11b. Renderizar gestión de cuentas y tarjetas
  renderAccountsSettings();
  renderCardsSettings();

  // 12. Renderizar reporte dinámico si está cargado
  const reportSelect = document.getElementById("report-month-select");
  if (reportSelect && reportSelect.value) {
    renderMonthlyReport(reportSelect.value);
  }
}
