// Historial de Transacciones, Paginación, Filtros y Exportación de Moni

import { state, CATEGORY_STYLES, setEditingTransactionId, saveState } from '../state.js';
import { formatNumber, formatDateStr, getCurrentMonthString } from '../calculations.js';
import { safeCreateIcons } from './components.js';
import { getOrigenLabel } from './dashboard.js';
import { populateFormSelects } from '../main.js';

export const pagination = {
  currentPage: 1,
  pageSize: 15,
  filteredTransactions: [],
  sortField: "fecha",
  sortOrder: "desc"
};

// Configurar los listeners de filtros y ordenamiento en el historial
export function setupFilters() {
  const txSearch = document.getElementById("tx-search");
  const txFilterTipo = document.getElementById("tx-filter-tipo");
  const txFilterCat = document.getElementById("tx-filter-categoria");
  const txFilterCta = document.getElementById("tx-filter-cuenta");

  if (txSearch) txSearch.addEventListener("input", () => {
    pagination.currentPage = 1;
    filterTransactions();
  });

  if (txFilterTipo) txFilterTipo.addEventListener("change", () => {
    pagination.currentPage = 1;
    filterTransactions();
  });

  if (txFilterCat) txFilterCat.addEventListener("change", () => {
    pagination.currentPage = 1;
    filterTransactions();
  });

  if (txFilterCta) txFilterCta.addEventListener("change", () => {
    pagination.currentPage = 1;
    filterTransactions();
  });

  // Cabeceras de ordenamiento
  document.querySelectorAll(".sortable-header").forEach(header => {
    header.addEventListener("click", () => {
      const field = header.getAttribute("data-sort");
      if (pagination.sortField === field) {
        // Alternar dirección
        pagination.sortOrder = pagination.sortOrder === "asc" ? "desc" : "asc";
      } else {
        // Cambiar de campo y reiniciar a descendente (para monto y fecha) o ascendente (otros)
        pagination.sortField = field;
        pagination.sortOrder = field === "monto" || field === "fecha" ? "desc" : "asc";
      }
      
      // Aplicar filtros e indicar nuevo orden
      filterTransactions();
    });
  });

  // Botones de paginación
  const btnPrevPage = document.getElementById("btn-prev-page");
  if (btnPrevPage) {
    btnPrevPage.addEventListener("click", () => {
      if (pagination.currentPage > 1) {
        pagination.currentPage--;
        renderTransactionsTable();
      }
    });
  }

  const btnNextPage = document.getElementById("btn-next-page");
  if (btnNextPage) {
    btnNextPage.addEventListener("click", () => {
      const totalPages = Math.ceil(pagination.filteredTransactions.length / pagination.pageSize);
      if (pagination.currentPage < totalPages) {
        pagination.currentPage++;
        renderTransactionsTable();
      }
    });
  }

  // Botón Exportar CSV
  const btnExportarCsv = document.getElementById("btn-exportar-csv");
  if (btnExportarCsv) {
    btnExportarCsv.addEventListener("click", exportToCSV);
  }
}

// Filtrar transacciones según los inputs de búsqueda/filtros
export function filterTransactions() {
  const queryEl = document.getElementById("tx-search");
  const tipoEl = document.getElementById("tx-filter-tipo");
  const catEl = document.getElementById("tx-filter-categoria");
  const ctaEl = document.getElementById("tx-filter-cuenta");

  const query = queryEl ? queryEl.value.toLowerCase() : "";
  const tipo = tipoEl ? tipoEl.value : "";
  const cat = catEl ? catEl.value : "";
  const cta = ctaEl ? ctaEl.value : "";

  pagination.filteredTransactions = state.transacciones.filter(tx => {
    const descMatches = (tx.descripcion || "").toLowerCase().includes(query) || (tx.categoria || "").toLowerCase().includes(query);
    const tipoMatches = !tipo || tx.tipo === tipo;
    const catMatches = !cat || tx.categoria === cat;
    
    let ctaMatches = true;
    if (cta) {
      if (cta.startsWith("cta-")) {
        ctaMatches = parseInt(tx.cuenta_id) === parseInt(cta.replace("cta-", ""));
      } else if (cta.startsWith("tarj-")) {
        ctaMatches = parseInt(tx.tarjeta_id) === parseInt(cta.replace("tarj-", ""));
      }
    }

    return descMatches && tipoMatches && catMatches && ctaMatches;
  });

  // Aplicar ordenamiento
  const field = pagination.sortField;
  const order = pagination.sortOrder;

  pagination.filteredTransactions.sort((a, b) => {
    let valA, valB;
    
    if (field === "fecha") {
      valA = new Date(a.fecha);
      valB = new Date(b.fecha);
    } else if (field === "categoria") {
      valA = (a.categoria || "").toLowerCase();
      valB = (b.categoria || "").toLowerCase();
    } else if (field === "cuenta") {
      valA = getOrigenLabel(a).toLowerCase();
      valB = getOrigenLabel(b).toLowerCase();
    } else if (field === "monto") {
      valA = parseFloat(a.monto) || 0;
      valB = parseFloat(b.monto) || 0;
    } else {
      valA = a.id;
      valB = b.id;
    }
    
    if (valA < valB) return order === "asc" ? -1 : 1;
    if (valA > valB) return order === "asc" ? 1 : -1;
    return 0;
  });

  renderTransactionsTable();
}

// Actualizar los iconos de ordenamiento en las cabeceras de la tabla
export function updateSortHeaders() {
  document.querySelectorAll(".sort-icon").forEach(icon => {
    icon.className = "sort-icon"; // Limpiar clases previas
    const field = icon.getAttribute("data-sort");
    if (pagination.sortField === field) {
      icon.classList.add(pagination.sortOrder === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

// Renderizar la tabla de historial de transacciones
export function renderTransactionsTable() {
  // Actualizar los iconos de ordenamiento en las cabeceras
  updateSortHeaders();

  const tableBody = document.getElementById("tx-table-body");
  if (!tableBody) return;

  const mon = state.configuracion.moneda || "S/.";
  tableBody.innerHTML = "";

  const totalRecords = pagination.filteredTransactions.length;
  const totalPages = Math.ceil(totalRecords / pagination.pageSize) || 1;

  // Ajustar página actual por desbordamiento
  if (pagination.currentPage > totalPages) pagination.currentPage = totalPages;

  const startIdx = (pagination.currentPage - 1) * pagination.pageSize;
  const endIdx = Math.min(startIdx + pagination.pageSize, totalRecords);

  const pageRecords = pagination.filteredTransactions.slice(startIdx, endIdx);

  if (pageRecords.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;" class="text-muted">No se encontraron transacciones con los filtros seleccionados.</td></tr>`;
  } else {
    pageRecords.forEach(tx => {
      const estiloCat = CATEGORY_STYLES[tx.categoria] || CATEGORY_STYLES["Otros"];
      const esGasto = tx.tipo === "GASTO";
      const procedencia = getOrigenLabel(tx);
      const isFijo = tx.fijo === "Fijo" || tx.tipo_gasto === "Fijo"; // retrocompatible

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatDateStr(tx.fecha)}</td>
        <td>
          <span style="font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:12px; 
            background-color:${esGasto ? 'var(--color-red-light)' : 'var(--color-green-light)'}; 
            color:${esGasto ? 'var(--color-red)' : 'var(--color-green)'};">
            ${tx.tipo}
          </span>
        </td>
        <td>
          <div class="td-category">
            <span class="category-badge-icon" style="background-color:${estiloCat.bg}; color:${estiloCat.color};">
              <i data-lucide="${estiloCat.icon}" style="width:14px; height:14px;"></i>
            </span>
            <span>${tx.categoria}</span>
          </div>
        </td>
        <td>${tx.descripcion || "Sin detalle"}</td>
        <td><span style="font-weight:600; color:var(--text-muted);">${procedencia}</span></td>
        <td>
          <span class="${isFijo ? 'fixed-badge' : 'variable-badge'}">
            ${isFijo ? 'Fijo' : 'Variable'}
          </span>
        </td>
        <td class="td-amount ${esGasto ? 'text-red' : 'text-green'}">
          ${esGasto ? '-' : '+'}${mon} ${formatNumber(tx.monto)}
        </td>
        <td>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-text btn-edit-tx text-blue" data-id="${tx.id}" style="color:var(--color-blue); font-size:0.8rem; padding: 4px;">
              <i data-lucide="pencil" style="width:16px; height:16px;"></i>
            </button>
            <button class="btn-text btn-delete-tx text-red" data-id="${tx.id}" style="color:var(--color-red); font-size:0.8rem; padding: 4px;">
              <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(row);
    });
  }

  // Actualizar Info de paginación
  const pagInfo = document.getElementById("tx-pagination-info");
  if (pagInfo) {
    pagInfo.innerText = totalRecords > 0 
      ? `Mostrando ${startIdx + 1}-${endIdx} de ${totalRecords} registros`
      : `Mostrando 0 de 0 registros`;
  }

  // Habilitar/Deshabilitar botones
  const btnPrevPage = document.getElementById("btn-prev-page");
  if (btnPrevPage) btnPrevPage.disabled = pagination.currentPage === 1;

  const btnNextPage = document.getElementById("btn-next-page");
  if (btnNextPage) btnNextPage.disabled = pagination.currentPage === totalPages;

  // Reactivar Lucide en la tabla nueva
  safeCreateIcons();

  // Asignar eventos de eliminación
  document.querySelectorAll(".btn-delete-tx").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      if (confirm("¿Estás seguro de eliminar esta transacción?")) {
        deleteTransaction(id);
      }
    });
  });

  // Asignar eventos de edición
  document.querySelectorAll(".btn-edit-tx").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"));
      openEditTransactionModal(id);
    });
  });
}

// Eliminar transacción
export function deleteTransaction(id) {
  state.transacciones = state.transacciones.filter(tx => parseInt(tx.id) !== id);
  saveState();
}

// Abrir modal de edición
export function openEditTransactionModal(id) {
  const tx = state.transacciones.find(t => parseInt(t.id) === id);
  if (!tx) {
    console.error("Transacción no encontrada:", id);
    return;
  }
  
  setEditingTransactionId(id);
  
  // Rellenar selectores del formulario antes de setear el valor
  populateFormSelects();
  
  // Actualizar títulos del modal
  document.getElementById("modal-title").innerText = "Editar Transacción";
  const submitBtn = document.querySelector("#form-transaccion button[type='submit']");
  if (submitBtn) submitBtn.innerText = "Guardar Cambios";
  
  // Rellenar campos del formulario
  document.getElementById("tx-tipo").value = tx.tipo;
  document.getElementById("tx-fecha").value = tx.fecha;
  document.getElementById("tx-monto").value = tx.monto;
  document.getElementById("tx-categoria").value = tx.categoria;
  document.getElementById("tx-descripcion").value = tx.descripcion || "";
  document.getElementById("tx-fijo").value = tx.fijo || "Variable";
  
  // Setear origen de cuenta/tarjeta
  const txOrigenSelect = document.getElementById("tx-origen");
  if (txOrigenSelect) {
    if (tx.cuenta_id !== null && tx.cuenta_id !== undefined) {
      txOrigenSelect.value = `cta-${tx.cuenta_id}`;
    } else if (tx.tarjeta_id !== null && tx.tarjeta_id !== undefined) {
      txOrigenSelect.value = `tarj-${tx.tarjeta_id}`;
    } else {
      txOrigenSelect.value = "";
    }
  }
  
  document.getElementById("modal-transaccion").classList.add("active");
}

// Exportar CSV
export function exportToCSV() {
  const headers = ["Fecha", "Tipo", "Categoria", "Descripcion", "Origen/Destino", "Monto", "Obligatoriedad"];
  const rows = pagination.filteredTransactions.map(tx => [
    tx.fecha,
    tx.tipo,
    tx.categoria,
    (tx.descripcion || "").replace(/"/g, '""'),
    getOrigenLabel(tx),
    tx.monto,
    tx.fijo || "Variable"
  ]);

  // Codificar Excel compatible CSV
  let csvContent = "\uFEFF"; // Byte Order Mark para compatibilidad de acentos en Excel
  csvContent += headers.join(",") + "\n";
  rows.forEach(r => {
    csvContent += r.map(val => `"${val}"`).join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Transacciones_Moni_${getCurrentMonthString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
