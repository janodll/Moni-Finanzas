// =======================================================
// MONI FINANZAS - LECTOR DE CORREOS (VERSIÓN ANDREA)
// =======================================================

// Secretos en Script Properties (Proyecto → Configuración → Propiedades del script).
// NO hardcodear claves aquí: GitHub bloquea el push y quedan expuestas.
const props = PropertiesService.getScriptProperties();
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');
const MONI_API_URL = props.getProperty('MONI_API_URL');
const MONI_API_TOKEN = props.getProperty('MONI_API_TOKEN');
const TELEGRAM_BOT_TOKEN = props.getProperty('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = props.getProperty('TELEGRAM_CHAT_ID');

function procesarCorreosMoniAndrea() {
  // Busca correos no leídos de los bancos
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
        
        // Aquí atrapamos si funcionó bien o no
        const enviadoOk = extraerDatosConGemini(asunto, cuerpo);
        
        // CANDADO: Solo marca como leído si no hubo errores de JSON ni de servidor
        if (enviadoOk) {
          mensaje.markRead();
        }
      }
    }
  }
}

function extraerDatosConGemini(asunto, cuerpo) {
  const prompt = `
Eres el asistente financiero de Andrea. Analiza este correo bancario.

REGLA VITAL ANTI-SPAM: Los bancos suelen enviar publicidad. Debes IGNORAR el correo (respondiendo ÚNICAMENTE con el JSON: {"tipo": "IGNORAR"}) si notas que es una promoción, oferta, alerta de inicio de sesión, o usa frases como "gana", "inscríbete", "descubre", "campaña".
Los comprobantes REALES confirman una acción ejecutada ("realizaste un consumo", "transferencia", "yapearon", "constancia", "comprobante", "pago recurrente") y traen fecha y monto (el número de operación a veces no viene en pagos recurrentes o suscripciones, si falta el nro de operación pero es un pago real, acéptalo igual). Si cumple con esto, extrae la información.

Extrae la información y responde ÚNICAMENTE con un objeto JSON válido con este formato:
{
  "tipo": "GASTO" o "INGRESO",
  "monto": <número decimal>,
  "moneda": "S/." o "US$",
  "banco_o_metodo": "<Nombre del banco> Andrea",
  "descripcion_original": "<A quién se pagó o detalle>",
  "nro_operacion": "<número de operación, constancia o referencia si aparece en el correo; usa null si no hay>"
}

REGLA DE ORO PARA EL BANCO_O_METODO: Debes deducir el banco (BCP, Interbank, BBVA, Falabella, Yape, Plin) y SIEMPRE agregarle la palabra "Andrea" al final (Por ejemplo: "BCP Andrea", "Interbank Andrea", "CMR Falabella"). Esto es crítico para diferenciar sus cuentas de las de su esposo.

REGLA DE FORMATO: No uses saltos de línea (enters) ni comillas dobles en los valores del JSON.

ASUNTO: ${asunto}
CUERPO: ${cuerpo}

No devuelvas nada más que el JSON limpio, sin bloques de código markdown.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let response;
  let retries = 10;
  
  while (retries > 0) {
    response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 503 || response.getResponseCode() === 429) {
      Logger.log("Gemini saturado. Reintentando en 3s... Quedan: " + (retries - 1));
      Utilities.sleep(3000);
      retries--;
    } else {
      break;
    }
  }

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
      
      Logger.log("IA extrajo (Andrea): " + JSON.stringify(parsedData));
      return enviarAMoniBackend(parsedData);
    } else {
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

// =======================================================
// NUEVO: FUNCIÓN PARA ENVIAR ALERTAS CRÍTICAS A TELEGRAM
// =======================================================
function enviarAlertaTelegram(mensaje) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "TU_TOKEN_DE_TELEGRAM_AQUI") {
    Logger.log("Telegram no configurado. Alerta omitida: " + mensaje);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: `🚨 *ALERTA Apps Script (Andrea)* 🚨\n${mensaje}`,
      parse_mode: 'Markdown'
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}
