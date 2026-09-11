// Mapea el texto del banco o metodo que escribio el lector (ej. "Tarjeta Interbank Jano",
// "BCP Andrea") a un cuenta_id o tarjeta_id real del estado.
//
// Vive en su propio modulo porque server.js levanta el servidor al importarse y esta
// funcion necesita poder probarse sola: es el punto donde una etiqueta mal escrita se
// convierte en plata que no se mueve.
export function resolveAccountOrCard(banco_o_metodo, isCreditCard, state) {
  const query = (banco_o_metodo || '').toLowerCase().trim();

  // Sin texto no hay nada que deducir. Sin esta guarda, query = '' hacia que
  // name.includes('') fuera true para TODOS y la fila caia en la primera cuenta de la
  // lista (BCP Jano) por puro orden del array. Es la misma familia de fallas que el
  // proyecto ya combate: mover plata a partir de un dato que no existe.
  if (!query) return { cuenta_id: null, tarjeta_id: null };

  // Elige la tarjeta/cuenta de la persona correcta cuando el banco existe para ambos
  // (ej. Interbank tiene tarjeta de Jano Y de Andrea). Si el query no nombra persona,
  // no restringe.
  // Rechaza solo si el nombre pertenece a la OTRA persona (una tarjeta sin persona en
  // el nombre, ej. "Tarjeta BBVA", se acepta igual).
  const personOk = (name) => {
    if (query.includes('andrea')) return !name.includes('jano');
    if (query.includes('jano')) return !name.includes('andrea');
    return true;
  };

  if (isCreditCard || query.includes('tarjeta') || query.includes('cmr') || query.includes('falabella')) {
    // Buscar en tarjetas (respetando la persona)
    for (const t of state.tarjetas || []) {
      const name = t.nombre.toLowerCase();
      const matchesBank =
          name.includes(query) ||
          (query.includes('cmr') && name.includes('falabella')) ||
          (query.includes('falabella') && name.includes('cmr')) ||
          (query.includes('bbva') && name.includes('bbva')) ||
          (query.includes('interbank') && name.includes('interbank'));
      if (matchesBank && personOk(name)) {
        return { cuenta_id: null, tarjeta_id: t.id };
      }
    }
    // Fallbacks específicos de tarjeta
    if (query.includes('falabella') || query.includes('cmr')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('falabella') || t.nombre.toLowerCase().includes('cmr'));
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
    if (query.includes('bbva')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('bbva') && personOk(t.nombre.toLowerCase()));
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
    if (query.includes('interbank')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('interbank') && personOk(t.nombre.toLowerCase()));
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
    if (query.includes('cencosud')) {
      const defaultCard = (state.tarjetas || []).find(t => t.nombre.toLowerCase().includes('cencosud') && personOk(t.nombre.toLowerCase()));
      if (defaultCard) return { cuenta_id: null, tarjeta_id: defaultCard.id };
    }
    // Ninguna tarjeta calzo. NO rendirse aqui: el texto puede decir "tarjeta" y aun asi
    // referirse a una cuenta de debito — el caso real es "Tarjeta BCP Andrea", y no existe
    // ninguna tarjeta BCP. Devolver null aqui insertaba la fila INERTE (sin cuenta ni
    // tarjeta): registrada, confirmada por Telegram, e invisible en los saldos. Ids 686 y
    // 698 se perdieron asi. Se sigue a la busqueda por cuenta, que tiene reglas por banco.
  }

  {
    // Buscar en cuentas (débito)
    for (const c of state.cuentas || []) {
      const name = c.nombre.toLowerCase();
      if (name.includes(query)) {
        return { cuenta_id: c.id, tarjeta_id: null };
      }
    }
    
    // Fallbacks específicos de débito/billeteras
    if (query.includes('yape')) {
      const isAndrea = query.includes('andrea');
      const titular = isAndrea ? 'Andrea' : 'Jano';
      const bcpAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('bcp') && c.titular === titular);
      if (bcpAcc) return { cuenta_id: bcpAcc.id, tarjeta_id: null };
    }
    if (query.includes('plin')) {
      const isAndrea = query.includes('andrea');
      const titular = isAndrea ? 'Andrea' : 'Jano';
      const ibkAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('interbank') && c.titular === titular);
      if (ibkAcc) return { cuenta_id: ibkAcc.id, tarjeta_id: null };
    }
    if (query.includes('bcp')) {
      const isAndrea = query.includes('andrea');
      const titular = isAndrea ? 'Andrea' : 'Jano';
      const bcpAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('bcp') && c.titular === titular);
      if (bcpAcc) return { cuenta_id: bcpAcc.id, tarjeta_id: null };
    }
    if (query.includes('interbank')) {
      const isAndrea = query.includes('andrea');
      const titular = isAndrea ? 'Andrea' : 'Jano';
      const ibkAcc = (state.cuentas || []).find(c => c.nombre.toLowerCase().includes('interbank') && c.titular === titular);
      if (ibkAcc) return { cuenta_id: ibkAcc.id, tarjeta_id: null };
    }
  }
  return { cuenta_id: null, tarjeta_id: null };
}

// Busca en state.cuentas la unica cuenta nombrada dentro de un texto libre.
// Hermana de buscarTarjetaEnTexto (server.js), con la misma prudencia: devuelve null si
// hay 0 candidatas, o si quedan varias y el texto no nombra a una persona para desempatar.
//
// El texto que se le pasa SIEMPRE debe ser lo que el usuario escribio en Telegram, nunca
// descripcion_original ni banco_o_metodo: esos dos nombran el banco de ORIGEN del correo y
// usarlos es justo lo que acreditaba la plata en la cuenta equivocada (ver ESTADO seccion 2).
//
// A diferencia de buscarTarjetaEnTexto, aqui la persona se busca por palabra completa:
// "cirujano" contiene "jano" y no debe desempatar nada.
export function buscarCuentaEnTexto(texto, state) {
  const norm = (str) => (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const t = norm(texto);
  if (!t.trim()) return null;

  const nombra = (palabra) => new RegExp(`\\b${palabra}\\b`).test(t);
  const nombraJano = nombra("jano");
  const nombraAndrea = nombra("andrea");
  // Si nombra a las DOS no se puede desempatar: se trata como si no nombrara a ninguna.
  const persona = (nombraJano && nombraAndrea) ? null : (nombraAndrea ? "andrea" : (nombraJano ? "jano" : null));

  const candidatas = (state.cuentas || []).filter(c => {
    const nombre = norm(c.nombre);
    // Tokens que identifican al banco: "bcp", "interbank", "bbva"... se descartan las
    // palabras genericas y los nombres de persona.
    const tokens = nombre.split(' ').filter(w => w.length >= 3 && w !== 'cuenta' && w !== 'jano' && w !== 'andrea');
    if (tokens.length === 0) return false;
    if (!tokens.some(w => t.includes(w))) return false;
    if (persona === 'andrea' && nombre.includes('jano')) return false;
    if (persona === 'jano' && nombre.includes('andrea')) return false;
    return true;
  });

  if (candidatas.length === 1) return candidatas[0];

  // Varias del mismo banco (ej. "Interbank Jano" vs "Interbank Andrea"): solo se resuelve
  // si el texto nombra explicitamente a una de las dos personas.
  if (candidatas.length > 1 && persona) {
    const dePersona = candidatas.filter(c => norm(c.nombre).includes(persona));
    if (dePersona.length === 1) return dePersona[0];
  }
  return null;
}
