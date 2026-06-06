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
  generateUniqueId
} from './state.js';
import { 
  calculateBalances, 
  formatDateStr, 
  getCurrentMonthString 
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
      
      modalTx.classList.add("active");
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
    const prevVal = txCatSelect.value;
    txCatSelect.innerHTML = "";
    Object.keys(CATEGORY_STYLES).forEach(cat => {
      if (cat !== "Saldo Inicial" && cat !== "Deuda Inicial") {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.text = cat;
        txCatSelect.appendChild(opt);
      }
    });
    if (prevVal && CATEGORY_STYLES[prevVal]) {
      txCatSelect.value = prevVal;
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
    formTx.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const tipo = document.getElementById("tx-tipo").value;
      const fecha = document.getElementById("tx-fecha").value;
      const monto = parseFloat(document.getElementById("tx-monto").value);
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

      if (editingTransactionId !== null) {
        const tx = state.transacciones.find(t => t.id === editingTransactionId);
        if (tx) {
          tx.tipo = tipo;
          tx.fecha = fecha;
          tx.monto = monto;
          tx.categoria = categoria;
          tx.descripcion = descripcion;
          tx.cuenta_id = cuenta_id;
          tx.tarjeta_id = tarjeta_id;
          tx.fijo = fijo;
        }
        setEditingTransactionId(null);
      } else {
        const nuevaTx = {
          id: generateUniqueId(),
          fecha,
          tipo,
          categoria,
          descripcion,
          monto,
          tarjeta_id,
          cuenta_id,
          fijo
        };
        state.transacciones.unshift(nuevaTx);
      }
      
      document.getElementById("modal-transaccion").classList.remove("active");
      saveState();
    });
  }

  // 2. REGISTRAR TRANSFERENCIA ENTRE CUENTAS
  const formTransf = document.getElementById("form-transferencia-modal");
  if (formTransf) {
    formTransf.addEventListener("submit", (e) => {
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

      const cOrigNombre = state.cuentas.find(c => c.id === cOrig).nombre;
      const cDestNombre = state.cuentas.find(c => c.id === cDest).nombre;

      const txGasto = {
        id: generateUniqueId(),
        fecha,
        tipo: "GASTO",
        categoria: "Transferencia",
        descripcion: `${desc} -> ${cDestNombre}`,
        monto,
        tarjeta_id: null,
        cuenta_id: cOrig,
        fijo: "Variable"
      };
      state.transacciones.unshift(txGasto);

      const txIngreso = {
        id: generateUniqueId(),
        fecha,
        tipo: "INGRESO",
        categoria: "Transferencia",
        descripcion: `${desc} <- ${cOrigNombre}`,
        monto,
        tarjeta_id: null,
        cuenta_id: cDest,
        fijo: "Variable"
      };
      state.transacciones.unshift(txIngreso);
      document.getElementById("modal-transferencia").classList.remove("active");
      saveState();
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
    formAporte.addEventListener("submit", (e) => {
      e.preventDefault();
      const metaId = parseInt(document.getElementById("aporte-meta-id").value);
      const tipo = document.getElementById("aporte-tipo").value;
      const monto = parseFloat(document.getElementById("aporte-monto").value);
      const ctaId = parseInt(document.getElementById("aporte-cuenta").value);

      const meta = state.metas.find(m => m.id === metaId);
      if (!meta) return;

      const todayStr = new Date().toISOString().substring(0, 10);

      if (tipo === "APORTE") {
        meta.actual += monto;
        
        const txAporte = {
          id: generateUniqueId(),
          fecha: todayStr,
          tipo: "GASTO",
          categoria: "Ahorro",
          descripcion: `Aporte a meta: ${meta.nombre}`,
          monto,
          tarjeta_id: null,
          cuenta_id: ctaId,
          fijo: "Variable"
        };
        state.transacciones.unshift(txAporte);
      } else {
        if (meta.actual < monto) {
          showToast("Saldo insuficiente", "No puedes retirar más de lo que has ahorrado en esta meta.", "error");
          return;
        }
        meta.actual -= monto;

        const txRetiro = {
          id: generateUniqueId(),
          fecha: todayStr,
          tipo: "INGRESO",
          categoria: "Ahorro",
          descripcion: `Retiro de meta: ${meta.nombre}`,
          monto,
          tarjeta_id: null,
          cuenta_id: ctaId,
          fijo: "Variable"
        };
        state.transacciones.unshift(txRetiro);
      }

      document.getElementById("modal-ahorro-aporte").classList.remove("active");
      saveState();
    });
  }

  // 7. CONFIRMAR PAGO RECORDATORIO
  const formPayRem = document.getElementById("form-pagar-recordatorio");
  if (formPayRem) {
    formPayRem.addEventListener("submit", (e) => {
      e.preventDefault();
      const remId = parseInt(document.getElementById("pay-rem-id").value);
      const monto = parseFloat(document.getElementById("pay-rem-monto").value);
      const ctaId = parseInt(document.getElementById("pay-rem-cuenta").value);

      const rem = state.recordatorios.find(r => r.id === remId);
      if (!rem) return;

      const todayStr = new Date().toISOString().substring(0, 10);

      if (rem.tipo === "Tarjeta") {
        const tarjId = parseInt(document.getElementById("pay-rem-tarjeta").value);
        const tarjNombre = state.tarjetas.find(t => t.id === tarjId).nombre;

        const txGasto = {
          id: generateUniqueId(),
          fecha: todayStr,
          tipo: "GASTO",
          categoria: "Pago Tarjeta",
          descripcion: `Pago de Tarjeta ${tarjNombre}`,
          monto,
          tarjeta_id: null,
          cuenta_id: ctaId,
          fijo: "Variable"
        };
        state.transacciones.unshift(txGasto);

        const txIngreso = {
          id: generateUniqueId(),
          fecha: todayStr,
          tipo: "INGRESO",
          categoria: "Pago Tarjeta",
          descripcion: `Pago de Tarjeta ${tarjNombre}`,
          monto,
          tarjeta_id: tarjId,
          cuenta_id: null,
          fijo: "Variable"
        };
        state.transacciones.unshift(txIngreso);
      } else {
        const txServicio = {
          id: generateUniqueId(),
          fecha: todayStr,
          tipo: "GASTO",
          categoria: "Servicios",
          descripcion: `Pago de servicio: ${rem.nombre}`,
          monto,
          tarjeta_id: null,
          cuenta_id: ctaId,
          fijo: "Fijo"
        };
        state.transacciones.unshift(txServicio);
      }

      rem.fecha_vencimiento = addOneMonth(rem.fecha_vencimiento);
      rem.estado = "Pendiente";

      document.getElementById("modal-pagar-recordatorio").classList.remove("active");
      saveState();
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
    formCobrar.addEventListener("submit", (e) => {
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
        id: generateUniqueId(),
        fecha: fechaCobro,
        tipo: "INGRESO",
        categoria: "Sueldo",
        descripcion: `Cobro: ${job.cliente} - ${job.descripcion}`,
        monto: montoReal,
        tarjeta_id: null,
        cuenta_id: ctaId,
        fijo: "Variable"
      };

      state.transacciones.unshift(nuevoIngreso);
      document.getElementById("modal-cobrar-trabajo").classList.remove("active");
      saveState();
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
