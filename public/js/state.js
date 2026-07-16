// Gestión del estado y persistencia híbrida de Moni

import { updateUI } from './main.js';

export const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';
export let LOCAL_TOKEN = '';

export const COLOR_PALETTES = {
  "verde": { color: "#10B981", bg: "#ECFDF5" },
  "dorado": { color: "#F59E0B", bg: "#FEF3C7" },
  "azul": { color: "#3B82F6", bg: "#EFF6FF" },
  "rojo": { color: "#EF4444", bg: "#FFF1F2" },
  "purpura": { color: "#8B5CF6", bg: "#F5F3FF" },
  "teal": { color: "#0D9488", bg: "#F0FDFA" },
  "rosado": { color: "#EC4899", bg: "#FCE7F3" },
  "indigo": { color: "#6366F1", bg: "#EEF2FF" },
  "gris": { color: "#6B7280", bg: "#F3F4F6" }
};

export const DEFAULT_CATEGORY_STYLES = {
  "Comida": { icon: "utensils", color: "#F59E0B", bg: "#FEF3C7", tipo: "GASTO" },
  "Transporte": { icon: "car", color: "#3B82F6", bg: "#EFF6FF", tipo: "GASTO" },
  "Servicios": { icon: "lightbulb", color: "#EF4444", bg: "#FFF1F2", tipo: "GASTO" },
  "Vivienda": { icon: "home", color: "#0D9488", bg: "#F0FDFA", tipo: "GASTO" },
  "Educación": { icon: "graduation-cap", color: "#D946EF", bg: "#FDF4FF", tipo: "GASTO" },
  "Entretenimiento": { icon: "party-popper", color: "#8B5CF6", bg: "#F5F3FF", tipo: "GASTO" },
  "Sueldo": { icon: "banknote", color: "#10B981", bg: "#ECFDF5", tipo: "INGRESO" },
  "Pago Tarjeta": { icon: "credit-card", color: "#6366F1", bg: "#EEF2FF", tipo: "SISTEMA" },
  "Transferencia": { icon: "repeat", color: "#6B7280", bg: "#F3F4F6", tipo: "AMBOS" },
  "Ahorro": { icon: "piggy-bank", color: "#EC4899", bg: "#FCE7F3", tipo: "GASTO" },
  "Mascotas": { icon: "paw-print", color: "#EC4899", bg: "#FCE7F3", tipo: "GASTO" },
  "Saldo Inicial": { icon: "wallet", color: "#10B981", bg: "#ECFDF5", tipo: "SISTEMA" },
  "Deuda Inicial": { icon: "shield-alert", color: "#EF4444", bg: "#FFF1F2", tipo: "SISTEMA" },
  "Otros": { icon: "help-circle", color: "#6B7280", bg: "#F3F4F6", tipo: "AMBOS" },
  "Salud": { icon: "heart-pulse", color: "#8B5CF6", bg: "#F5F3FF", tipo: "GASTO" }
};

export let CATEGORY_STYLES = { ...DEFAULT_CATEGORY_STYLES };

export function updateCategoryStyles(newStyles) {
  Object.keys(CATEGORY_STYLES).forEach(k => delete CATEGORY_STYLES[k]);
  // Mezclar los defaults con los guardados, para que nunca falte una categoría base
  Object.assign(CATEGORY_STYLES, DEFAULT_CATEGORY_STYLES, newStyles || {});
}

// Estado global mutable
export const state = {
  cuentas: [],
  tarjetas: [],
  transacciones: [],
  presupuestos: [],
  metas: [],
  recordatorios: [],
  categorias: { ...DEFAULT_CATEGORY_STYLES },
  configuracion: {
    nombre_usuario: "Jano",
    moneda: "S/.",
    formato_fecha: "DD/MM/YYYY"
  },
  trabajos_pendientes: []
};

function deduplicateIds() {
  let wasChanged = false;
  const seenIds = new Set();
  
  if (state.transacciones) {
    state.transacciones.forEach(t => {
      if (t.id) seenIds.add(parseInt(t.id));
    });
  }

  const getNextId = () => {
    let maxId = seenIds.size > 0 ? Math.max(...seenIds) : 0;
    let nextId = maxId + 1;
    seenIds.add(nextId);
    return nextId;
  };

  // 1. Trabajos pendientes / Cuentas por cobrar
  if (state.trabajos_pendientes) {
    const jobsSeen = new Set();
    state.trabajos_pendientes.forEach(j => {
      const jobId = parseInt(j.id);
      if (!jobId || jobsSeen.has(jobId) || seenIds.has(jobId)) {
        j.id = getNextId();
        wasChanged = true;
      } else {
        seenIds.add(jobId);
      }
      jobsSeen.add(parseInt(j.id));
    });
  }

  // 2. Recordatorios
  if (state.recordatorios) {
    const remsSeen = new Set();
    state.recordatorios.forEach(r => {
      const remId = parseInt(r.id);
      if (!remId || remsSeen.has(remId) || seenIds.has(remId)) {
        r.id = getNextId();
        wasChanged = true;
      } else {
        seenIds.add(remId);
      }
      remsSeen.add(parseInt(r.id));
    });
  }

  // 3. Metas
  if (state.metas) {
    const metasSeen = new Set();
    state.metas.forEach(m => {
      const metaId = parseInt(m.id);
      if (!metaId || metasSeen.has(metaId) || seenIds.has(metaId)) {
        m.id = getNextId();
        wasChanged = true;
      } else {
        seenIds.add(metaId);
      }
      metasSeen.add(parseInt(m.id));
    });
  }

  return wasChanged;
}

export function updateState(newState) {
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, newState);
  
  const wasChanged = deduplicateIds();

  if (state.categorias) {
    updateCategoryStyles(state.categorias);
  }

  if (wasChanged) {
    saveState();
  }
}

export let isLocalStorageMode = false;
export function setLocalStorageMode(val) {
  isLocalStorageMode = val;
}

export let editingTransactionId = null;
export function setEditingTransactionId(id) {
  editingTransactionId = id;
}

// Inicializar la autenticación local (carga de token)
export async function initLocalAuth() {
  try {
    const response = await fetch(`${API_BASE}/api/session-token`);
    if (response.ok) {
      const data = await response.json();
      LOCAL_TOKEN = data.token;
      localStorage.setItem("MONI_LOCAL_TOKEN", LOCAL_TOKEN);
      return;
    }
  } catch (e) {
    console.warn("No se pudo obtener el token de sesión automáticamente:", e);
  }

  const savedToken = localStorage.getItem("MONI_LOCAL_TOKEN");
  if (savedToken) {
    LOCAL_TOKEN = savedToken;
  }
}

// Obtener datos desde Express API (con fallback a LocalStorage)
export async function fetchData() {
  let fetchedData = null;
  try {
    const response = await fetch(`${API_BASE}/api/data`, {
      headers: { "X-Local-Token": LOCAL_TOKEN }
    });
    if (response.status === 401) {
      console.warn("Token local incorrecto o expirado.");
      localStorage.removeItem("MONI_LOCAL_TOKEN");

      // v6: modal propio en lugar de prompt() nativo
      const { showInputModal } = await import('./ui/components.js');
      const userToken = await showInputModal({
        title: "Acceso Protegido",
        message: "Ingresa el Token de Acceso Local de tu servidor para ver tus finanzas (aparece en la consola del servidor al arrancar).",
        placeholder: "Token de acceso",
        confirmText: "Conectar",
        type: "password"
      });
      if (userToken) {
        LOCAL_TOKEN = userToken;
        localStorage.setItem("MONI_LOCAL_TOKEN", LOCAL_TOKEN);
        return fetchData(); // Reintentar con el nuevo token
      } else {
        isLocalStorageMode = true;
      }
    } else if (!response.ok) {
      throw new Error("Error al consultar la API: " + response.statusText);
    } else {
      fetchedData = await response.json();
      isLocalStorageMode = false;
    }
  } catch (error) {
    console.warn("Error al conectar con el servidor, activando modo LocalStorage:", error);
    isLocalStorageMode = true;
  }

  if (isLocalStorageMode) {
    const localSaved = localStorage.getItem("MONI_STATE");
    if (localSaved) {
      try {
        fetchedData = JSON.parse(localSaved);
      } catch (parseErr) {
        console.error("Error al parsear MONI_STATE de localStorage:", parseErr);
      }
    }
    
    if (!fetchedData) {
      fetchedData = getCleanDefaultState();
    }
  }

  // Sincronizar estado global
  updateState(fetchedData);

  console.log("Datos sincronizados: OK — Modo:", isLocalStorageMode ? "LocalStorage" : "Servidor API", "—", state.transacciones.length, "transacciones.");
  
  updateUI();
}

// Inicializa un estado por defecto si no hay base de datos local
export function getCleanDefaultState() {
  return {
    cuentas: [
      { id: 1, nombre: "Efectivo", titular: "Yo", tipo: "Debito" }
    ],
    tarjetas: [],
    transacciones: [],
    presupuestos: [],
    metas: [],
    recordatorios: [],
    categorias: { ...DEFAULT_CATEGORY_STYLES },
    configuracion: {
      nombre_usuario: "Usuario",
      moneda: "S/.",
      formato_fecha: "DD/MM/YYYY",
      tipo_cambio_usd: 3.80
    },
    trabajos_pendientes: []
  };
}

// Enviar datos actualizados al Servidor o guardar en LocalStorage
export async function saveState() {
  state.categorias = CATEGORY_STYLES;

  if (isLocalStorageMode) {
    localStorage.setItem("MONI_STATE", JSON.stringify(state));
    console.log("Datos guardados en localStorage");
    updateUI();
    return;
  }

  const payload = { ...state };
  delete payload.transacciones; // las transacciones se guardan por sus propios endpoints

  try {
    const response = await fetch(`${API_BASE}/api/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Local-Token': LOCAL_TOKEN
      },
      body: JSON.stringify(payload)
    });
    if (response.status === 401) {
      console.warn("Token local incorrecto o expirado al guardar.");
      localStorage.removeItem("MONI_LOCAL_TOKEN");
      import('./ui/components.js').then(({ showToast }) => {
        showToast("Acceso Denegado", "Token de Acceso Local expirado o inválido. Recargando...", "error");
        setTimeout(() => window.location.reload(), 1500);
      });
      return;
    }
    if (!response.ok) throw new Error("Error al guardar en la API: " + response.statusText);
    console.log("Datos guardados en datos.json");
  } catch (error) {
    console.error("Error al guardar datos, intentando fallback a localStorage:", error);
    localStorage.setItem("MONI_STATE", JSON.stringify(state));
    
    // Importamos dinámicamente showToast para evitar dependencias circulares directas si es necesario
    import('./ui/components.js').then(({ showToast }) => {
      showToast("Error de conexión", "Los cambios se guardaron temporalmente en el navegador.", "warning");
    });
    return;
  }
  
  updateUI();
}

// Endpoints dedicados de transacciones (la tabla en Supabase, no el blob)
async function txApi(url, method, body) {
  const r = await fetch(`${API_BASE}${url}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Local-Token': LOCAL_TOKEN },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error('Error de red al guardar la transacción');
  return await r.json();
}
export async function apiAddTransaccion(tx)      { return (await txApi('/api/transaccion', 'POST', tx)).data; }
export async function apiAddPar(gasto, ingreso)  { return (await txApi('/api/transaccion/par', 'POST', { gasto, ingreso })).data; }
export async function apiUpdateTransaccion(id, f){ return (await txApi(`/api/transaccion/${id}`, 'PUT', f)).data; }
export async function apiDeleteTransaccion(id, transferId) { const q = transferId ? `?transfer_id=${transferId}` : ''; return txApi(`/api/transaccion/${id}${q}`, 'DELETE'); }

export function generateUniqueId() {
  const allIds = [
    ...state.transacciones,
    ...(state.recordatorios || []),
    ...(state.metas || []),
    ...(state.presupuestos || []),
    ...(state.trabajos_pendientes || [])
  ].map(e => parseInt(e.id) || 0);

  if (allIds.length === 0) return 1;
  return Math.max(...allIds) + 1;
}
