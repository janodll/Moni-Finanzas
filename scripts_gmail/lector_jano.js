// =======================================================
// MONI FINANZAS - LECTOR DE CORREOS (VERSIÓN JANO)
// =======================================================

const props = PropertiesService.getScriptProperties();
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');
const MONI_API_URL = props.getProperty('MONI_API_URL');
const MONI_API_TOKEN = props.getProperty('MONI_API_TOKEN');
const TELEGRAM_BOT_TOKEN = props.getProperty('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = props.getProperty('TELEGRAM_CHAT_ID');

// Llama a Gemini probando varios modelos ante 503/429 (modelo saturado del lado de
// Google). Reintentar el mismo modelo saturado no sirve; se cae a uno alterno vivo.
// (gemini-2.5-flash fue descontinuado; no usar.)
function fetchGeminiConFallback(payload) {
  const modelos = ['gemini-flash-latest', 'gemini-3.1-flash-lite'];
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  let response;
  for (const modelo of modelos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`;
    let retries = 3;
    while (retries > 0) {
      response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      if (code === 503 || code === 429) {
        Logger.log(`${modelo} saturado (${code}). Reintentando en 2s... Quedan: ${retries - 1}`);
        Utilities.sleep(2000);
        retries--;
      } else {
        return response; // respondió (200 u otro error real): no probar más modelos
      }
    }
    Logger.log(`${modelo} sigue saturado; probando modelo alternativo...`);
  }
  return response; // último intento (probablemente 503) si todos siguen saturados
}

function procesarCorreosMoni() {
  // Busca correos no leídos de los bancos
  // Se busca el nombre del banco en TODO el correo (no solo el remitente) para no depender
  // del dominio exacto: si un banco cambia de dominio (p.ej. Interbank usa netinterbank.com.pe),
  // igual se captura porque el cuerpo siempre menciona el banco. Los promos que entren de más
  // los descarta la IA con {"tipo":"IGNORAR"}. Mismo enfoque que el lector de Andrea.
  const query = 'is:unread newer_than:1d (yape OR plin OR bcp OR interbank OR bbva OR falabella OR scotiabank)';
  const hilos = GmailApp.search(query, 0, 10);
  
  if (hilos.length === 0) {
    Logger.log("No hay correos bancarios nuevos.");
    return;
  }

  for (const hilo of hilos) {
    const mensajes = hilo.getMessages();
    for (const mensaje of mensajes) {
      if (mensaje.isUnread()) {
        const asunto = mensaje.getSubject();
        const cuerpo = mensaje.getPlainBody();
        
        Logger.log("Procesando: " + asunto);
        const enviadoOk = extraerDatosConGemini(asunto, cuerpo);

        // Marca como leído SOLO si el backend confirmó recepción (200) o si la IA
        // decidió ignorarlo. Si Render está dormido/falla, el correo queda no leído
        // para reintentarlo en el próximo ciclo del trigger sin perder el gasto.
        if (enviadoOk) {
          mensaje.markRead();
        } else {
          Logger.log("No se marcó como leído: el backend no confirmó el registro. Se reintentará.");
        }
      }
    }
  }
}

function extraerDatosConGemini(asunto, cuerpo) {
  const prompt = `
Eres el asistente financiero de Jano. Analiza este correo bancario.

REGLA VITAL ANTI-SPAM: Los bancos suelen enviar publicidad. Debes IGNORAR el correo (respondiendo ÚNICAMENTE con el JSON: {"tipo": "IGNORAR"}) si notas que es una promoción, oferta, alerta de inicio de sesión, o usa frases como "gana", "inscríbete", "descubre", "campaña".
Los comprobantes REALES confirman una acción ejecutada ("realizaste un consumo", "transferencia", "yapearon", "constancia", "comprobante", "pago recurrente") y traen fecha y monto (el número de operación a veces no viene en pagos recurrentes o suscripciones, si falta el nro de operación pero es un pago real, acéptalo igual). Si cumple con esto, extrae la información.

Extrae la información y responde ÚNICAMENTE con un objeto JSON válido con este formato:
{
  "tipo": "GASTO" o "INGRESO",
  "monto": <número decimal>,
  "moneda": "S/." o "US$",
  "banco_o_metodo": "<Nombre del banco> Jano",
  "descripcion_original": "<A quién se pagó o detalle>",
  "nro_operacion": "<número de operación, constancia o referencia si aparece en el correo; usa null si no hay>"
}

REGLA DE ORO PARA EL BANCO_O_METODO: Deduce el banco y agrégale "Jano" al final. CRÍTICO — distingue TARJETA DE CRÉDITO vs CUENTA/DÉBITO, porque un mismo banco puede tener ambas:
- Si el correo es un CONSUMO/PAGO CON TARJETA DE CRÉDITO (menciona "Tarjeta de Crédito", "Visa", "Mastercard", "realizaste un consumo con tu Tarjeta", o un nombre de tarjeta como Clásica/Oro/Premia/Signature/Platinum), ANTEPÓN la palabra "Tarjeta": por ejemplo "Tarjeta Interbank Jano", "Tarjeta BBVA Jano". Falabella siempre es tarjeta: usa "CMR Falabella".
- Si es DÉBITO, cuenta de ahorros, Yape, Plin o transferencia, usa solo el banco: "BCP Jano", "Interbank Jano".
Esto es crítico para diferenciar tarjeta de crédito, cuenta de débito, y de las de su esposa.

ASUNTO: ${asunto}
CUERPO: ${cuerpo}

No devuelvas nada más que el JSON limpio, sin bloques de código markdown.
`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const response = fetchGeminiConFallback(payload);

  if (response.getResponseCode() === 200) {
    const resJson = JSON.parse(response.getContentText());
    let cleanStr = resJson.candidates[0].content.parts[0].text;
    
    // --- EXTRACCIÓN ROBUSTA ---
    let startIndex = cleanStr.indexOf('{');
    if (startIndex !== -1) {
      cleanStr = cleanStr.substring(startIndex);
    }
    
    let parsedData = null;
    let originalStr = cleanStr;
    
    while (cleanStr.length > 0) {
      try {
        parsedData = JSON.parse(cleanStr);
        break; // Éxito
      } catch (e) {
        // Si falla, quitamos el último caracter (basura, llave extra) y reintentamos
        cleanStr = cleanStr.substring(0, cleanStr.length - 1);
      }
    }
    
    Logger.log("TEXTO CRUDO DE GEMINI: " + originalStr);
    
    if (parsedData) {
      if (parsedData.tipo === "IGNORAR") {
        Logger.log("Correo publicitario o irrelevante ignorado por la IA.");
        return true; 
      }
      
      Logger.log("IA extrajo (Jano): " + JSON.stringify(parsedData));
      return enviarAMoniBackend(parsedData);
    } else {
      // El parseo falló. Si la respuesta claramente pedía IGNORAR (correo promocional/spam),
      // trátalo como ignorado: márcalo leído y NO alertes (evita spam de alertas y reintentos).
      // La alerta queda solo para fallos en correos que parecían transacciones reales.
      if (/ignorar/i.test(originalStr)) {
        Logger.log("JSON malformado pero la IA quería IGNORAR (correo promocional). Ignorado sin alerta.");
        return true;
      }
      Logger.log("Fallo total al parsear JSON.");
      enviarAlertaTelegram(`Fallo parseo JSON Gemini.\nAsunto: ${asunto}\nError: No se pudo encontrar un JSON válido.\nRespuesta cruda: ${originalStr.substring(0, 100)}`);
      return false;
    }
  } else {
    Logger.log("Error de Gemini API: " + response.getContentText());
    return false;
  }
}

function enviarAMoniBackend(data) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-local-token": MONI_API_TOKEN
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(MONI_API_URL, options);
  Logger.log("Respuesta de tu servidor (Render): " + response.getContentText());
  return response.getResponseCode() === 200;
}

function enviarAlertaTelegram(mensaje) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: `🚨 *ALERTA Apps Script (Jano)* 🚨\n${mensaje}`,
      parse_mode: 'Markdown'
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}
