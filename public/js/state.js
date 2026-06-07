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
  "Comida": { icon: "utensils", color: "#F59E0B", bg: "#FEF3C7" },
  "Transporte": { icon: "car", color: "#3B82F6", bg: "#EFF6FF" },
  "Servicios": { icon: "lightbulb", color: "#EF4444", bg: "#FFF1F2" },
  "Vivienda": { icon: "home", color: "#0D9488", bg: "#F0FDFA" },
  "Educación": { icon: "graduation-cap", color: "#D946EF", bg: "#FDF4FF" },
  "Entretenimiento": { icon: "party-popper", color: "#8B5CF6", bg: "#F5F3FF" },
  "Sueldo": { icon: "banknote", color: "#10B981", bg: "#ECFDF5" },
  "Pago Tarjeta": { icon: "credit-card", color: "#6366F1", bg: "#EEF2FF" },
  "Transferencia": { icon: "repeat", color: "#6B7280", bg: "#F3F4F6" },
  "Ahorro": { icon: "piggy-bank", color: "#EC4899", bg: "#FCE7F3" },
  "Saldo Inicial": { icon: "wallet", color: "#10B981", bg: "#ECFDF5" },
  "Deuda Inicial": { icon: "shield-alert", color: "#EF4444", bg: "#FFF1F2" },
  "Otros": { icon: "help-circle", color: "#6B7280", bg: "#F3F4F6" }
};

export let CATEGORY_STYLES = { ...DEFAULT_CATEGORY_STYLES };

export function updateCategoryStyles(newStyles) {
  Object.keys(CATEGORY_STYLES).forEach(k => delete CATEGORY_STYLES[k]);
  Object.assign(CATEGORY_STYLES, newStyles);
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

export function updateState(newState) {
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, newState);
  if (state.categorias) {
    updateCategoryStyles(state.categorias);
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
      
      const userToken = prompt("Acceso Protegido\n\nIngresa el Token de Acceso Local de tu servidor para ver tus finanzas:");
      if (userToken) {
        LOCAL_TOKEN = userToken.trim();
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

  try {
    const response = await fetch(`${API_BASE}/api/data`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Local-Token': LOCAL_TOKEN
      },
      body: JSON.stringify(state)
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
