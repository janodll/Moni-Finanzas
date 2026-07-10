import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde .env local si existe (para uso local en la Mac)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const firstEqual = trimmed.indexOf('=');
        if (firstEqual !== -1) {
          const key = trimmed.substring(0, firstEqual).trim();
          const val = trimmed.substring(firstEqual + 1).trim().replace(/^['"]|['"]$/g, '');
          if (key) {
            process.env[key] = val;
          }
        }
      }
    });
    console.log("[Entorno] Archivo .env cargado con éxito localmente.");
  } catch (envErr) {
    console.error("[Entorno] Error al leer el archivo .env:", envErr);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = process.env.DATA_FILE_PATH || path.join(__dirname, 'datos.json');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Habilitar trust proxy solo cuando corremos en Render (detrás de su proxy reverso)
if (process.env.RENDER === 'true') {
  app.set('trust proxy', true);
}


app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001']
}));
// Límite ampliado: el estado financiero completo puede superar los 100kb por defecto de Express
app.use(express.json({ limit: '10mb' }));
// v6: 'no-cache' obliga al navegador a revalidar con ETag en cada carga.
// Sin esto, Chrome aplica caché heurística y puede servir JS viejo tras un cambio.
const staticOpts = {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/reportes', express.static(path.join(__dirname, 'reportes'), staticOpts));

// Token local para proteger la API (configurable por variable de entorno).
// SEC-05: Si no se define LOCAL_API_TOKEN, se genera un token aleatorio por arranque.
// El frontend lo obtiene automáticamente vía /api/session-token (solo localhost),
// por lo que en uso local el cambio es transparente. Para despliegues remotos
// (Railway, etc.) definir LOCAL_API_TOKEN como variable de entorno fija.
const LOCAL_TOKEN = process.env.LOCAL_API_TOKEN || crypto.randomUUID();

function requireLocalAuth(req, res, next) {
  const token = req.headers['x-local-token'];
  if (token !== LOCAL_TOKEN) {
    console.warn(`[Seguridad] Intento de acceso no autorizado desde: ${req.ip}`);
    return res.status(401).json({ error: "No autorizado. Token local inválido o ausente." });
  }
  next();
}

// Endpoint para obtener el token de sesión (solo accesible desde localhost)
app.get('/api/session-token', (req, res) => {
  // Si se configuró un token persistente para despliegue remoto, bloquear la obtención automática
  if (process.env.LOCAL_API_TOKEN) {
    return res.status(403).json({ error: "No disponible en producción/modo remoto." });
  }

  const clientIp = req.ip || req.socket.remoteAddress;
  const isLocalhost = 
    clientIp.includes('127.0.0.1') || 
    clientIp.includes('::1') || 
    clientIp.includes('::ffff:127.0.0.1');

  if (!isLocalhost) {
    console.warn(`[Seguridad] Intento de obtener token de sesión de forma remota desde: ${clientIp}`);
    return res.status(403).json({ error: "Solo accesible desde localhost." });
  }
  res.json({ token: LOCAL_TOKEN });
});

// Función auxiliar para guardar datos en el espejo local datos.json de forma segura y atómica
function saveLocalDataSync(newData) {
  try {
    if (fs.existsSync(DATA_FILE)) {
      for (let i = 2; i >= 1; i--) {
        const src = `${DATA_FILE}.backup.${i}`;
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, `${DATA_FILE}.backup.${i + 1}`);
        }
      }
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.backup.1`);
    }
  } catch (backupErr) {
    console.error("Error al rotar copias de seguridad de datos.json:", backupErr);
  }

  const tmpFile = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(newData, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error("Error al escribir en datos.json:", err);
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
    return false;
  }
}

// Función auxiliar para subir el estado completo a Supabase usando un UPSERT (POST) robusto
async function uploadToSupabase(data) {
  if (!data.updated_at) {
    data.updated_at = new Date().toISOString();
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/moni_state`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates' // UPSERT en PostgREST
      },
      body: JSON.stringify({
        id: 1,
        data: data,
        updated_at: data.updated_at
      })
    });
    if (!response.ok) {
      const errTxt = await response.text();
      console.error(`[Supabase] Error al subir datos (${response.status}):`, errTxt);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Excepción al subir datos a la nube:", err);
    return false;
  }
}

// ============================================================================
// FUNCIONES AUXILIARES PARA AUTOMATIZACIÓN Y TELEGRAM
// ============================================================================

// Obtiene el estado financiero más reciente sincronizando Supabase y espejo local
async function getLatestState() {
  let localData = null;
  let localUpdatedAt = new Date(0).toISOString();

  try {
    if (fs.existsSync(DATA_FILE)) {
      const dataStr = fs.readFileSync(DATA_FILE, 'utf8');
      localData = JSON.parse(dataStr);
      localUpdatedAt = localData.updated_at || fs.statSync(DATA_FILE).mtime.toISOString();
    }
  } catch (err) {
    console.error("Error al leer datos.json local en getLatestState:", err);
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/moni_state?select=data,updated_at&id=eq.1`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (response.ok) {
        const json = await response.json();
        if (json && json.length > 0) {
          const cloudData = json[0].data;
          const cloudUpdatedAt = json[0].updated_at || new Date(0).toISOString();

          const localTime = new Date(localUpdatedAt).getTime();
          const cloudTime = new Date(cloudUpdatedAt).getTime();

          if (localTime > cloudTime && localData) {
            await uploadToSupabase(localData);
            return localData;
          } 
          if (cloudTime > localTime) {
            if (!cloudData.updated_at) {
              cloudData.updated_at = cloudUpdatedAt;
            }
            saveLocalDataSync(cloudData);
            return cloudData;
          }
          return cloudData;
        }
      }
    } catch (dbErr) {
      console.error("[Supabase] Error al sincronizar en lectura (getLatestState):", dbErr);
    }
  }

  return localData;
}

// Envía un mensaje de Telegram en formato Markdown al chat del usuario
async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[Telegram] No se configuró TELEGRAM_BOT_TOKEN");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    return res.ok;
  } catch (err) {
    console.error("[Telegram] Error al enviar mensaje:", err);
    return false;
  }
}

// Mapea el texto del banco o método recibido a un cuenta_id o tarjeta_id real
function resolveAccountOrCard(banco_o_metodo, isCreditCard, state) {
  const query = (banco_o_metodo || '').toLowerCase();
  
  if (isCreditCard || query.includes('tarjeta') || query.includes('cmr') || query.includes('falabella')) {
    // Buscar en tarjetas
    for (const t of state.tarjetas || []) {
      const name = t.nombre.toLowerCase();
      if (name.includes(query) || 
          (query.includes('cmr') && name.includes('falabella')) || 
          (query.includes('falabella') && name.includes('cmr')) ||
          (query.includes('bbva') && name.includes('bbva')) ||
          (query.includes('interbank') && name.includes('interbank'))) {
        return { cuenta_id: null, tarjeta_id: t.id };
      }
    }
    // Fallbacks específicos de tarjeta
    if (query.includes('falabella') || query.includes('cmr')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('falabella') || t.nombre.toLowerCase().includes('cmr'));
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
    if (query.includes('bbva')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('bbva'));
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
    if (query.includes('interbank')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('interbank') && t.titular === 'Yo');
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
  } else {
    // Buscar en cuentas (débito)
    for (const c of state.cuentas || []) {
      const name = c.nombre.toLowerCase();
      if (name.includes(query)) {
        return { cuenta_id: c.id, tarjeta_id: null };
      }
    }
    
    // Fallbacks específicos de débito/billeteras
    if (query.includes('yape')) {
      const bcpAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('bcp') && c.titular === 'Yo');
      if (bcpAcc) return { cuenta_id: bcpAcc.id, tarjeta_id: null };
    }
    if (query.includes('plin')) {
      const ibkAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('interbank') && c.titular === 'Yo');
      if (ibkAcc) return { cuenta_id: ibkAcc.id, tarjeta_id: null };
    }
    if (query.includes('bcp')) {
      const bcpAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('bcp') && c.titular === 'Yo');
      if (bcpAcc) return { cuenta_id: bcpAcc.id, tarjeta_id: null };
    }
    if (query.includes('interbank')) {
      const ibkAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('interbank') && c.titular === 'Yo');
      if (ibkAcc) return { cuenta_id: ibkAcc.id, tarjeta_id: null };
    }
  }
  return { cuenta_id: null, tarjeta_id: null };
}

// Suma un mes a un string de fecha YYYY-MM-DD
function addOneMonth(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().substring(0, 10);
}

// Ejecuta la modificación correspondiente sobre el estado en el backend (duplica lógica de cliente)
function executeActionOnState(actionType, data, state) {
  const generateUniqueId = () => {
    const allIds = [
      ...(state.transacciones || []).map(t => t.id || 0),
      ...(state.recordatorios || []).map(r => r.id || 0),
      ...(state.metas || []).map(m => m.id || 0),
      ...(state.trabajos_pendientes || []).map(j => j.id || 0)
    ];
    return Math.max(...allIds, 0) + 1;
  };

  if (actionType === 'transaction') {
    let cuentaId = data.cuenta_id ? parseInt(data.cuenta_id) : null;
    let tarjetaId = data.tarjeta_id ? parseInt(data.tarjeta_id) : null;

    if (cuentaId && tarjetaId) {
      cuentaId = null;
    }

    const nuevaTx = {
      id: generateUniqueId(),
      fecha: data.fecha || new Date().toISOString().substring(0, 10),
      tipo: data.tipo || "GASTO",
      categoria: data.categoria || "Otros",
      descripcion: data.descripcion,
      monto: parseFloat(data.monto),
      moneda: data.moneda === "US$" ? "US$" : "S/.",
      cuenta_id: cuentaId,
      tarjeta_id: tarjetaId,
      fijo: data.fijo || "Variable",
      nro_operacion: data.nro_operacion || null
    };

    state.transacciones = state.transacciones || [];
    state.transacciones.unshift(nuevaTx);
  }
  else if (actionType === 'transfer') {
    const monto = parseFloat(data.monto);
    const fecha = data.fecha || new Date().toISOString().substring(0, 10);
    const cOrig = parseInt(data.origen_id);
    const cDest = parseInt(data.destino_id);
    const desc = data.descripcion || "Transferencia entre cuentas";

    const cOrigNombre = (state.cuentas || []).find(c => c.id === cOrig)?.nombre || "Origen";
    const cDestNombre = (state.cuentas || []).find(c => c.id === cDest)?.nombre || "Destino";

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
    state.transacciones = state.transacciones || [];
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
  }
  else if (actionType === 'pay_reminder') {
    const remId = parseInt(data.reminder_id);
    const monto = parseFloat(data.monto_real);
    const ctaId = parseInt(data.cuenta_id);

    const rem = (state.recordatorios || []).find(r => r.id === remId);
    if (!rem) throw new Error("Recordatorio no encontrado.");

    const esTarjeta = rem.tipo === "Tarjeta";

    if (esTarjeta && !rem.tarjeta_id) {
      throw new Error("El recordatorio no tiene una tarjeta asociada.");
    }

    if (rem.tipo !== "Tarjeta") {
      rem.fecha_vencimiento = addOneMonth(rem.fecha_vencimiento);
      rem.estado = "Pendiente";
    } else {
      rem.estado = "Pagado";
    }

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

    state.transacciones = state.transacciones || [];
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
  }
  else if (actionType === 'collect_job') {
    const jobId = parseInt(data.job_id);
    const monto = parseFloat(data.monto_real);
    const ctaId = parseInt(data.cuenta_id);
    const fecha = data.fecha_real || new Date().toISOString().substring(0, 10);

    const job = (state.trabajos_pendientes || []).find(j => j.id === jobId);
    if (!job) throw new Error("Trabajo freelance no encontrado.");

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

    state.transacciones = state.transacciones || [];
    state.transacciones.unshift(tx);
  }
  else if (actionType === 'savings_contribution') {
    const metaId = parseInt(data.meta_id);
    const monto = parseFloat(data.monto);
    const ctaId = parseInt(data.cuenta_id);
    const operacion = data.tipo_operacion || "APORTE";

    const meta = (state.metas || []).find(m => m.id === metaId);
    if (!meta) throw new Error("Meta de ahorro no encontrada.");

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

    state.transacciones = state.transacciones || [];
    state.transacciones.unshift(tx);
  }
  else if (actionType === 'batch') {
    for (const txData of data.transacciones || []) {
      executeActionOnState('transaction', txData, state);
    }
  }
}

// Procesa una instrucción de voz/texto libre desde Telegram usando Gemini
async function handleTelegramDirectCommand(text, state, chatId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await sendTelegramMessage(chatId, "⚠️ No se configuró GEMINI_API_KEY en el servidor.");
    return;
  }
  const userName = state?.configuracion?.nombre_usuario || "Jano";
  const systemPrompt = getSystemPrompt(state);

  try {
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
        contents: [
          {
            role: 'user',
            parts: [{ text: `INSTRUCCIÓN DE ${userName.toUpperCase()}: "${text}"` }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      await sendTelegramMessage(chatId, "⚠️ Hubo un problema al conectar con Gemini.");
      return;
    }

    const resJson = await response.json();
    let cleanStr = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (cleanStr.startsWith("```")) {
      cleanStr = cleanStr.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    const parsedReply = JSON.parse(cleanStr);
    
    if (parsedReply.type === 'query') {
      await sendTelegramMessage(chatId, parsedReply.response);
    } else if (parsedReply.type === 'action') {
      try {
        executeActionOnState(parsedReply.actionType, parsedReply.data, state);
        state.updated_at = new Date().toISOString();
        
        if (SUPABASE_URL && SUPABASE_KEY) {
          await uploadToSupabase(state);
        }
        saveLocalDataSync(state);
        
        await sendTelegramMessage(chatId, parsedReply.response || "¡Operación realizada con éxito!");
      } catch (execErr) {
        console.error("Error al ejecutar acción desde Telegram:", execErr);
        await sendTelegramMessage(chatId, `⚠️ No pude ejecutar la acción: ${execErr.message}`);
      }
    }
  } catch (err) {
    console.error("Error al procesar comando directo de Telegram:", err);
    await sendTelegramMessage(chatId, "⚠️ Lo siento, ocurrió un error interno al procesar tu mensaje.");
  }
}

// Retorna el systemPrompt inyectando el estado financiero dinámico del usuario
function getSystemPrompt(state) {
  const userName = state?.configuracion?.nombre_usuario || "Jano";
  const today = new Date().toISOString().split('T')[0];
  return `
Eres Moni, el asistente financiero personal con Inteligencia Artificial de ${userName}. Tu objetivo es procesar el texto escrito por ${userName}, interactuar con él de forma inteligente basándote en sus datos financieros reales, y responder en formato JSON estructurado.

ESTADO FINANCIERO ACTUAL DE ${userName.toUpperCase()}:
${JSON.stringify(state, null, 2)}

REGLAS DE PROCESAMIENTO:
1. Determina con total precisión si la instrucción es una PREGUNTA, CONSULTA o PETICIÓN DE INFORMACIÓN (ej. "¿cuánto gasté?", "¿qué deudas me quedan por pagar?", "dime qué deudas tengo pendientes", "busca mis deudas", "¿cómo van mis presupuestos?", "¿qué trabajos freelance tengo?", "¿tengo deudas en dólares?", "¿pagué la luz?", etc.) o si es un COMANDO DE ACCIÓN / REGISTRO para modificar o crear datos.
   *REGLA CRÍTICA:* Si el usuario pregunta "qué deudas me quedan por pagar", "cuánto debo", "qué tengo pendiente", etc., esto es una PREGUNTA/CONSULTA (type: "query") y debes responder en formato conversacional listándole las deudas o recordatorios pendientes reales del ESTADO. NUNCA debes ejecutar una acción ("action") en este caso. Las acciones ("action") solo se deben generar cuando el usuario afirma haber realizado un pago, cobro o transacción (ej: "ya pagué la luz", "registra gasto de 50", "acabo de cobrar").
   *REGLA DE VERACIDAD:* Nunca inventes IDs, nombres, ni montos que no estén en el ESTADO. Si el usuario te pide registrar un pago (ej. "pagué luz") pero no especifica el monto ni la cuenta origen, o si no hay un recordatorio coincidente, no te inventes los datos; responde como una consulta de tipo "query" preguntándole amigablemente por los detalles faltantes (ej: "¿Con qué cuenta lo pagaste y por qué monto?").

2. Si es una PREGUNTA, CONSULTA o PETICIÓN DE INFORMACIÓN (type: "query"):
   - Responde de forma conversacional, amigable, concisa y profesional en español.
   - Si pregunta por montos, usa su moneda configurada (S/.) y dale cifras precisas basadas en los datos reales del ESTADO.
   - Debes retornar EXACTAMENTE este formato JSON:
     {
       "type": "query",
       "response": "<Tu respuesta conversacional y detallada formateada con Markdown en español, describiendo el estado de sus finanzas>"
     }

3. Si es un COMANDO DE ACCIÓN / REGISTRO (type: "action"):
   - Analiza la acción y extrae los parámetros correctos mapeando a los IDs de cuentas y tarjetas reales del ESTADO.
   - Retorna EXACTAMENTE uno de los siguientes formatos de JSON según corresponda:

   A) REGISTRAR TRANSACCIÓN (GASTO o INGRESO):
   {
     "type": "action",
     "actionType": "transaction",
     "response": "<Mensaje de confirmación personalizado del registro de la transacción en español>",
     "data": {
       "tipo": "GASTO" o "INGRESO",
       "fecha": "YYYY-MM-DD",  // Usa la fecha indicada por el usuario, o hoy (${today}) si no se especifica
       "monto": <monto numérico real extraído>,
       "moneda": "S/." o "US$" (usa "US$" SOLO si el usuario indica explícitamente dólares; por defecto "S/."),
       "categoria": "Comida/Transporte/Servicios/Vivienda/Educación/Entretenimiento/Pago Tarjeta/Transferencia/Ahorro/Otros",
       "descripcion": "<Descripción detallada del movimiento>",
       "cuenta_id": <ID numérico de la cuenta real de state.cuentas, o null si es tarjeta de crédito>,
       "tarjeta_id": <ID numérico de la tarjeta real de state.tarjetas, o null si es cuenta de débito>,
       "fijo": "Variable" o "Fijo"
     }
   }

   B) EJECUTAR TRANSFERENCIA ENTRE CUENTAS:
   {
     "type": "action",
     "actionType": "transfer",
     "response": "<Mensaje de confirmación de la transferencia en español>",
     "data": {
       "fecha": "YYYY-MM-DD",
       "monto": <monto numérico real de la transferencia>,
       "origen_id": <ID numérico de la cuenta origen en state.cuentas>,
       "destino_id": <ID numérico de la cuenta destino en state.cuentas>,
       "descripcion": "Transferencia entre cuentas"
     }
   }

   C) PAGAR RECORDATORIO DE SERVICIO O TARJETA:
   {
     "type": "action",
     "actionType": "pay_reminder",
     "response": "<Mensaje de confirmación indicando qué recordatorio se pagó y con qué cuenta en español>",
     "data": {
       "reminder_id": <ID numérico del recordatorio real en state.recordatorios>,
       "monto_real": <monto numérico real pagado>,
       "cuenta_id": <ID numérico de la cuenta en state.cuentas con la que se hace el pago>
     }
   }

   D) COBRAR TRABAJO FREELANCE (TRABAJO POR COBRAR):
   {
     "type": "action",
     "actionType": "collect_job",
     "response": "<Mensaje de confirmación del cobro del trabajo en español>",
     "data": {
       "job_id": <ID numérico del trabajo real en state.trabajos_pendientes>,
       "monto_real": <monto numérico real cobrado>,
       "cuenta_id": <ID numérico de la cuenta en state.cuentas donde se deposita>,
       "fecha_real": "YYYY-MM-DD"
     }
   }

   E) APORTAR O RETIRAR DE META DE AHORRO:
   {
     "type": "action",
     "actionType": "savings_contribution",
     "response": "<Mensaje de confirmación del aporte o retiro en español>",
     "data": {
       "meta_id": <ID numérico de la meta real en state.metas>,
       "monto": <monto numérico del aporte/retiro>,
       "cuenta_id": <ID numérico de la cuenta de débito origen/destino en state.cuentas>,
       "tipo_operacion": "APORTE" o "RETIRO"
     }
   }

   F) REGISTRAR VARIOS MOVIMIENTOS EN UNA SOLA INSTRUCCIÓN (LOTE):
   Si el usuario menciona DOS O MÁS gastos/ingresos en la misma instrucción (ej: "hoy gasté 20 en taxi con BCP, 35 en almuerzo con la CMR y me depositaron 100 en Interbank"), NO registres solo el primero. Retorna TODOS en un lote:
   {
     "type": "action",
     "actionType": "batch",
     "response": "<Resumen breve en español de los movimientos detectados>",
     "data": {
       "transacciones": [
         { <objeto con EXACTAMENTE el mismo formato del campo "data" del tipo A: tipo, fecha, monto, moneda, categoria, descripcion, cuenta_id, tarjeta_id, fijo> },
         { ... un objeto por cada movimiento mencionado ... }
       ]
     }
   }
   - Si algún movimiento no especifica cuenta/tarjeta, usa cuenta_id: null y tarjeta_id: null (el usuario lo corregirá en la vista previa).
   - El lote es solo para transacciones GASTO/INGRESO simples; si la instrucción mezcla transferencias o pagos de recordatorios, procesa la acción más clara y pide aclarar el resto.

CRITICAL: Debes responder ÚNICAMENTE con el objeto JSON válido. No incluyas explicaciones adicionales fuera del JSON. No añadas bloques de markdown alrededor del JSON como \`\`\`json. Solo el texto JSON puro.
`;
}

// Manejador compartido de registro de transacciones automáticas
async function handleAutoRegister(req, res) {
  const {
    tipo,
    fecha,
    monto,
    moneda,
    banco_o_metodo,
    nro_operacion,
    descripcion_original,
    categoria,
    descripcion
  } = req.body;

  if (!monto || !banco_o_metodo) {
    return res.status(400).json({ error: "Faltan parámetros requeridos (monto, banco_o_metodo)." });
  }

  const state = await getLatestState();
  if (!state) {
    return res.status(500).json({ error: "No se pudo cargar el estado financiero." });
  }

  // Comprobar desduplicación por nro_operacion
  if (nro_operacion) {
    const isDuplicate = (state.transacciones || []).some(t => 
      t.nro_operacion && String(t.nro_operacion) === String(nro_operacion)
    );
    if (isDuplicate) {
      console.log(`[Auto-Register] Transacción duplicada detectada e ignorada: ${nro_operacion}`);
      return res.json({ ok: true, message: "Transacción duplicada ignorada.", duplicate: true });
    }
    
    const isPendingDuplicate = (state.transacciones_pendientes || []).some(t => 
      t.nro_operacion && String(t.nro_operacion) === String(nro_operacion)
    );
    if (isPendingDuplicate) {
      console.log(`[Auto-Register] Transacción duplicada detectada en pendientes: ${nro_operacion}`);
      return res.json({ ok: true, message: "Transacción duplicada ignorada (ya está en pendientes).", duplicate: true });
    }
  }

  const isCreditCard = ['falabella', 'cmr', 'tarjeta bbva', 'tarjeta oh', 'tarjeta interbank'].some(keyword => 
    banco_o_metodo.toLowerCase().includes(keyword)
  );
  const { cuenta_id, tarjeta_id } = resolveAccountOrCard(banco_o_metodo, isCreditCard, state);

  const newTx = {
    tipo: tipo || "GASTO",
    fecha: fecha || new Date().toISOString().split('T')[0],
    monto: parseFloat(monto),
    moneda: moneda || "S/.",
    cuenta_id,
    tarjeta_id,
    fijo: "Variable",
    nro_operacion: nro_operacion || null,
    descripcion_original: descripcion_original || banco_o_metodo,
    created_at: new Date().toISOString()
  };

  // Si ya tiene categoría y descripción final estructurada
  if (categoria && descripcion) {
    newTx.id = Math.max(...(state.transacciones || []).map(t => t.id || 0), 0) + 1;
    newTx.categoria = categoria;
    newTx.descripcion = descripcion;
    
    state.transacciones = state.transacciones || [];
    state.transacciones.unshift(newTx);
    state.updated_at = new Date().toISOString();
    
    if (SUPABASE_URL && SUPABASE_KEY) {
      await uploadToSupabase(state);
    }
    saveLocalDataSync(state);
    
    return res.json({ ok: true, registered: true, data: newTx });
  } else {
    // Guardar en pendientes y disparar mensaje a Telegram
    state.transacciones_pendientes = state.transacciones_pendientes || [];
    state.transacciones_pendientes.push(newTx);
    state.updated_at = new Date().toISOString();
    
    if (SUPABASE_URL && SUPABASE_KEY) {
      await uploadToSupabase(state);
    }
    saveLocalDataSync(state);

    const chatMsg = `🔔 *Gasto Detectado* (${banco_o_metodo})\nMonto: *${newTx.moneda} ${newTx.monto.toFixed(2)}*\nDetalle: _${newTx.descripcion_original}_\n\n¿En qué gastaste? Responde con el detalle (ej: "almuerzo", "taxi", "frutas").`;
    
    await sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, chatMsg);

    return res.json({ ok: true, registered: false, pending: true, data: newTx });
  }
}

// ----------------------------------------------------------------------------
// ENDPOINTS
// ----------------------------------------------------------------------------

// Obtener datos
app.get('/api/data', requireLocalAuth, async (req, res) => {
  const latestState = await getLatestState();
  if (latestState) {
    res.json(latestState);
  } else {
    res.status(500).json({ error: "No se pudo leer la base de datos." });
  }
});

// Endpoint para registro automático (desde correos)
app.post('/api/auto-register', requireLocalAuth, async (req, res) => {
  await handleAutoRegister(req, res);
});

// Endpoint para procesar capturas de pantalla de gastos (desde Atajo iOS)
app.post('/api/auto-register-image', requireLocalAuth, async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  
  if (!imageBase64) {
    return res.status(400).json({ error: "Falta la imagen codificada en Base64." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "No se configuró GEMINI_API_KEY en el servidor." });
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const cleanMimeType = mimeType || 'image/png';

  const extractionPrompt = `
Analiza esta captura de pantalla de un comprobante de pago de Yape, Plin, transferencia bancaria o consumo de tarjeta en Perú.
Extrae la información financiera exacta y responde ÚNICAMENTE con un objeto JSON con el siguiente formato:
{
  "tipo": "GASTO",
  "monto": <número decimal con el monto exacto>,
  "moneda": "S/." o "US$" (por defecto "S/."),
  "banco_o_metodo": "Yape", "Plin", "BCP", "Interbank", "BBVA" o "Falabella" (dedúcelo de la tipografía, colores, logo o texto de la captura),
  "nro_operacion": "<número de operación o referencia extraído>",
  "descripcion_original": "Pago a <nombre del destinatario o comercio>"
}
Responde únicamente con el JSON puro, sin bloques markdown de tipo \`\`\`json.
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: extractionPrompt },
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[IA-Image] Error al llamar a la API de Gemini:", errorText);
      return res.status(500).json({ error: "Error en la comunicación con Gemini API." });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!replyText) {
      return res.status(500).json({ error: "Gemini devolvió una respuesta vacía al procesar la imagen." });
    }

    let cleanJsonStr = replyText.trim();
    if (cleanJsonStr.startsWith("```")) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    const parsedData = JSON.parse(cleanJsonStr);
    console.log("[IA-Image] Extracción exitosa:", parsedData);

    req.body = parsedData;
    await handleAutoRegister(req, res);

  } catch (err) {
    console.error("[IA-Image] Error al procesar imagen con la IA:", err);
    res.status(500).json({ error: "Ocurrió un error en el servidor al procesar la imagen: " + err.message });
  }
});

// Endpoint del Webhook de Telegram
app.post('/api/telegram-webhook', async (req, res) => {
  const update = req.body;
  if (!update || !update.message) {
    return res.sendStatus(200);
  }

  const message = update.message;
  const chatId = message.chat?.id;
  const text = (message.text || '').trim();

  if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
    console.warn(`[Telegram] Intento de acceso no autorizado del Chat ID: ${chatId}`);
    return res.sendStatus(200);
  }

  try {
    const state = await getLatestState();
    if (!state) {
      await sendTelegramMessage(chatId, "⚠️ Error en el servidor al cargar las finanzas.");
      return res.sendStatus(200);
    }

    state.transacciones_pendientes = state.transacciones_pendientes || [];

    const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isCancelWord = 
      normalizedText === 'cancelar' || 
      normalizedText === 'descartar' || 
      normalizedText === 'error' || 
      normalizedText === 'ignorar' || 
      normalizedText === 'olvidalo' || 
      normalizedText === 'cancela' ||
      normalizedText.includes('fue un error') ||
      normalizedText.includes('olvidalo') ||
      normalizedText.includes('no registrar');

    if (isCancelWord) {
      if (state.transacciones_pendientes.length > 0) {
        const discarded = state.transacciones_pendientes.pop();
        state.updated_at = new Date().toISOString();
        if (SUPABASE_URL && SUPABASE_KEY) {
          await uploadToSupabase(state);
        }
        saveLocalDataSync(state);
        await sendTelegramMessage(chatId, `❌ Transacción descartada: *${discarded.moneda} ${discarded.monto}* a _${discarded.descripcion_original}_.`);
      } else {
        await sendTelegramMessage(chatId, "No tienes transacciones pendientes.");
      }
      return res.sendStatus(200);
    }

    // Caso A: Hay transacciones pendientes. El texto ingresado categoriza el último gasto.
    if (state.transacciones_pendientes.length > 0) {
      const pendingTx = state.transacciones_pendientes[state.transacciones_pendientes.length - 1];
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        await sendTelegramMessage(chatId, "⚠️ No se configuró GEMINI_API_KEY en el servidor para procesar la categorización.");
        return res.sendStatus(200);
      }

      const categoriesList = Object.keys(state.categorias || {}).join(', ');
      const sysPrompt = `
Eres el asistente financiero de Jano. El usuario realizó un pago pendiente de registrar:
Monto: ${pendingTx.monto} ${pendingTx.moneda}
Origen: ${pendingTx.cuenta_id ? 'Cuenta débito' : 'Tarjeta crédito'} (Original: ${pendingTx.descripcion_original})

El usuario ha escrito la descripción corta o destino de ese gasto: "${text}"

Basándote en esto, debes:
1. Clasificarlo en una de estas categorías exactas: [${categoriesList}]. Si no estás seguro, usa "Otros".
2. Redactar una descripción final amigable y limpia (ej: "Compra de frutas (Carlos)" o "Almuerzo en restaurante").

Responde únicamente con un objeto JSON válido con este formato:
{
  "categoria": "<Categoría exacta>",
  "descripcion": "<Descripción final>"
}
No devuelvas nada más que el JSON limpio.
`;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: sysPrompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          let cleanStr = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (cleanStr.startsWith("```")) {
            cleanStr = cleanStr.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
          }
          const parsed = JSON.parse(cleanStr);

          pendingTx.id = Math.max(...(state.transacciones || []).map(t => t.id || 0), 0) + 1;
          pendingTx.categoria = parsed.categoria || "Otros";
          pendingTx.descripcion = parsed.descripcion || text;

          state.transacciones_pendientes.pop();
          state.transacciones = state.transacciones || [];
          state.transacciones.unshift(pendingTx);
          state.updated_at = new Date().toISOString();

          if (SUPABASE_URL && SUPABASE_KEY) {
            await uploadToSupabase(state);
          }
          saveLocalDataSync(state);

          await sendTelegramMessage(chatId, `✅ *Registrado con éxito!*\nMonto: *${pendingTx.moneda} ${pendingTx.monto.toFixed(2)}*\nCategoría: *${pendingTx.categoria}*\nDetalle: _${pendingTx.descripcion}_`);
        } else {
          await sendTelegramMessage(chatId, "⚠️ Hubo un problema al procesar la categoría con Gemini. Intenta responder de nuevo.");
        }
      } catch (err) {
        console.error("[Telegram-Webhook] Error en IA:", err);
        await sendTelegramMessage(chatId, "⚠️ Error procesando la respuesta con la IA.");
      }
    } else {
      // Caso B: No hay transacciones pendientes. Procesar como comando directo de chat.
      await handleTelegramDirectCommand(text, state, chatId);
    }
  } catch (err) {
    console.error("[Telegram-Webhook] Error general:", err);
  }

  return res.sendStatus(200);
});

// Guardar datos
app.post('/api/data', requireLocalAuth, async (req, res) => {
  const newData = req.body;

  if (!newData || typeof newData !== 'object') {
    return res.status(400).json({ error: "Datos inválidos." });
  }

  // Estampar la fecha de actualización directamente en el JSON
  newData.updated_at = new Date().toISOString();

  if (SUPABASE_URL && SUPABASE_KEY) {
    const success = await uploadToSupabase(newData);
    if (success) {
      saveLocalDataSync(newData);
      return res.json({ ok: true, message: "Datos guardados correctamente en la nube (Supabase) y espejo local." });
    }
    console.warn("[Supabase] Falló el guardado en la nube, usando fallback local.");
  }

  // Fallback local
  const success = saveLocalDataSync(newData);
  if (success) {
    res.json({ ok: true, message: "Datos guardados correctamente en local." });
  } else {
    res.status(500).json({ error: "No se pudo guardar la información local." });
  }
});

// Endpoint de NLP Híbrido (Gemini o Kimi/Moonshot)
app.post('/api/command', requireLocalAuth, async (req, res) => {
  const { command, state, history } = req.body;
  const authHeader = req.headers.authorization;
  // Extraer de forma robusta la API Key limpiando espacios adicionales y el prefijo Bearer
  const apiKey = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

  if (!command) {
    return res.status(400).json({ error: "Falta el comando de texto." });
  }
  if (!apiKey) {
    return res.status(400).json({ error: "No se proporcionó la API Key de la IA." });
  }

  // Detectar automáticamente si es Gemini (empieza por AIza, AQ. o no es sk-) o Kimi/OpenAI (suele empezar por sk-)
  const isGemini = apiKey.startsWith("AIza") || apiKey.startsWith("AQ.") || !apiKey.startsWith("sk-");

  console.log(`[IA] Solicitud recibida: "${command}" | Proveedor detectado: ${isGemini ? 'Gemini (gemini-2.5-flash)' : 'Kimi (moonshot-v1-8k)'}`);

  const userName = state?.configuracion?.nombre_usuario || "Jano";

  const systemPrompt = getSystemPrompt(state);

  try {
    let response;
    if (isGemini) {
      // Formatear el historial y el mensaje del usuario para Gemini
      const contents = [
        ...(history || []).map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        {
          role: 'user',
          parts: [{ text: `INSTRUCCIÓN DE ${userName.toUpperCase()}: "${command}"` }]
        }
      ];

      // Llamar a Gemini API con Instrucciones de Sistema y Conversación Multi-turno
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
      response = await fetch(url, {
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
    } else {
      // Formatear el historial y el mensaje del usuario para Kimi (OpenAI compatible)
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...(history || []).map(h => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content
        })),
        {
          role: 'user',
          content: `INSTRUCCIÓN DE JANO: "${command}"`
        }
      ];

      // Llamar a Kimi (Moonshot AI) API con formato OpenAI
      const url = 'https://api.moonshot.ai/v1/chat/completions';
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: messages,
          response_format: { type: "json_object" }
        })
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error al llamar a la API de ${isGemini ? 'Gemini' : 'Kimi'}:`, errorText);
      return res.status(500).json({ error: `Error en la comunicación con la API de ${isGemini ? 'Gemini' : 'Kimi'}.` });
    }

    const data = await response.json();
    const replyText = isGemini 
      ? data.candidates?.[0]?.content?.parts?.[0]?.text
      : data.choices?.[0]?.message?.content;

    if (!replyText) {
      return res.status(500).json({ error: "La IA devolvió una respuesta vacía." });
    }

    // Limpiar posibles bloques markdown si existieran y parsear el JSON
    let cleanJsonStr = replyText.trim();
    if (cleanJsonStr.startsWith("```")) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    const parsedReply = JSON.parse(cleanJsonStr);
    console.log(`[IA] Respuesta procesada con éxito. Tipo: ${parsedReply.type}`);
    res.json(parsedReply);

  } catch (error) {
    console.error("Error al procesar comando con la IA:", error);
    res.status(500).json({ error: "Ocurrió un error en el servidor al invocar a la IA: " + error.message });
  }
});

// Ruta comodín para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SEC-05: Por defecto solo se escucha en loopback (127.0.0.1) para no exponer
// los datos financieros a la red local. Para despliegues remotos definir HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`==================================================`);
  console.log(` Servidor de Finanzas levantado en: http://localhost:${PORT}`);
  console.log(` Escuchando solo en: ${HOST}`);
  if (!process.env.LOCAL_API_TOKEN) {
    console.log(` Token de sesión (generado este arranque): ${LOCAL_TOKEN}`);
  }
  console.log(` Presiona Ctrl+C para detener el servidor`);
  console.log(`==================================================`);

  // Auto-registro del Webhook de Telegram si corre en Render
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.RENDER_EXTERNAL_URL) {
    const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/api/telegram-webhook`;
    console.log(`[Telegram] Intentando registrar Webhook automático en: ${webhookUrl}`);
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          console.log(`[Telegram] Webhook registrado con éxito en Render!`);
        } else {
          console.error(`[Telegram] Error al registrar Webhook:`, res.description);
        }
      })
      .catch(err => {
        console.error(`[Telegram] Excepción al registrar Webhook:`, err);
      });
  }
});
