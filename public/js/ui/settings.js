// Ajustes, Categorías, Copias de Seguridad y Peligros de Moni

import { 
  state, 
  CATEGORY_STYLES, 
  COLOR_PALETTES, 
  DEFAULT_CATEGORY_STYLES, 
  updateState, 
  saveState,
  isLocalStorageMode
} from '../state.js';
import { safeCreateIcons, showToast, escapeHTML, showConfirmModal } from './components.js';

// Rellenar formulario de Ajustes con la configuración del estado
export function populateConfigForm() {
  const confNombre = document.getElementById("conf-nombre-usuario");
  const confMoneda = document.getElementById("conf-moneda");
  const confFormato = document.getElementById("conf-formato");
  const confTcUsd = document.getElementById("conf-tc-usd");

  if (confNombre) {
    confNombre.value = state.configuracion?.nombre_usuario || "Usuario";
  }
  if (confMoneda && state.configuracion?.moneda) {
    confMoneda.value = state.configuracion.moneda;
  }
  if (confFormato && state.configuracion?.formato_fecha) {
    confFormato.value = state.configuracion.formato_fecha;
  }
  if (confTcUsd) {
    confTcUsd.value = state.configuracion?.tipo_cambio_usd || 3.80;
  }

  // Actualizar indicador dinámico de ubicación de la base de datos
  const dbLocationHint = document.getElementById("db-location-hint");
  if (dbLocationHint) {
    if (isLocalStorageMode) {
      dbLocationHint.innerHTML = 'Tus datos están guardados de forma segura en: <span style="font-weight: 600; color: var(--primary-color);">el navegador (LocalStorage)</span>.';
    } else {
      dbLocationHint.innerHTML = 'Tus datos están guardados localmente de forma segura en: <code>/Finanzas/datos.json</code>.';
    }
  }
}

// Renderizar categorías en la sección de configuración
export function renderCategoriesSettings() {
  const container = document.getElementById("config-categories-list");
  if (!container) return;

  container.innerHTML = "";
  const criticalCategories = ["Sueldo", "Pago Tarjeta", "Transferencia", "Otros", "Saldo Inicial", "Deuda Inicial"];

  Object.keys(CATEGORY_STYLES).forEach(cat => {
    const estilo = CATEGORY_STYLES[cat];
    const isCritical = criticalCategories.includes(cat);

    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "space-between";
    card.style.padding = "10px 14px";
    card.style.background = "rgba(255, 255, 255, 0.4)";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "12px";
    card.style.backdropFilter = "blur(10px)";
    card.style.webkitBackdropFilter = "blur(10px)";
    card.style.boxShadow = "var(--shadow-sm)";

    let actionHTML = "";
    if (isCritical) {
      actionHTML = `<span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 6px; font-weight: 500;">Sistema</span>`;
    } else {
      actionHTML = `
        <button class="btn-delete-category btn-icon" data-category="${escapeHTML(cat)}" style="color: var(--text-red); border: none; background: transparent; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px;" title="Eliminar categoría">
          <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
        </button>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="category-badge-icon" style="background-color: ${estilo.bg}; color: ${estilo.color}; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px;">
          <i data-lucide="${estilo.icon}" style="width: 16px; height: 16px;"></i>
        </span>
        <span style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${escapeHTML(cat)}</span>
      </div>
      <div>${actionHTML}</div>
    `;

    container.appendChild(card);
  });

  // Agregar event listeners a los botones de borrar
  container.querySelectorAll(".btn-delete-category").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const catToDelete = e.currentTarget.getAttribute("data-category");
      deleteCategory(catToDelete);
    });
  });

  // Refrescar los iconos
  safeCreateIcons();
}

// Eliminar categoría y gestionar la cascada
export function deleteCategory(categoryName) {
  const criticalCategories = ["Sueldo", "Pago Tarjeta", "Transferencia", "Otros", "Saldo Inicial", "Deuda Inicial"];
  if (criticalCategories.includes(categoryName)) {
    showToast("Acción bloqueada", "No se puede eliminar una categoría del sistema.", "error");
    return;
  }

  showConfirmModal({
    title: "Eliminar categoría",
    message: `¿Eliminar la categoría "${categoryName}"?\n\nLas transacciones que la usen se reasignarán a "Otros" y los presupuestos asociados se eliminarán.`,
    confirmText: "Eliminar",
    danger: true
  }).then(ok => {
    if (!ok) return;
    // 1. Reasignar transacciones a "Otros"
    let countTx = 0;
    state.transacciones.forEach(tx => {
      if (tx.categoria === categoryName) {
        tx.categoria = "Otros";
        countTx++;
      }
    });

    // 2. Eliminar presupuestos asociados
    const prevBudgetLen = state.presupuestos.length;
    state.presupuestos = state.presupuestos.filter(b => b.categoria !== categoryName);
    const countBudgets = prevBudgetLen - state.presupuestos.length;

    // 3. Eliminar de CATEGORY_STYLES
    delete CATEGORY_STYLES[categoryName];

    // 4. Guardar estado y notificar
    saveState();
    
    let msg = `Categoría "${categoryName}" eliminada con éxito.`;
    if (countTx > 0) msg += ` Se reasignaron ${countTx} transacciones a "Otros".`;
    if (countBudgets > 0) msg += ` Se eliminaron ${countBudgets} presupuestos asociados.`;

    showToast("Categoría Eliminada", msg, "info");
  });
}

// Configurar todos los listeners del módulo de ajustes
export function setupSettings() {
  // 1. Guardar Configuración General
  const formConfig = document.getElementById("form-configuracion");
  if (formConfig) {
    formConfig.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.configuracion) state.configuracion = {};
      state.configuracion.nombre_usuario = document.getElementById("conf-nombre-usuario").value.trim() || "Jano";
      state.configuracion.moneda = document.getElementById("conf-moneda").value;
      state.configuracion.formato_fecha = document.getElementById("conf-formato").value;
      state.configuracion.tipo_cambio_usd = parseFloat(document.getElementById("conf-tc-usd").value) || 3.80;
      showToast("Ajustes", "Configuración actualizada correctamente.", "success");
      saveState();
    });
  }

  // 2. Agregar Categoría
  const formAgregarCat = document.getElementById("form-agregar-categoria");
  if (formAgregarCat) {
    formAgregarCat.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("cat-nuevo-nombre");
      const colorSelect = document.getElementById("cat-nuevo-color");
      const iconSelect = document.getElementById("cat-nuevo-icono");
      const tipoSelect = document.getElementById("cat-nuevo-tipo");

      if (!nameInput || !colorSelect || !iconSelect) return;

      const rawName = nameInput.value.trim();
      const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const colorKey = colorSelect.value;
      const icon = iconSelect.value;
      const tipo = tipoSelect ? tipoSelect.value : "GASTO";

      if (!name) {
        showToast("Nombre inválido", "Por favor introduce un nombre válido para la categoría.", "error");
        return;
      }

      // Validar si ya existe
      if (CATEGORY_STYLES[name]) {
        showToast("Categoría existente", `Ya existe una categoría llamada "${name}".`, "warning");
        return;
      }

      // Obtener colores de la paleta
      const palette = COLOR_PALETTES[colorKey] || COLOR_PALETTES["gris"];

      // Crear nueva entrada
      CATEGORY_STYLES[name] = {
        icon: icon,
        color: palette.color,
        bg: palette.bg,
        tipo: tipo
      };

      // Limpiar formulario y guardar
      nameInput.value = "";
      saveState();

      showToast("Categoría Creada", `La categoría "${name}" ha sido creada exitosamente.`, "success");
    });
  }

  // 3. Reiniciar BD
  const btnResetDb = document.getElementById("btn-reset-db");
  if (btnResetDb) {
    btnResetDb.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "Reiniciar base de datos",
        message: "ATENCIÓN: Esto restablecerá los datos por defecto iniciales y borrará tu historial de transacciones, presupuestos, metas y recordatorios. Esta acción no se puede deshacer.",
        confirmText: "Sí, reiniciar todo",
        danger: true
      });
      if (ok) {
        state.transacciones = [];
        state.presupuestos = [
          {"categoria": "Comida", "limite": 800.0},
          {"categoria": "Transporte", "limite": 300.0},
          {"categoria": "Servicios", "limite": 400.0},
          {"categoria": "Entretenimiento", "limite": 200.0},
          {"categoria": "Otros", "limite": 150.0}
        ];
        state.metas = [
          {"id": 1, "nombre": "Fondo de Emergencia", "objetivo": 5000.0, "actual": 1200.0, "fecha_limite": "2026-12-31"},
          {"id": 2, "nombre": "Vacaciones", "objetivo": 3000.0, "actual": 450.0, "fecha_limite": "2026-10-15"}
        ];
        
        const dateForDay = (day) => {
          const d = new Date();
          if (d.getDate() >= day) {
            d.setMonth(d.getMonth() + 1);
          }
          const month = String(d.getMonth() + 1).padStart(2, '0');
          return `${d.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
        };

        state.recordatorios = [
          {"id": 1, "nombre": "Servicio de Luz (Enel)", "monto": 120.00, "fecha_vencimiento": dateForDay(10), "estado": "Pendiente", "tipo": "Servicio"},
          {"id": 2, "nombre": "Internet Claro", "monto": 89.00, "fecha_vencimiento": dateForDay(15), "estado": "Pendiente", "tipo": "Servicio"},
          {"id": 3, "nombre": "Tarjeta Falabella", "monto": 0.00, "fecha_vencimiento": dateForDay(25), "estado": "Pendiente", "tipo": "Tarjeta"},
          {"id": 4, "nombre": "Tarjeta BBVA", "monto": 0.00, "fecha_vencimiento": dateForDay(28), "estado": "Pendiente", "tipo": "Tarjeta"}
        ];
        saveState();
      }
    });
  }

  // 4. Exportar Backup
  const btnExport = document.getElementById("btn-export-backup");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Moni_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Copia de Seguridad", "Backup exportado correctamente.", "success");
    });
  }

  // 5. Importar Backup
  const btnImportTrigger = document.getElementById("btn-import-backup-trigger");
  const inputImport = document.getElementById("input-import-backup");
  if (btnImportTrigger && inputImport) {
    btnImportTrigger.addEventListener("click", () => {
      inputImport.click();
    });

    inputImport.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const importedData = JSON.parse(event.target.result);
          
          if (!importedData.cuentas || !importedData.tarjetas || !importedData.transacciones) {
            throw new Error("El archivo no tiene el formato de backup de Moni válido.");
          }

          updateState(importedData);
          saveState();
          showToast("Copia de Seguridad", "Backup importado y restaurado con éxito.", "success");
          
          inputImport.value = "";
        } catch (err) {
          console.error("Error al importar backup:", err);
          showToast("Error de Importación", "Error al importar el archivo: " + err.message, "error");
        }
      };
      reader.readAsText(file);
    });
  }

  // 6. Agregar Cuenta Bancaria
  const formAgregarCta = document.getElementById("form-agregar-cuenta");
  if (formAgregarCta) {
    formAgregarCta.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("cta-nuevo-nombre");
      const titularInput = document.getElementById("cta-nuevo-titular");
      const tipoSelect = document.getElementById("cta-nuevo-tipo");

      if (!nameInput || !titularInput || !tipoSelect) return;

      const nombre = nameInput.value.trim();
      const titular = titularInput.value.trim();
      const tipo = tipoSelect.value;

      if (!nombre || !titular) {
        showToast("Campos inválidos", "Por favor completa todos los campos para agregar la cuenta.", "error");
        return;
      }

      // Generar nuevo ID único para cuentas
      const nuevoId = state.cuentas.length > 0 ? Math.max(...state.cuentas.map(c => parseInt(c.id) || 0)) + 1 : 1;

      // Crear nueva cuenta
      state.cuentas.push({
        id: nuevoId,
        nombre: nombre,
        titular: titular,
        tipo: tipo
      });

      // Limpiar inputs y guardar
      nameInput.value = "";
      titularInput.value = "";
      saveState();

      showToast("Cuenta Creada", `La cuenta "${nombre}" ha sido creada exitosamente.`, "success");
    });
  }

  // 7. Agregar Tarjeta de Crédito
  const formAgregarTj = document.getElementById("form-agregar-tarjeta");
  if (formAgregarTj) {
    formAgregarTj.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("tj-nuevo-nombre");
      const titularInput = document.getElementById("tj-nuevo-titular");

      if (!nameInput || !titularInput) return;

      const nombre = nameInput.value.trim();
      const titular = titularInput.value.trim();

      if (!nombre || !titular) {
        showToast("Campos inválidos", "Por favor completa todos los campos para agregar la tarjeta.", "error");
        return;
      }

      // Generar nuevo ID único para tarjetas
      const nuevoId = state.tarjetas.length > 0 ? Math.max(...state.tarjetas.map(t => parseInt(t.id) || 0)) + 1 : 1;

      // Crear nueva tarjeta
      state.tarjetas.push({
        id: nuevoId,
        nombre: nombre,
        tipo: "Credito",
        titular: titular
      });

      // Limpiar inputs y guardar
      nameInput.value = "";
      titularInput.value = "";
      saveState();

      showToast("Tarjeta Creada", `La tarjeta "${nombre}" ha sido creada exitosamente.`, "success");
    });
  }
}

// Renderizar cuentas en la sección de configuración
export function renderAccountsSettings() {
  const container = document.getElementById("config-cuentas-list");
  if (!container) return;

  container.innerHTML = "";

  state.cuentas.forEach(c => {
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "space-between";
    card.style.padding = "10px 14px";
    card.style.background = "rgba(255, 255, 255, 0.4)";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "12px";
    card.style.boxShadow = "var(--shadow-sm)";

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="category-badge-icon" style="background-color: #ECFDF5; color: #10B981; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px;">
          <i data-lucide="${c.tipo === 'Efectivo' ? 'wallet' : 'landmark'}" style="width: 16px; height: 16px;"></i>
        </span>
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${escapeHTML(c.nombre)}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(c.tipo)} • Titular: ${escapeHTML(c.titular)}</span>
        </div>
      </div>
      <div>
        <button class="btn-delete-account btn-icon" data-id="${c.id}" style="color: var(--text-red); border: none; background: transparent; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px;" title="Eliminar cuenta">
          <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Agregar event listeners a los botones de borrar
  container.querySelectorAll(".btn-delete-account").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      deleteAccount(id);
    });
  });

  safeCreateIcons();
}

// Renderizar tarjetas en la sección de configuración
export function renderCardsSettings() {
  const container = document.getElementById("config-tarjetas-list");
  if (!container) return;

  container.innerHTML = "";

  state.tarjetas.forEach(t => {
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "space-between";
    card.style.padding = "10px 14px";
    card.style.background = "rgba(255, 255, 255, 0.4)";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "12px";
    card.style.boxShadow = "var(--shadow-sm)";

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="category-badge-icon" style="background-color: #F5F3FF; color: #8B5CF6; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px;">
          <i data-lucide="credit-card" style="width: 16px; height: 16px;"></i>
        </span>
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${escapeHTML(t.nombre)}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Crédito • Titular: ${escapeHTML(t.titular)}</span>
        </div>
      </div>
      <div>
        <button class="btn-delete-card btn-icon" data-id="${t.id}" style="color: var(--text-red); border: none; background: transparent; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px;" title="Eliminar tarjeta">
          <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Agregar event listeners a los botones de borrar
  container.querySelectorAll(".btn-delete-card").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      deleteCard(id);
    });
  });

  safeCreateIcons();
}

// Eliminar cuenta bancaria
export function deleteAccount(id) {
  const countTx = state.transacciones.filter(tx => (parseInt(tx.cuenta_id) || 0) === id).length;
  if (countTx > 0) {
    showToast("Acción bloqueada", `No se puede eliminar esta cuenta porque tiene ${countTx} transacciones asociadas. Reasígnalas o elimínalas primero.`, "error");
    return;
  }

  const c = state.cuentas.find(item => parseInt(item.id) === id);
  if (!c) return;
  showConfirmModal({
    title: "Eliminar cuenta",
    message: `¿Eliminar la cuenta "${c.nombre}"?`,
    confirmText: "Eliminar",
    danger: true
  }).then(ok => {
    if (!ok) return;
    state.cuentas = state.cuentas.filter(item => parseInt(item.id) !== id);
    saveState();
    showToast("Cuenta eliminada", `La cuenta "${c.nombre}" fue eliminada correctamente.`, "success");
  });
}

// Eliminar tarjeta de crédito
export function deleteCard(id) {
  const countTx = state.transacciones.filter(tx => (parseInt(tx.tarjeta_id) || 0) === id).length;
  if (countTx > 0) {
    showToast("Acción bloqueada", `No se puede eliminar esta tarjeta porque tiene ${countTx} transacciones asociadas. Reasígnalas o elimínalas primero.`, "error");
    return;
  }

  const t = state.tarjetas.find(item => parseInt(item.id) === id);
  if (!t) return;
  showConfirmModal({
    title: "Eliminar tarjeta",
    message: `¿Eliminar la tarjeta "${t.nombre}"?`,
    confirmText: "Eliminar",
    danger: true
  }).then(ok => {
    if (!ok) return;
    state.tarjetas = state.tarjetas.filter(item => parseInt(item.id) !== id);
    saveState();
    showToast("Tarjeta eliminada", `La tarjeta "${t.nombre}" fue eliminada correctamente.`, "success");
  });
}
