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

// Obtener datos
app.get('/api/data', requireLocalAuth, async (req, res) => {
  let localData = null;
  let localUpdatedAt = new Date(0).toISOString();

  // 1. Leer el estado local (si existe) y obtener su fecha de actualización
  try {
    if (fs.existsSync(DATA_FILE)) {
      const dataStr = fs.readFileSync(DATA_FILE, 'utf8');
      localData = JSON.parse(dataStr);
      // Fallback a la fecha de modificación del archivo físico si el JSON no tiene fecha
      localUpdatedAt = localData.updated_at || fs.statSync(DATA_FILE).mtime.toISOString();
    }
  } catch (err) {
    console.error("Error al leer datos.json local en arranque:", err);
  }

  // 2. Si Supabase está configurado, sincronizar comparando fechas
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

          // Caso A: Los cambios locales en datos.json son más nuevos (ocurrieron offline)
          if (localTime > cloudTime && localData) {
            console.log(`[Sync] Datos locales son más recientes (${localUpdatedAt} > ${cloudUpdatedAt}). Subiendo a Supabase...`);
            await uploadToSupabase(localData);
            return res.json(localData); // Retornar siempre lo local (es el más nuevo)
          } 
          
          // Caso B: Los cambios en la nube son más nuevos o iguales. Sincronizar hacia abajo (espejo)
          if (cloudTime > localTime) {
            console.log(`[Sync] Datos en la nube son más recientes (${cloudUpdatedAt} > ${localUpdatedAt}). Actualizando espejo local...`);
          }
          if (!cloudData.updated_at) {
            cloudData.updated_at = cloudUpdatedAt;
          }
          saveLocalDataSync(cloudData);
          return res.json(cloudData);
        }
      }
      console.warn(`[Supabase] No se encontró la fila id=1 o error (${response.status}). Usando fallback local.`);
    } catch (dbErr) {
      console.error("[Supabase] Error al sincronizar en lectura, usando fallback local:", dbErr);
    }
  }

  // Fallback local puro
  if (localData) {
    return res.json(localData);
  }

  // Si no hay datos de ningún tipo, retornar error
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) {
      console.error("Error al leer datos.json:", err);
      return res.status(500).json({ error: "No se pudo leer la base de datos." });
    }
    try {
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch (parseErr) {
      console.error("Error al parsear datos.json:", parseErr);
      res.status(500).json({ error: "La base de datos está corrompida." });
    }
  });
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

  const systemPrompt = `
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
       "fecha": "YYYY-MM-DD",  // Usa la fecha indicada por el usuario, o hoy (${new Date().toISOString().split('T')[0]}) si no se especifica
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
});
