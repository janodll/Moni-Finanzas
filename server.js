import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'datos.json');

app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/reportes', express.static(path.join(__dirname, 'reportes')));

// Token local estático básico para proteger la API (configurable por variable de entorno)
const LOCAL_TOKEN = process.env.LOCAL_API_TOKEN || 'moni-local-token-secure-2026';

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

// Obtener datos
app.get('/api/data', requireLocalAuth, (req, res) => {
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
app.post('/api/data', requireLocalAuth, (req, res) => {
  const newData = req.body;
  
  if (!newData || typeof newData !== 'object') {
    return res.status(400).json({ error: "Datos inválidos." });
  }

  // Backup automático antes de sobreescribir datos.json
  try {
    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, DATA_FILE + '.backup');
    }
  } catch (backupErr) {
    console.error("Error al crear copia de seguridad de datos.json:", backupErr);
  }

  fs.writeFile(DATA_FILE, JSON.stringify(newData, null, 2), 'utf8', (err) => {
    if (err) {
      console.error("Error al escribir en datos.json:", err);
      return res.status(500).json({ error: "No se pudo guardar la información." });
    }
    res.json({ ok: true, message: "Datos guardados correctamente." });
  });
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

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Servidor de Finanzas levantado en: http://localhost:${PORT}`);
  console.log(` Presiona Ctrl+C para detener el servidor`);
  console.log(`==================================================`);
});
