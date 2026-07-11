// =======================================================
// MONI FINANZAS - LECTOR DE CORREOS (VERSIÓN JANO)
// =======================================================

const props = PropertiesService.getScriptProperties();
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');
const MONI_API_URL = props.getProperty('MONI_API_URL');
const MONI_API_TOKEN = props.getProperty('MONI_API_TOKEN');

function procesarCorreosMoni() {
  // Busca correos no leídos de los bancos
  const query = 'is:unread newer_than:1d (from:yape OR from:plin OR from:bcp OR from:interbank OR from:bbva OR from:falabella)';
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
        extraerDatosConGemini(asunto, cuerpo);
        
        // Marca como leído para no procesarlo dos veces
        mensaje.markRead();
      }
    }
  }
}

function extraerDatosConGemini(asunto, cuerpo) {
  const prompt = `
Eres el asistente financiero de Jano. Analiza este correo bancario.

REGLA VITAL ANTI-SPAM: Los bancos suelen enviar publicidad. Debes IGNORAR el correo (respondiendo ÚNICAMENTE con el JSON: {"tipo": "IGNORAR"}) si notas que es una promoción, oferta, alerta de inicio de sesión, o usa frases como "gana", "inscríbete", "descubre", "campaña".
Los comprobantes REALES confirman una acción ejecutada ("realizaste un consumo", "transferencia", "yapearon", "constancia", "comprobante") y traen fecha o número de operación. Si cumple con esto, extrae la información.

Extrae la información y responde ÚNICAMENTE con un objeto JSON válido con este formato:
{
  "tipo": "GASTO" o "INGRESO",
  "monto": <número decimal>,
  "moneda": "S/." o "US$",
  "banco_o_metodo": "<Nombre del banco> Jano",
  "descripcion_original": "<A quién se pagó o detalle>"
}

REGLA DE ORO PARA EL BANCO_O_METODO: Debes deducir el banco (BCP, Interbank, BBVA, Falabella, Yape, Plin) y SIEMPRE agregarle la palabra "Jano" al final (Por ejemplo: "BCP Jano", "Interbank Jano", "CMR Falabella"). Esto es crítico para diferenciar sus cuentas de las de su esposa.

ASUNTO: ${asunto}
CUERPO: ${cuerpo}

No devuelvas nada más que el JSON limpio, sin bloques de código markdown.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
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
    let cleanStr = resJson.candidates[0].content.parts[0].text.trim();
    if (cleanStr.startsWith("\`\`\`")) {
      cleanStr = cleanStr.replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/, "").trim();
    }
    
    try {
      const dataExtrida = JSON.parse(cleanStr);
      
      // --- CAMBIO NUEVO: Barrera para desechar la publicidad ---
      if (dataExtrida.tipo === "IGNORAR") {
        Logger.log("Correo publicitario o irrelevante ignorado por la IA.");
        return;
      }
      // ----------------------------------------------------------
      
      Logger.log("IA extrajo (Jano): " + JSON.stringify(dataExtrida));
      enviarAMoniBackend(dataExtrida);
    } catch (e) {
      Logger.log("Error parseando el JSON de Gemini: " + e.message);
    }
  } else {
    Logger.log("Error de Gemini API: " + response.getContentText());
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
