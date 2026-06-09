// Cliente de IA (Gemini/Kimi) y Motor NLP Local de Moni

import { 
  state, 
  API_BASE, 
  LOCAL_TOKEN, 
  saveState, 
  isLocalStorageMode, 
  generateUniqueId 
} from '../state.js';
import { 
  formatNumber, 
  formatDateStr, 
  getCurrentMonthString, 
  calculateBalances, 
  addOneMonth 
} from '../calculations.js';
import { 
  showToast, 
  safeCreateIcons, 
  escapeHTML 
} from '../ui/components.js';
import { getSystemPrompt } from './prompt.js';

// Estado de la Barra de Comando
export const commandPaletteState = {
  isOpen: false,
  activeSuggestionIndex: -1,
  suggestions: [],
  parsedLocal: null
};

// Historial de conversación activo en la barra de comandos
export let commandChatHistory = [];

export function clearCommandChatHistory() {
  commandChatHistory = [];
}

// Sugerencias por defecto
export const DEFAULT_SUGGESTIONS = [
  { text: "gasto 25 en comida con BCP", type: "GASTO", icon: "trending-down", desc: "Registrar un gasto rápido" },
  { text: "ingreso 1200 de sueldo en Interbank", type: "INGRESO", icon: "trending-up", desc: "Registrar un ingreso rápido" },
  { text: "transferir 150 de BCP Jano a BCP Andrea", type: "TRANSFERENCIA", icon: "repeat", desc: "Transferir dinero entre cuentas" },
  { text: "pagar recordatorio", type: "RECORDATORIO", icon: "bell", desc: "Pagar un recibo o tarjeta pendiente" },
  { text: "cobrar trabajo freelance", type: "COBRAR", icon: "clock", desc: "Registrar cobro de trabajo realizado" },
  { text: "ahorrar 100 para mi meta", type: "AHORRO", icon: "piggy-bank", desc: "Aportar saldo a una meta de ahorro" },
  { text: "buscar taxi", type: "BUSCAR", icon: "search", desc: "Buscar en tu historial" },
  { text: "ir a presupuestos", type: "NAVEGAR", icon: "navigation", desc: "Navegar por las secciones de la app" }
];

// Inicializar la configuración de la clave de Gemini en Ajustes
export function initGeminiConfig() {
  const geminiInput = document.getElementById("conf-gemini-key");
  const saveBtn = document.getElementById("btn-save-gemini-key");
  const toggleVisibilityBtn = document.getElementById("btn-toggle-key-visibility");

  if (!geminiInput || !saveBtn) return;

  // Cargar clave existente de localStorage
  const savedKey = localStorage.getItem("MONI_GEMINI_API_KEY");
  if (savedKey) {
    geminiInput.value = savedKey;
    saveBtn.innerText = "Desactivar / Guardar Nueva Clave";
    saveBtn.classList.remove("btn-primary");
    saveBtn.classList.add("btn-secondary");
    const isKimi = savedKey.startsWith("sk-");
    updateAIStatusBadge(true, isKimi);
  } else {
    updateAIStatusBadge(false);
  }

  // Guardar clave
  saveBtn.addEventListener("click", () => {
    const key = geminiInput.value.trim();
    if (key) {
      localStorage.setItem("MONI_GEMINI_API_KEY", key);
      const isKimi = key.startsWith("sk-");
      showToast("Moni Asistente Activo", `Conexión híbrida con ${isKimi ? 'Kimi IA' : 'Gemini'} establecida de forma segura.`, "success");
      saveBtn.innerText = "Desactivar / Guardar Nueva Clave";
      saveBtn.classList.remove("btn-primary");
      saveBtn.classList.add("btn-secondary");
      updateAIStatusBadge(true, isKimi);
    } else {
      localStorage.removeItem("MONI_GEMINI_API_KEY");
      showToast("Moni Asistente Desactivado", "Se usará el motor de procesamiento local en adelante.", "info");
      saveBtn.innerText = "Activar Moni Asistente IA";
      saveBtn.classList.remove("btn-secondary");
      saveBtn.classList.add("btn-primary");
      updateAIStatusBadge(false);
    }
  });

  // Mostrar / Ocultar clave
  if (toggleVisibilityBtn) {
    toggleVisibilityBtn.addEventListener("click", () => {
      const isHidden = geminiInput.style.webkitTextSecurity === "disc" || geminiInput.style.webkitTextSecurity === "";
      geminiInput.style.webkitTextSecurity = isHidden ? "none" : "disc";
      geminiInput.style.textSecurity = isHidden ? "none" : "disc";
      toggleVisibilityBtn.innerHTML = isHidden 
        ? '<i data-lucide="eye-off" style="width:16px; height:16px;"></i>' 
        : '<i data-lucide="eye" style="width:16px; height:16px;"></i>';
      safeCreateIcons();
    });
  }
}

export function updateAIStatusBadge(active, isKimi = false) {
  const badge = document.getElementById("ai-status-badge");
  if (!badge) return;
  if (active) {
    badge.className = "ai-status-badge active";
    badge.innerHTML = isKimi ? '🤖 Kimi IA' : '🤖 Gemini';
  } else {
    badge.className = "ai-status-badge inactive";
    badge.innerHTML = '⚡ Local';
  }
}

// Configurar el Command Palette
export function setupCommandPalette() {
  const palette = document.getElementById("command-palette");
  const overlay = document.getElementById("command-overlay");
  const input = document.getElementById("command-input");
  const trigger = document.getElementById("sidebar-trigger-command");
  const clearChatBtn = document.getElementById("btn-clear-chat");

  if (!palette || !input) return;

  let activeRecognition = null;

  // Configurar micrófono / reconocimiento de voz
  const micBtn = document.getElementById("command-mic-btn");
  if (micBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = "none";
    } else {
      const recognition = new SpeechRecognition();
      recognition.lang = "es-PE";
      recognition.continuous = false; // Detener después de la primera frase corta
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      let isListening = false;
      activeRecognition = recognition;

      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add("listening");
        input.placeholder = "Escuchando... habla ahora";
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        
        // Simular evento input para refrescar NLP
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        showToast("Audio Procesado", `Entendido: "${transcript}"`, "success");
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          showToast("Micrófono desactivado", "Permite el acceso al micrófono en la barra de direcciones.", "error");
        } else if (event.error !== 'aborted') {
          showToast("Error de audio", "No se pudo procesar la voz. Inténtalo de nuevo.", "error");
        }
      };

      recognition.onend = () => {
        isListening = false;
        micBtn.classList.remove("listening");
        input.placeholder = "Escribe un comando o haz una pregunta... (Ej: 'gasto 50 en comida')";
      };

      micBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isListening) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch (err) {
            console.error(err);
          }
        }
      });
    }
  }

  // Abrir barra de comandos
  const openPalette = () => {
    palette.style.display = "flex";
    input.value = "";
    input.focus();
    commandPaletteState.isOpen = true;
    commandPaletteState.activeSuggestionIndex = -1;
    clearCommandChatHistory();
    document.getElementById("command-chat-body").innerHTML = "";
    document.getElementById("command-preview-panel").style.display = "none";
    document.getElementById("command-chat-response").style.display = "none";
    
    // Validar status de la llave
    const savedKey = localStorage.getItem("MONI_GEMINI_API_KEY");
    const hasKey = !!savedKey;
    const isKimi = hasKey && savedKey.startsWith("sk-");
    updateAIStatusBadge(hasKey, isKimi);
    
    renderSuggestions(DEFAULT_SUGGESTIONS);
    document.body.style.overflow = "hidden"; // Detener scroll en body
  };

  // Cerrar barra de comandos
  const closePalette = () => {
    palette.style.display = "none";
    commandPaletteState.isOpen = false;
    clearCommandChatHistory();
    document.getElementById("command-chat-body").innerHTML = "";
    document.body.style.overflow = ""; // Reactivar scroll
    if (activeRecognition) {
      try {
        activeRecognition.stop();
      } catch (err) {}
    }
  };

  // Triggers de Apertura
  if (trigger) trigger.addEventListener("click", openPalette);

  window.addEventListener("keydown", (e) => {
    const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    
    if (isCmdK) {
      e.preventDefault();
      if (commandPaletteState.isOpen) {
        closePalette();
      } else {
        openPalette();
      }
    }

    if (e.key === "Escape" && commandPaletteState.isOpen) {
      closePalette();
    }
  });

  // Clic fuera del modal
  if (overlay) overlay.addEventListener("click", closePalette);

  // Limpiar panel de respuestas conversacionales
  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      document.getElementById("command-chat-response").style.display = "none";
      document.getElementById("command-chat-body").innerHTML = "";
      clearCommandChatHistory();
    });
  }

  // Evento Input: Analizador NLP Local de 0ms
  input.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (!val) {
      document.getElementById("command-preview-panel").style.display = "none";
      renderSuggestions(DEFAULT_SUGGESTIONS);
      return;
    }

    // Ejecutar Motor Local
    const parsed = parseCommandLocal(val);
    commandPaletteState.parsedLocal = parsed;

    // Renderizar Previsualización y Sugerencias de Autocompletado dinámicas
    renderLocalPreview(parsed);
    renderDynamicSuggestions(val, parsed);
  });

  // Manejo de teclas: Enter y Flechas arriba/abajo en el Input
  input.addEventListener("keydown", (e) => {
    const items = document.querySelectorAll(".command-suggestion-item");
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      commandPaletteState.activeSuggestionIndex = (commandPaletteState.activeSuggestionIndex + 1) % items.length;
      updateSuggestionSelection(items);
    } 
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      commandPaletteState.activeSuggestionIndex = (commandPaletteState.activeSuggestionIndex - 1 + items.length) % items.length;
      updateSuggestionSelection(items);
    } 
    else if (e.key === "Enter") {
      e.preventDefault();
      
      // Si hay una sugerencia seleccionada, rellenar el input en vez de ejecutar
      if (commandPaletteState.activeSuggestionIndex >= 0 && items[commandPaletteState.activeSuggestionIndex]) {
        const textToFill = items[commandPaletteState.activeSuggestionIndex].getAttribute("data-text");
        input.value = textToFill;
        commandPaletteState.activeSuggestionIndex = -1;
        
        // Simular evento input para refrescar NLP
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
      } else {
        // Ejecución directa de la consulta
        executeCommand(input.value.trim());
      }
    }
  });
}

// Renderiza los elementos de sugerencia
export function renderSuggestions(list) {
  const container = document.getElementById("command-suggestions-list");
  if (!container) return;
  container.innerHTML = "";
  commandPaletteState.suggestions = list;
  commandPaletteState.activeSuggestionIndex = -1;

  if (list.length === 0) {
    container.innerHTML = `<div style="padding:15px; font-size:0.85rem;" class="text-muted">Escribe comandos libres de finanzas...</div>`;
    return;
  }

  list.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "command-suggestion-item";
    div.setAttribute("data-text", item.text);
    
    // Mapeo dinámico de iconos
    let iconName = item.icon || "arrow-right";
    if (item.type === "GASTO") iconName = "trending-down";
    if (item.type === "INGRESO") iconName = "trending-up";
    if (item.type === "TRANSFERENCIA") iconName = "repeat";
    if (item.type === "RECORDATORIO") iconName = "bell";
    if (item.type === "COBRAR") iconName = "clock";
    if (item.type === "AHORRO") iconName = "piggy-bank";
    if (item.type === "BUSCAR") iconName = "search";
    if (item.type === "NAVEGAR") iconName = "navigation";

    div.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${escapeHTML(item.text)}</span>
      <span class="command-suggestion-desc">${escapeHTML(item.desc || "")}</span>
    `;
    
    div.addEventListener("click", () => {
      const input = document.getElementById("command-input");
      input.value = item.text;
      input.focus();
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);
    });

    container.appendChild(div);
  });
  
  safeCreateIcons();
}

export function updateSuggestionSelection(items) {
  items.forEach((item, idx) => {
    if (idx === commandPaletteState.activeSuggestionIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });
}

// Renderiza sugerencias contextuales a lo que escribe el usuario
export function renderDynamicSuggestions(val, parsed) {
  const cleanVal = val.toLowerCase();
  
  // Si parece una consulta conversacional/pregunta
  if (parsed.action === "PREGUNTA") {
    const hasKey = localStorage.getItem("MONI_GEMINI_API_KEY");
    if (hasKey) {
      renderSuggestions([
        { text: val, type: "PREGUNTA", icon: "sparkles", desc: "Preguntar a Gemini sobre tus datos" }
      ]);
    } else {
      renderSuggestions([
        { text: "Activar IA en Ajustes", type: "NAVEGAR", icon: "settings", desc: "Añadir API Key de Gemini" }
      ]);
    }
    return;
  }

  // Filtrar sugerencias por coincidencia
  const filtered = DEFAULT_SUGGESTIONS.filter(item => 
    item.text.toLowerCase().includes(cleanVal) || 
    (item.desc && item.desc.toLowerCase().includes(cleanVal)) ||
    (item.type && item.type.toLowerCase().includes(cleanVal))
  );

  // Si no hay coincidencias de comandos existentes pero se está redactando una acción libre
  if (filtered.length === 0 && parsed.action !== "BUSCAR" && parsed.action !== "NAVEGAR") {
    let helpText = "Presiona ENTER para ejecutar";
    if (parsed.confianza < 50) helpText = "Escribe montos y categorías (ej. 'gasto 50 en comida BCP')";
    
    renderSuggestions([
      { text: val, type: parsed.action, icon: "terminal", desc: helpText }
    ]);
  } else {
    renderSuggestions(filtered);
  }
}

// NLP local fallback parser
export function parseCommandLocal(text) {
  const lower = text.toLowerCase().trim();
  
  let res = {
    action: "GASTO",
    monto: null,
    moneda: "S/.",
    cuenta: null,
    tarjeta: null,
    categoria: null,
    fecha: new Date().toISOString().split('T')[0],
    fechaLabel: "hoy",
    descripcion: "",
    confianza: 0
  };

  const esPregunta = (lower.endsWith("?") || 
                     lower.includes("cuanto") || 
                     lower.includes("cual") || 
                     lower.includes("quién") || 
                     lower.includes("saldo") || 
                     lower.includes("balance") || 
                     lower.includes("tengo") || 
                     lower.includes("deuda") || 
                     lower.includes("reporte"));

  if (esPregunta) {
    res.action = "PREGUNTA";
    res.confianza = 80;
    return res;
  }

  if (lower.startsWith("ir a") || lower.startsWith("ver") || lower.startsWith("mostrar") || lower.startsWith("navegar a")) {
    res.action = "NAVEGAR";
    res.confianza = 90;
    return res;
  }

  if (lower.startsWith("buscar") || lower.startsWith("encuentra") || lower.startsWith("filtra")) {
    res.action = "BUSCAR";
    res.confianza = 90;
    return res;
  }

  if (lower.includes("transferir") || lower.includes("transfiere") || lower.includes("traspaso") || lower.includes("pasa") || lower.includes("mover")) {
    res.action = "TRANSFERENCIA";
  } else if (lower.includes("ingreso") || lower.includes("recibi") || lower.includes("deposito") || lower.includes("sueldo") || lower.includes("cobrar") || lower.includes("+")) {
    res.action = "INGRESO";
    
    if (lower.includes("trabajo") || lower.includes("freelance") || lower.includes("factura") || lower.includes("cliente")) {
      res.action = "COBRAR";
    }
  } else if (lower.includes("ahorrar") || lower.includes("ahorra") || lower.includes("aporte") || lower.includes("meta") || lower.includes("piggy")) {
    res.action = "AHORRO";
  } else if (lower.includes("recordatorio") || lower.includes("recibo") || lower.includes("vencimiento") || lower.includes("paga luz") || lower.includes("paga agua") || lower.includes("paga enel") || lower.includes("paga netflix")) {
    res.action = "RECORDATORIO";
  } else {
    res.action = "GASTO";
  }

  const montoRegex = /(?:s\/\.?|us\$|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:soles|usd|dolares|dólares)?/i;
  
  const palabras = lower.split(" ");
  let montoCandidato = null;
  palabras.forEach(pal => {
    const match = pal.match(/^\d+(?:\.\d{1,2})?$/);
    if (match) {
      const num = parseFloat(match[0]);
      if (num !== 2026 && num !== 2025) {
        montoCandidato = num;
      }
    }
  });

  if (montoCandidato !== null) {
    res.monto = montoCandidato;
    res.confianza += 25;
  } else {
    const matchMonto = lower.match(montoRegex);
    if (matchMonto && matchMonto[1]) {
      const num = parseFloat(matchMonto[1]);
      if (num !== 2026 && num !== 2025) {
        res.monto = num;
        res.confianza += 25;
      }
    }
  }

  if (lower.includes("$") || lower.includes("usd") || lower.includes("dolar") || lower.includes("dólares")) {
    res.moneda = "US$";
  }

  const cuentasReales = state.cuentas || [];
  const tarjetasReales = state.tarjetas || [];

  let exactMatchFound = false;
  cuentasReales.forEach(c => {
    const cName = c.nombre.toLowerCase();
    if (lower.includes(cName)) {
      res.cuenta = c;
      res.confianza += 30;
      exactMatchFound = true;
    }
  });

  if (!exactMatchFound) {
    cuentasReales.forEach(c => {
      if ((c.nombre.includes("BCP") && lower.includes("bcp")) || 
          (c.nombre.includes("Interbank") && lower.includes("interbank") && !lower.includes("tarjeta interbank") && !lower.includes("credito interbank"))) {
        res.cuenta = c;
        res.confianza += 20;
      }
    });
  }

  let exactCardMatchFound = false;
  tarjetasReales.forEach(t => {
    const tName = t.nombre.toLowerCase();
    if (lower.includes(tName)) {
      res.tarjeta = t;
      res.confianza += 30;
      exactCardMatchFound = true;
    }
  });

  if (!exactCardMatchFound) {
    tarjetasReales.forEach(t => {
      if ((t.nombre.includes("Falabella") && lower.includes("falabella")) || 
          (t.nombre.includes("CMR") && lower.includes("cmr")) || 
          (t.nombre.includes("Oh") && lower.includes("oh")) || 
          (t.nombre.includes("BBVA") && lower.includes("bbva")) ||
          (t.nombre.includes("Interbank") && (lower.includes("tarjeta interbank") || lower.includes("credito interbank")))) {
        res.tarjeta = t;
        res.confianza += 20;
      }
    });
  }

  if (!res.cuenta && !res.tarjeta) {
    if (lower.includes("tarjeta") || lower.includes("credito")) {
      res.tarjeta = tarjetasReales[0];
    } else if (lower.includes("bcp")) {
      res.cuenta = cuentasReales.find(c => c.nombre.includes("BCP"));
    } else if (lower.includes("interbank")) {
      res.cuenta = cuentasReales.find(c => c.nombre.includes("Interbank"));
    }
  }

  const CATEGORIA_DICCIONARIO = {
    "Comida": ["comida", "almuerzo", "menu", "menú", "restaurante", "cenar", "cena", "desayuno", "burger", "bembos", "kfc", "wong", "metro", "plaza vea", "tambo", "oxxo", "pedidosya", "rappi", "supermercado", "starbucks", "cafe", "ramen"],
    "Transporte": ["transporte", "taxi", "uber", "cabify", "rapido", "bus", "colectivo", "pasaje", "combustible", "gasolina", "grifo", "peaje", "moto", "rides", "dlc rides"],
    "Servicios": ["servicios", "luz", "agua", "internet", "enel", "sedapal", "netflix", "spotify", "apple", "celular", "movistar", "claro", "entel", "suscripcion", "suscripción", "seguro", "desgravamen"],
    "Vivienda": ["vivienda", "alquiler", "renta", "depa", "cuarto", "mantenimiento", "casa"],
    "Educación": ["educación", "educacion", "colegio", "universidad", "taller", "curso", "libro", "clase", "ceramica", "cerámica", "tutor", "mensualidad"],
    "Entretenimiento": ["entretenimiento", "cine", "party", "fiesta", "bar", "concierto", "juego", "steam", "playstation", "discoteca", "cerveza", "diversion"],
    "Sueldo": ["sueldo", "planilla", "sueldazo", "remuneracion", "quincena", "pago mensual"],
    "Pago Tarjeta": ["pago tarjeta", "pago de tarjeta", "saldar tarjeta", "paga tarjeta"],
    "Transferencia": ["transferencia", "traspaso", "envio", "yape", "plin"],
    "Ahorro": ["ahorro", "alcancia", "guardar", "meta", "aportar"]
  };

  Object.keys(CATEGORIA_DICCIONARIO).forEach(cat => {
    const sinonimos = CATEGORIA_DICCIONARIO[cat];
    sinonimos.forEach(sin => {
      if (lower.includes(sin)) {
        res.categoria = cat;
        res.confianza += 25;
      }
    });
  });

  if (!res.categoria) {
    if (res.action === "INGRESO" && lower.includes("sueldo")) {
      res.categoria = "Sueldo";
    } else if (res.action === "TRANSFERENCIA") {
      res.categoria = "Transferencia";
    } else if (res.action === "AHORRO") {
      res.categoria = "Ahorro";
    } else {
      res.categoria = "Otros";
    }
  }

  if (lower.includes("ayer")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    res.fecha = d.toISOString().split('T')[0];
    res.fechaLabel = "ayer";
  } else if (lower.includes("anteayer")) {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    res.fecha = d.toISOString().split('T')[0];
    res.fechaLabel = "anteayer";
  } else {
    res.fecha = new Date().toISOString().split('T')[0];
    res.fechaLabel = "hoy";
  }

  let descWords = palabras.filter(word => {
    const wordLower = word.toLowerCase();
    const isMonto = word.match(/^\d+(?:\.\d{1,2})?$/);
    const isSkipWord = ["gasto", "ingreso", "de", "en", "con", "soles", "dolares", "usd", "hoy", "ayer", "con", "mi", "cuenta", "tarjeta", "bcp", "interbank", "bbva", "falabella", "cmr", "para", "la"].includes(wordLower);
    return !isMonto && !isSkipWord;
  });

  res.descripcion = descWords.join(" ");
  if (!res.descripcion) {
    res.descripcion = res.action === "GASTO" ? `Gasto en ${res.categoria}` : `Ingreso en ${res.categoria}`;
  }
  
  res.descripcion = res.descripcion.charAt(0).toUpperCase() + res.descripcion.slice(1);

  return res;
}

// Render local preview block
export function renderLocalPreview(parsed) {
  const panel = document.getElementById("command-preview-panel");
  const content = document.getElementById("command-preview-content");
  
  if (!panel || !content) return;

  if (parsed.action === "PREGUNTA") {
    panel.style.display = "flex";
    content.innerHTML = `💬 <strong style="color:var(--color-indigo); margin-left:5px;">Hacer pregunta conversacional:</strong> Gemini analizará tus finanzas para responderte.`;
    return;
  }

  if (parsed.action === "NAVEGAR") {
    panel.style.display = "flex";
    content.innerHTML = `🧭 <strong style="color:var(--color-blue); margin-left:5px;">Navegar:</strong> Redirige a una vista del panel principal.`;
    return;
  }

  if (parsed.action === "BUSCAR") {
    panel.style.display = "flex";
    content.innerHTML = `🔍 <strong style="color:var(--color-blue); margin-left:5px;">Buscar:</strong> Filtra las transacciones históricas en la tabla.`;
    return;
  }

  if (!parsed.monto) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "flex";
  
  const formattedMonto = `${parsed.moneda} ${formatNumber(parsed.monto)}`;
  const actionName = parsed.action === "GASTO" ? "Gasto" : "Ingreso";
  const badgeMontoClass = parsed.action === "GASTO" ? "gasto" : "ingreso";

  let originName = "N/A";
  if (parsed.cuenta) originName = parsed.cuenta.nombre;
  if (parsed.tarjeta) originName = parsed.tarjeta.nombre;
  originName = escapeHTML(originName);

  let detailHtml = "";
  if (parsed.action === "TRANSFERENCIA") {
    detailHtml = `
      🔄 Registrar <span class="entity-badge badge-amount transfer">Transferencia</span> 
      de <span class="entity-badge badge-amount">${formattedMonto}</span> 
      entre cuentas.
    `;
  } else if (parsed.action === "RECORDATORIO") {
    detailHtml = `
      🔔 Registrar <span class="entity-badge badge-amount gasto">Pago</span> 
      de recordatorio de <span class="entity-badge badge-amount">${formattedMonto}</span> 
      de la cuenta <span class="entity-badge badge-account">${originName}</span>.
    `;
  } else if (parsed.action === "COBRAR") {
    detailHtml = `
      💰 Registrar <span class="entity-badge badge-amount ingreso">Cobro Freelance</span> 
      de <span class="entity-badge badge-amount">${formattedMonto}</span> 
      en la cuenta <span class="entity-badge badge-account">${originName}</span>.
    `;
  } else if (parsed.action === "AHORRO") {
    detailHtml = `
      🐷 Registrar <span class="entity-badge badge-amount transfer">Ahorro</span> 
      de <span class="entity-badge badge-amount">${formattedMonto}</span> 
      aportado de la cuenta <span class="entity-badge badge-account">${originName}</span>.
    `;
  } else {
    detailHtml = `
      🚀 Registrar <span class="entity-badge badge-amount ${badgeMontoClass}">${actionName}</span> 
      de <span class="entity-badge badge-amount ${badgeMontoClass}">${formattedMonto}</span> 
      en <span class="entity-badge badge-category">${parsed.categoria}</span> 
      usando <span class="entity-badge badge-account">${originName}</span> 
      el día <span class="entity-badge badge-date">${parsed.fechaLabel}</span>.
    `;
  }

  content.innerHTML = detailHtml;
}

// Ejecutar comando híbrido
export async function executeCommand(commandText) {
  if (!commandText) return;

  const parsed = commandPaletteState.parsedLocal || parseCommandLocal(commandText);
  const apiKey = localStorage.getItem("MONI_GEMINI_API_KEY");
  const input = document.getElementById("command-input");
  const terminalIcon = document.getElementById("command-terminal-icon");

  // A) NAVEGACIÓN LOCAL RÁPIDA
  if (parsed.action === "NAVEGAR") {
    const lower = commandText.toLowerCase();
    let targetView = "view-resumen";
    let textStr = "Resumen";

    if (lower.includes("transaccion") || lower.includes("historial") || lower.includes("tabla")) {
      targetView = "view-transacciones";
      textStr = "Transacciones";
    } else if (lower.includes("presupuesto") || lower.includes("limite")) {
      targetView = "view-presupuestos";
      textStr = "Presupuestos";
    } else if (lower.includes("recordatorio") || lower.includes("pago") || lower.includes("vencimiento")) {
      targetView = "view-recordatorios";
      textStr = "Recordatorios";
    } else if (lower.includes("ahorro") || lower.includes("meta")) {
      targetView = "view-ahorros";
      textStr = "Metas de Ahorro";
    } else if (lower.includes("cobrar") || lower.includes("freelance") || lower.includes("pendiente")) {
      targetView = "view-por-cobrar";
      textStr = "Por Cobrar";
    } else if (lower.includes("ajuste") || lower.includes("configuracion")) {
      targetView = "view-configuracion";
      textStr = "Ajustes";
    }

    // Cambiar de vista en la UI SPA
    document.querySelectorAll(".menu-item").forEach(item => {
      if (item.getAttribute("data-target") === targetView) {
        item.click();
      }
    });

    showToast("Navegación", `Redirigido a la vista de ${textStr}.`, "info");
    document.getElementById("command-palette").style.display = "none";
    document.body.style.overflow = "";
    return;
  }

  // B) BÚSQUEDA LOCAL RÁPIDA
  if (parsed.action === "BUSCAR") {
    const query = commandText.replace(/buscar|encuentra|filtra/gi, "").trim();
    
    // Redirigir a transacciones
    document.querySelectorAll(".menu-item").forEach(item => {
      if (item.getAttribute("data-target") === "view-transacciones") {
        item.click();
      }
    });

    // Inyectar en input de búsqueda
    const searchInput = document.getElementById("tx-search");
    if (searchInput) {
      searchInput.value = query;
      const event = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(event);
    }

    showToast("Búsqueda", `Buscando "${query}" en transacciones.`, "info");
    document.getElementById("command-palette").style.display = "none";
    document.body.style.overflow = "";
    return;
  }

  // C) CONSULTAS CONVERSACIONALES O COMANDOS AMBIGUOS (Llamar a Gemini backend)
  const esConversacional = parsed.action === "PREGUNTA" || !parsed.monto || parsed.confianza < 50;

  if (apiKey && esConversacional) {
    if (terminalIcon) {
      terminalIcon.setAttribute("data-lucide", "sparkles");
      terminalIcon.classList.add("loading");
      safeCreateIcons();
    }
    input.disabled = true;

    // Calcular saldos actuales en tiempo real para inyectarlos en cuentas y tarjetas
    const balances = calculateBalances(state);

    // Optimización de Gemini/Kimi Payload: Solo enviar transacciones de los últimos 6 meses (mes actual + 5 anteriores)
    const todayForCutoff = new Date();
    const cutoffDate = new Date(todayForCutoff.getFullYear(), todayForCutoff.getMonth() - 5, 1);
    const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;

    const enrichedState = {
      ...state,
      cuentas: state.cuentas.map(c => ({
        ...c,
        saldo: balances.saldosCuentas[c.id] || 0
      })),
      tarjetas: state.tarjetas.map(t => ({
        ...t,
        deuda: balances.deudasTarjetas[t.id] || 0
      })),
      transacciones: state.transacciones.filter(tx => tx.fecha >= cutoffStr),
      totales: {
        balanceGeneral: balances.balanceGeneral,
        ingresosMes: balances.ingresosMes,
        egresosMes: balances.egresosMes
      }
    };

    let parsedAI = null;
    try {
      if (isLocalStorageMode) {
        const isKimi = apiKey && apiKey.startsWith("sk-");
        if (isKimi) {
          showToast("Proveedor no soportado", "En modo sin servidor (LocalStorage) solo se soporta la API de Gemini (Google). Las claves de Kimi (Moonshot) requieren el servidor backend activo debido a restricciones de seguridad CORS del navegador.", "error");
          
          if (terminalIcon) {
            terminalIcon.setAttribute("data-lucide", "sparkles");
            terminalIcon.classList.remove("loading");
            safeCreateIcons();
          }
          input.disabled = false;
          input.focus();
          return;
        }

        const userName = state.configuracion?.nombre_usuario || "Jano";
        const systemPrompt = getSystemPrompt(enrichedState);

        // LLAMADA DIRECTA A GEMINI DESDE EL NAVEGADOR
        const contents = [
          ...(commandChatHistory || []).map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          })),
          {
            role: 'user',
            parts: [{ text: `INSTRUCCIÓN DE ${userName.toUpperCase()}: "${commandText}"` }]
          }
        ];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: contents,
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Error de la API de la IA: ${response.statusText}. Detalle: ${errorText}`);
        }

        const data = await response.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!replyText) {
          throw new Error("La IA devolvió una respuesta vacía.");
        }

        let cleanJsonStr = replyText.trim();
        if (cleanJsonStr.startsWith("```")) {
          cleanJsonStr = cleanJsonStr.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        parsedAI = JSON.parse(cleanJsonStr);
      } else {
        // MODO SERVIDOR (PROXY NORMAL)
        const response = await fetch(`${API_BASE}/api/command`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "X-Local-Token": LOCAL_TOKEN
          },
          body: JSON.stringify({
            command: commandText,
            state: enrichedState,
            history: commandChatHistory
          })
        });

        if (!response.ok) throw new Error("Error del servidor Express: " + response.statusText);

        parsedAI = await response.json();
      }
      
      // Procesar respuesta según sea consulta o acción estructurada
      if (parsedAI.type === "query") {
        const chatPanel = document.getElementById("command-chat-response");
        const chatBody = document.getElementById("command-chat-body");
        
        chatPanel.style.display = "flex";
        
        let htmlResponse = escapeHTML(parsedAI.response)
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>')
          .replace(/- (.*?)(?:<br>|$)/g, '<li>$1</li>');
        
        commandChatHistory.push({ role: "user", content: commandText });
        commandChatHistory.push({ role: "model", content: parsedAI.response });
        if (commandChatHistory.length > 10) {
          commandChatHistory.splice(0, commandChatHistory.length - 10);
        }

        const isFirstMessage = chatBody.innerHTML.trim() === "";
        const divider = isFirstMessage ? "" : "<hr style='margin: 18px 0; border: 0; border-top: 1px solid var(--border-color); opacity: 0.5;'>";
        
        const turnHtml = `
          ${divider}
          <div style="font-size: 0.78em; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Pregunta: ${escapeHTML(commandText)}</div>
          <div style="color: var(--text-main); font-size: 0.94em;">${htmlResponse}</div>
        `;
        
        chatBody.insertAdjacentHTML('beforeend', turnHtml);
        chatBody.scrollTop = chatBody.scrollHeight;
        
        showToast("Moni Asistente", "Consulta resuelta con éxito.", "success");
        
        input.value = "";
        commandPaletteState.parsedLocal = null;
        document.getElementById("command-preview-panel").style.display = "none";
        renderSuggestions(DEFAULT_SUGGESTIONS);
      } 
      else if (parsedAI.type === "action") {
        executeParsedAction(parsedAI.actionType, parsedAI.data, parsedAI.response);
        document.getElementById("command-palette").style.display = "none";
        document.body.style.overflow = "";
      }

    } catch (error) {
      console.error("Error al procesar comando con la IA:", error);
      const isKimi = apiKey && apiKey.startsWith("sk-");
      showToast("Error de conexión", `No se pudo comunicar con la API de ${isKimi ? 'Kimi IA' : 'Gemini'}. Verifica tu llave en Ajustes.`, "error");
    } finally {
      if (terminalIcon) {
        terminalIcon.setAttribute("data-lucide", "sparkles");
        terminalIcon.classList.remove("loading");
        safeCreateIcons();
      }
      input.disabled = false;
      input.focus();
    }
  } 
  
  // D) EJECUCIÓN DIRECTA LOCAL
  else {
    if (!parsed.monto) {
      showToast("Sintaxis incompleta", "Introduce un monto numérico para registrar un movimiento (ej. 'gasto 50')", "error");
      return;
    }

    let originId = parsed.cuenta ? parsed.cuenta.id : null;
    let cardId = parsed.tarjeta ? parsed.tarjeta.id : null;
    
    if (!originId && !cardId) {
      if (state.cuentas && state.cuentas.length > 0) {
        originId = state.cuentas[0].id;
        parsed.cuenta = state.cuentas[0];
      }
    }

    if (parsed.action === "TRANSFERENCIA") {
      // BUG-05: respetar la cuenta de origen detectada y parsear "de X a Y" completo
      const lowerCmd = commandText.toLowerCase();
      let orig = parsed.cuenta ? parsed.cuenta.id : null;
      let dest = null;

      // Intentar extraer "de <origen> a <destino>" con frases completas
      const matchDeA = lowerCmd.match(/\bde\s+(.+?)\s+a\s+(.+)$/);
      if (matchDeA) {
        const origStr = matchDeA[1].trim();
        const destStr = matchDeA[2].trim();
        const findCta = (str) => state.cuentas.find(c => {
          const n = c.nombre.toLowerCase();
          return str.includes(n) || n.includes(str);
        });
        const oMatch = findCta(origStr);
        const dMatch = findCta(destStr);
        if (oMatch) orig = oMatch.id;
        if (dMatch) dest = dMatch.id;
      } else {
        // Solo destino: "transferir 100 a interbank"
        const matchA = lowerCmd.match(/\ba\s+(.+)$/);
        if (matchA) {
          const dMatch = state.cuentas.find(c => matchA[1].trim().includes(c.nombre.toLowerCase()) || c.nombre.toLowerCase().includes(matchA[1].trim()));
          if (dMatch) dest = dMatch.id;
        }
      }

      if (!orig) orig = state.cuentas[0]?.id;
      if (!dest) dest = state.cuentas.find(c => c.id !== orig)?.id;

      if (!orig || !dest || orig === dest) {
        showToast("Transferencia ambigua", "No pude identificar cuentas de origen y destino distintas. Especifica: 'transferir 100 de <cuenta> a <cuenta>'.", "error");
        return;
      }

      executeParsedAction("transfer", {
        fecha: parsed.fecha,
        monto: parsed.monto,
        origen_id: orig,
        destino_id: dest,
        descripcion: parsed.descripcion || "Transferencia rápida"
      }, `🔄 Transferencia registrada de S/. ${parsed.monto.toFixed(2)}.`);
    } 
    else if (parsed.action === "RECORDATORIO") {
      const remMatch = state.recordatorios.find(r => 
        commandText.toLowerCase().includes(r.nombre.toLowerCase()) && r.estado === "Pendiente"
      );

      if (remMatch) {
        executeParsedAction("pay_reminder", {
          reminder_id: remMatch.id,
          monto_real: parsed.monto || remMatch.monto,
          cuenta_id: originId || 1
        }, `✅ Pago de recordatorio ${remMatch.nombre} registrado.`);
      } else {
        executeParsedAction("transaction", {
          tipo: "GASTO",
          fecha: parsed.fecha,
          monto: parsed.monto,
          categoria: "Servicios",
          descripcion: parsed.descripcion || "Pago de recibo",
          cuenta_id: originId,
          tarjeta_id: cardId,
          fijo: "Variable"
        }, `💸 Gasto de servicios registrado por S/. ${parsed.monto.toFixed(2)}.`);
      }
    } 
    else if (parsed.action === "COBRAR") {
      const jobMatch = state.trabajos_pendientes.find(j => 
        commandText.toLowerCase().includes(j.cliente.toLowerCase()) && j.estado === "Pendiente"
      );

      if (jobMatch) {
        executeParsedAction("collect_job", {
          job_id: jobMatch.id,
          monto_real: parsed.monto || jobMatch.monto,
          cuenta_id: originId || 1,
          fecha_real: parsed.fecha
        }, `💰 Trabajo de freelance cobrado a ${jobMatch.cliente}.`);
      } else {
        executeParsedAction("transaction", {
          tipo: "INGRESO",
          fecha: parsed.fecha,
          monto: parsed.monto,
          categoria: "Sueldo",
          descripcion: parsed.descripcion || "Cobro Freelance",
          cuenta_id: originId,
          tarjeta_id: null,
          fijo: "Variable"
        }, `💰 Ingreso registrado por S/. ${parsed.monto.toFixed(2)}.`);
      }
    } 
    else if (parsed.action === "AHORRO") {
      const meta = state.metas && state.metas.length > 0 ? state.metas[0] : null;
      if (meta) {
        executeParsedAction("savings_contribution", {
          meta_id: meta.id,
          monto: parsed.monto,
          cuenta_id: originId || 1,
          tipo_operacion: "APORTE"
        }, `🐷 Aporte de S/. ${parsed.monto.toFixed(2)} a meta ${meta.nombre}.`);
      } else {
        showToast("Sin metas de ahorro", "Crea una meta primero en el panel de Metas.", "error");
      }
    } 
    else {
      executeParsedAction("transaction", {
        tipo: parsed.action,
        fecha: parsed.fecha,
        monto: parsed.monto,
        moneda: parsed.moneda,
        categoria: parsed.categoria || "Otros",
        descripcion: parsed.descripcion,
        cuenta_id: originId,
        tarjeta_id: cardId,
        fijo: "Variable"
      }, `🚀 Movimiento registrado con éxito por ${parsed.moneda} ${parsed.monto.toFixed(2)}.`);
    }

    document.getElementById("command-palette").style.display = "none";
    document.body.style.overflow = "";
  }
}

// Ejecutor de acción estructurada
export function executeParsedAction(actionType, data, successMessage) {
  const mon = state.configuracion.moneda || "S/.";

  // A) REGISTRO DE TRANSACCIÓN INDIVIDUAL
  if (actionType === "transaction") {
    let cuentaId = data.cuenta_id ? parseInt(data.cuenta_id) : null;
    let tarjetaId = data.tarjeta_id ? parseInt(data.tarjeta_id) : null;

    // BUG-07: una transacción nunca debe afectar cuenta Y tarjeta a la vez
    // (doble contabilización). Si llegan ambas, prevalece la tarjeta.
    if (cuentaId && tarjetaId) {
      cuentaId = null;
    }

    const nuevaTx = {
      id: generateUniqueId(),
      fecha: data.fecha,
      tipo: data.tipo,
      categoria: data.categoria,
      descripcion: data.descripcion,
      monto: parseFloat(data.monto),
      moneda: data.moneda === "US$" ? "US$" : "S/.",
      cuenta_id: cuentaId,
      tarjeta_id: tarjetaId,
      fijo: data.fijo || "Variable"
    };

    state.transacciones.unshift(nuevaTx);
    saveState();
    showToast("Registro Exitoso", successMessage || `Movimiento de ${mon} ${formatNumber(data.monto)} añadido.`, "success");
  } 

  // B) EJECUTAR TRANSFERENCIA ENTRE CUENTAS
  else if (actionType === "transfer") {
    const monto = parseFloat(data.monto);
    const fecha = data.fecha;
    const cOrig = parseInt(data.origen_id);
    const cDest = parseInt(data.destino_id);
    const desc = data.descripcion || "Transferencia entre cuentas";

    const cOrigNombre = state.cuentas.find(c => c.id === cOrig)?.nombre || "Origen";
    const cDestNombre = state.cuentas.find(c => c.id === cDest)?.nombre || "Destino";

    // v6: ambas piernas comparten transfer_id para editarse/borrarse en par
    const gastoId = generateUniqueId();

    const txGasto = {
      id: gastoId,
      fecha: fecha,
      tipo: "GASTO",
      categoria: "Transferencia",
      descripcion: `${desc} -> ${cDestNombre}`,
      monto: monto,
      cuenta_id: cOrig,
      tarjeta_id: null,
      fijo: "Variable",
      transfer_id: gastoId
    };
    state.transacciones.unshift(txGasto);

    const txIngreso = {
      id: generateUniqueId(),
      fecha: fecha,
      tipo: "INGRESO",
      categoria: "Transferencia",
      descripcion: `${desc} <- ${cOrigNombre}`,
      monto: monto,
      cuenta_id: cDest,
      tarjeta_id: null,
      fijo: "Variable",
      transfer_id: gastoId
    };
    state.transacciones.unshift(txIngreso);
    
    saveState();
    showToast("Transferencia Realizada", successMessage || `Traspasado ${mon} ${formatNumber(monto)} con éxito.`, "success");
  } 

  // C) REGISTRAR PAGO DE RECORDATORIO
  else if (actionType === "pay_reminder") {
    const remId = parseInt(data.reminder_id);
    const monto = parseFloat(data.monto_real);
    const ctaId = parseInt(data.cuenta_id);

    const rem = state.recordatorios.find(r => r.id === remId);
    if (!rem) {
      showToast("Error", "Recordatorio no encontrado.", "error");
      return;
    }

    const esTarjeta = rem.tipo === "Tarjeta";

    // BUG-06: nunca asumir la tarjeta. Si el recordatorio de tarjeta no tiene
    // tarjeta_id asociado, se pide usar el flujo manual (que sí pregunta cuál).
    if (esTarjeta && !rem.tarjeta_id) {
      showToast("Falta la tarjeta", `El recordatorio "${rem.nombre}" no tiene una tarjeta asociada. Págalo desde el botón "Pagar" del panel de recordatorios para elegirla.`, "error");
      return;
    }

    rem.fecha_vencimiento = addOneMonth(rem.fecha_vencimiento);
    rem.estado = "Pendiente";

    const tx = {
      id: generateUniqueId(),
      fecha: new Date().toISOString().substring(0, 10),
      tipo: esTarjeta ? "INGRESO" : "GASTO",
      categoria: esTarjeta ? "Pago Tarjeta" : "Servicios",
      descripcion: esTarjeta ? `Pago de Tarjeta ${rem.nombre}` : `Pago de servicio: ${rem.nombre}`,
      monto: monto,
      cuenta_id: esTarjeta ? null : ctaId,
      tarjeta_id: esTarjeta ? parseInt(rem.tarjeta_id) : null,
      fijo: esTarjeta ? "Variable" : "Fijo"
    };

    if (esTarjeta) {
      const txEspejo = {
        id: generateUniqueId(),
        fecha: tx.fecha,
        tipo: "GASTO",
        categoria: "Pago Tarjeta",
        descripcion: `Pago de Tarjeta ${rem.nombre}`,
        monto: monto,
        cuenta_id: ctaId,
        tarjeta_id: null,
        fijo: "Variable"
      };
      state.transacciones.unshift(txEspejo);
    }

    state.transacciones.unshift(tx);
    saveState();
    showToast("Recordatorio Pagado", successMessage || `Pago de ${rem.nombre} registrado correctamente.`, "success");
  } 

  // D) REGISTRAR COBRO DE TRABAJO FREELANCE
  else if (actionType === "collect_job") {
    const jobId = parseInt(data.job_id);
    const monto = parseFloat(data.monto_real);
    const ctaId = parseInt(data.cuenta_id);
    const fecha = data.fecha_real || new Date().toISOString().substring(0, 10);

    const job = state.trabajos_pendientes.find(j => j.id === jobId);
    if (!job) {
      showToast("Error", "Trabajo freelance no encontrado.", "error");
      return;
    }

    job.estado = "Cobrado";
    job.fecha_cobro = fecha;
    job.cuenta_id = ctaId;

    const tx = {
      id: generateUniqueId(),
      fecha: fecha,
      tipo: "INGRESO",
      categoria: "Sueldo",
      descripcion: `Cobro: ${job.cliente} - ${job.descripcion}`,
      monto: monto,
      cuenta_id: ctaId,
      tarjeta_id: null,
      fijo: "Variable"
    };

    state.transacciones.unshift(tx);
    saveState();
    showToast("Trabajo Cobrado", successMessage || `Cobro de ${job.cliente} procesado con éxito.`, "success");
  } 

  // E) REGISTRAR APORTE A META DE AHORRO
  else if (actionType === "savings_contribution") {
    const metaId = parseInt(data.meta_id);
    const monto = parseFloat(data.monto);
    const ctaId = parseInt(data.cuenta_id);
    const operacion = data.tipo_operacion || "APORTE";

    const meta = state.metas.find(m => m.id === metaId);
    if (!meta) {
      showToast("Error", "Meta de ahorro no encontrada.", "error");
      return;
    }

    if (operacion === "APORTE") {
      meta.actual = parseFloat(meta.actual) + monto;
    } else {
      meta.actual = Math.max(0, parseFloat(meta.actual) - monto);
    }

    const tx = {
      id: generateUniqueId(),
      fecha: new Date().toISOString().substring(0, 10),
      tipo: operacion === "APORTE" ? "GASTO" : "INGRESO",
      categoria: "Ahorro",
      descripcion: operacion === "APORTE" ? `Aporte a meta: ${meta.nombre}` : `Retiro de meta: ${meta.nombre}`,
      monto: monto,
      cuenta_id: ctaId,
      tarjeta_id: null,
      fijo: "Variable"
    };

    state.transacciones.unshift(tx);
    saveState();
    showToast("Meta Actualizada", successMessage || `Meta ${meta.nombre} actualizada correctamente.`, "success");
  }
}
