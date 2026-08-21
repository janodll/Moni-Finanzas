# ESTADO — Traspaso de sesión (Moni Finanzas)

> Pega este archivo al inicio de la sesión nueva para retomar sin perder contexto.
> **Fecha del traspaso: 2026-08-21.** Todo lo de abajo refleja el estado real verificado al cerrar.

---

## 1. Proyecto y objetivo

**Moni** = sistema de finanzas personales de **Jano** y su esposa **Andrea**, Perú. Uso personal, activo a diario.

**Flujo:** correos bancarios (BCP, Interbank, BBVA, Falabella/CMR, Cencosud, Yape, Plin) → **Apps Script** (`lector_jano.js`, `lector_andrea.js`) los lee y extrae un JSON con **Gemini** → POST al **servidor Express en Render** → **bot de Telegram** para categorizar → datos en **Supabase**. Frontend SPA en `public/`.

- **Ruta local:** `/Users/jano/Proyectos/Agentes Antigravity/Finanzas`
- **Repo:** github.com/janodll/Moni-Finanzas — rama `main` — **push a main = auto-deploy en Render**.

**Restricciones prácticas:**
- **Verificar en el código/datos reales antes de afirmar.** Nunca de memoria.
- **Push a `main` = deploy a producción.** Pedir confirmación antes.
- La **UI de Moni** y el **dashboard de Supabase** los maneja Jano (el agente no tiene acceso).
- Los **lectores de Apps Script** el agente los edita localmente y **Jano los pega a mano** en script.google.com (**dos proyectos separados**: `moni-jano` y `moni-andrea`). Render NO los despliega.
- El agente **sí puede** leer y escribir Supabase vía REST con las credenciales de `.env` (`SUPABASE_URL`, `SUPABASE_KEY`). Se usó mucho en esta sesión para verificar y corregir datos.
- **Jano no es programador**: explicar en resultados, no en jerga.

---

## 2. ⚠️ LA LECCIÓN MÁS CARA DE ESTA SESIÓN — leer antes de tocar nada

**El correo del banco solo describe UNA mitad de las operaciones de dos patas.**

- Operaciones **diarias** (taxi, almuerzo, compra) = **una pata**. El correo lo dice todo. Funcionan bien.
- Operaciones **mensuales** (transferencias, pagos de tarjeta) = **dos patas**: la plata sale de un lado y entra a otro. Y el correo **nunca dice la otra mitad**:
  - *"Transferencia a Andrea Zuniga Martinez De P."* → nunca dice a qué **cuenta** entró.
  - *"Constancia de pago"* (la manda la tarjeta) → nunca dice de qué **cuenta** salió.

**Se intentó adivinar esa mitad TRES veces y las tres fallaron**, a veces acreditando la cuenta equivocada en silencio y confirmando "éxito" por Telegram. Casos reales medidos: pares 362/363 y 371/372 acreditaron BCP Andrea por pura suposición de "mismo banco".

**Regla que quedó (respetarla):**
> Si falta un dato que el correo no contiene, **NO se adivina**. O se deduce sin ambigüedad, o se le pregunta a Jano y se avisa. Es preferible no registrar a registrar mal en silencio.

**Corolario sobre el texto:** para deducir el destino, usar **SOLO la respuesta que Jano escribe en Telegram** (`text`), nunca `descripcion_original` ni `banco_o_metodo` — esos dos nombran el banco de **ORIGEN** y usarlos reintroduce el bug. Tres verificadores independientes tumbaron un intento por esto exacto.

**Corolario sobre el tamaño:** los tres intentos fallidos cambiaban ~700 líneas de golpe. Lo que sí funcionó fue **pedazos chicos, verificados y desplegados uno por uno**. Mantener ese ritmo.

---

## 3. Estado actual verificado (2026-08-21)

**Cuentas de débito:**
| id | Nombre | Titular |
|----|--------|---------|
| 1 | BCP Jano | Jano |
| 2 | BCP Andrea | Andrea |
| 3 | Interbank Jano | Jano |
| 4 | BBVA Andrea | Andrea |
| 5 | Interbank Andrea | Andrea |

**Tarjetas de crédito:**
| id | Nombre | Titular |
|----|--------|---------|
| 1 | CMR Falabella | Jano/Andrea |
| 2 | Interbank Jano | Jano |
| 3 | Interbank Andrea | Andrea |
| 5 | Tarjeta BBVA | Andrea |
| 6 | Cencosud | Andrea |

> Los titulares se renombraron de `"Yo"/"Esposa"` a `"Jano"/"Andrea"` en esta sesión. Si algún código compara contra "Yo" o "Esposa", está roto.

**Recordatorios de tarjeta** (todos reactivados y con fecha de setiembre):
190 CMR Falabella (09-10), 191 Interbank Jano (09-15), 192 Tarjeta BBVA (09-06), 166 Interbank Andrea (09-15).
- **165 "Tarjeta Oh" sigue en "Pagado" a propósito**: apunta a `tarjeta_id 4`, que **no existe** en `tarjetas`. Dato huérfano — decidir si se borra.

**Cola de pendientes:** se vació entera el 2026-08-20 (45 entradas). Respaldo completo en `backups_datos/pendientes_vaciados_2026-08-20.json`. De esos, 4 nunca se registraron en ningún lado (S/125.90): Uber S/7.90 y PLIN S/15 del 12-jul, Wong Prime S/60 del 18-jul, MFA957 Barranco S/43 del 27-jul. Jano decidió dejarlos ir.

---

## 4. Resuelto y desplegado en esta sesión

Commits en `main`, del más nuevo al más viejo:

- **`4086b9b` — Telegram reintenta los envíos.** Se midió que **11 de 45 pendientes (~1 de cada 4) nunca se avisaron**: `sendTelegramMessage` devolvía `null` ante cualquier fallo y el llamador lo ignoraba, así que el gasto entraba a la cola y a Jano nunca le preguntaban. Ahora reintenta 3 veces, respeta el `retry_after` de un 429, y ante un 400 (Markdown roto por un `_` en el detalle del banco) **reenvía sin formato** para que el mensaje llegue igual.
- **`f389159` — Los recordatorios de tarjeta se renuevan.** Al pagarlos quedaban en `"Pagado"` para siempre (los de servicio sí avanzaban un mes), desaparecían de la lista y el mes siguiente no había botón "Pagar" — por eso cada pago de tarjeta terminaba a mano. Arreglado en los **cuatro** caminos: `executeActionOnState`, el webhook de Telegram, el modal web y el asistente web (`public/js/ai/client.js`, este último no estaba en el inventario inicial). Usa `proximoVencimiento()`, no `addOneMonth()`: salta al primer mes futuro y conserva el día (un vencimiento el 31 no se degrada a 28).
- **`2d69661` — Moneda en el modal de pagos.** El modal solo aceptaba soles; ahora tiene selector S/. | US$ y la moneda se guarda en las dos piernas.
- **`c4e99a1` — Un pago de tarjeta ya no infla la deuda.** Los correos de "constancia de pago" llegan con `tarjeta_id` resuelto y sin `cuenta_id`; como un GASTO con `tarjeta_id` **suma** deuda, pagar la tarjeta la aumentaba. Ahora se suelta el `tarjeta_id` y la fila queda inerte, con aviso.
- **`0d93dd4` — Destino de transferencia solo desde la respuesta del usuario.** (Ver sección 2.)
- **`26fa218` — La deuda de tarjeta baja siempre.** El INGRESO espejo vivía dentro de la rama de `recordatorio_pagado_id`, y el prompt solo le pasa a Gemini los recordatorios `"Pendiente"` — como los 5 de tarjeta estaban en `"Pagado"`, era **código inalcanzable**. Los 2 pagos de tarjeta hechos por Telegram (ids 434 y 493) fallaron: 100%.
- **`7ced3ae`, `1f2e069`, `810101d`** — espejo entre cuentas propias en distinto banco; titulares `"Yo"`→`"Jano"`; reconocer Cencosud.

**Datos corregidos a mano en Supabase** (todos verificados releyendo después): titulares renombrados; cuenta *Interbank Andrea* creada; tarjeta BBVA reasignada a Andrea; transferencias 580/581 cuadradas contra Interbank Andrea; duplicado de S/2,500 (fila 527) eliminado; pago de tarjeta Interbank en dólares registrado (par 625/626); tarjeta Interbank Jano **conciliada contra el estado de cuenta el 2026-08-19** en S/137.44 y US$3.21 (calzaba exacto ese día; el número sube solo con cada consumo nuevo — no es un valor fijo contra el que comparar después).

**Apps Script:** Jano pegó `lector_jano.js` corregido el 2026-08-21. `lector_andrea.js` ya estaba al día (confirmado porque los consumos de Cencosud entran bien).
> **Falta la prueba concluyente del pegado:** una compra normal por BCP ya llegó como `"BCP Jano"` (bien), pero esas ya salían bien antes. Lo decisivo es una **transferencia** por BCP: debe decir `"BCP Jano"` y **no** `"Tarjeta BCP Jano"`.

---

## 5. Pendientes grandes

### 5.1 La confirmación falsa (prioritario)
**Síntoma real:** Jano respondió por Telegram un pago de tarjeta de S/274.65, el bot dijo *"✅ Registrado con éxito"* y **la transacción nunca llegó a la base**. La registró a mano después. Lo peligroso no es ese pago: es que el mensaje de éxito no es confiable.

**Lo que se encontró** (investigación completa, con líneas):
- `server.js` ~676-684: el camino de **comando directo** manda el texto de confirmación **escrito por Gemini** sin mirar si se insertó algo.
- `executeActionOnState` (~457-624): **no tiene rama `else`**. Un `actionType` desconocido hace que la función no haga nada y retorne sin error → el llamador lo lee como éxito. Igual con `'batch'` y `data.transacciones` vacío.
- Ninguna rama revisa el retorno de `dbInsert` (que devuelve `null` en un 409 por duplicado).
- **No hay deduplicación por `update_id`** y el `res.sendStatus(200)` sale recién al final, después de Gemini y sus reintentos → Telegram reentrega el mismo update y se procesa dos veces.
- `dbInsertPair` no es atómica: si el GASTO entra y falla el INGRESO, queda huérfano y al reintentar se duplica.
- `uploadToSupabase` devuelve true/false y **el valor se ignora en todas las llamadas**.

**Recomendación (de la investigación, en orden):** (1) agregar `dbGetById` y no confirmar sin releer la fila; (2) que `executeActionOnState` devuelva las filas y lance error ante `actionType` desconocido; (3) si falla el insert, **devolver el pendiente a la cola** en su índice y avisar; (4) deduplicar por `update_id` y responder 200 antes de llamar a Gemini; (5) rollback en `dbInsertPair` y comprobar el booleano de `uploadToSupabase`.

> **Ojo:** un intento previo de (1) fue rechazado por los verificadores porque la relectura estaba dentro del mismo `try` que el insert: un corte de red **en la relectura**, con la fila ya insertada, producía una **negación falsa** y duplicados. Si se retoma, esa relectura va aparte.

### 5.2 Los botones de Telegram (el arreglo de fondo)
El bot **solo sabe mandar texto**: `sendTelegramMessage` no usa `reply_markup`, y el webhook descarta los updates de tipo `callback_query` (`if (!update || !update.message) return`). No hay `answerCallbackQuery`.

**Diseño ya hecho y validado** (no hay que rediseñarlo): agregar un parámetro opcional a `sendTelegramMessage`, una rama de ruteo en el webhook, dos helpers (`answerCallbackQuery` / `editMessageReplyMarkup`) y **un array nuevo en el blob**, `preguntas_pendientes`, hermano de `transacciones_pendientes` y con el mismo ciclo de persistencia dentro de `stateMutex.runExclusive`. La transacción **no se inserta**: se aparca con un id corto de 8 hex que viaja en el `callback_data` (límite 64 bytes), y el insert ocurre al tocar el botón. Botones y texto libre comparten el mismo resolver para que no diverjan.

**Regla clave:** si el destino es **inequívoco**, registrar directo sin molestar. Los botones son solo para la duda.

**Problemas ALTA que los verificadores encontraron en el intento de implementarlo** (evitarlos): el criterio de "inequívoco" seguía dejando pasar casos ambiguos; se capturaba `tarjeta_id` antes de anularlo y se reducía la deuda de una tarjeta equivocada; y `POST /api/data` empezaba a descargar la tabla entera (576 filas) en cada guardado de la web.

### 5.3 Menores
- Saldo en dólares de **Interbank Jano (cuenta id 3)**: quedó en **−US$25.13** porque nunca se le registró saldo inicial en dólares. Falta que Jano diga cuánto tiene.
- Recordatorio huérfano **165 "Tarjeta Oh"** → `tarjeta_id 4` no existe.
- El bloque `[Transferencia Automática]` inserta el INGRESO **antes** que el GASTO y sin `transfer_id`, a diferencia del de tarjeta que usa `dbInsertPair` con el GASTO primero. Si el GASTO resulta duplicado, queda un ingreso huérfano.

---

## 6. Archivos y rutas clave

**Backend:** `server.js` (Express en Render) — `getLatestState()`, `executeActionOnState()`, `handleAutoRegister()`, `app.post('/api/telegram-webhook')` (categorización, bloques `[Pago Tarjeta]` y `[Transferencia Automática]`, cancelar), `resolveAccountOrCard()`, `sendTelegramMessage()`, `proximoVencimiento()`. · `db.js` — acceso a la tabla vía PostgREST.

**Frontend (`public/`):** `js/state.js`, `js/main.js` (formularios, modal de pagar recordatorio), `js/ui/history.js`, `js/ui/dashboard.js`, `js/calculations.js` (motor de saldos: un GASTO con `tarjeta_id` **suma** deuda, un INGRESO la **resta**; una fila sin cuenta ni tarjeta es **inerte**), `js/ai/client.js` (asistente web), `index.html`.

**Apps Script:** `scripts_gmail/lector_jano.js` y `lector_andrea.js`.

**Supabase:** blob `moni_state` (id=1) + tabla `public.transacciones` (índice UNIQUE en `nro_operacion`).

**Respaldos de esta sesión:** `backups_datos/pendientes_vaciados_2026-08-20.json`, `backups_datos/fila_527_duplicado_borrada.json`.

---

## 7. Cómo trabajar (lo que funcionó y lo que no)

- **Verificar SIEMPRE con datos reales.** Varias conclusiones "obvias" resultaron falsas al mirar Supabase. Ejemplo: se concluyó que un pago se había borrado; el correlativo de ids demostró que nunca se insertó.
- **Los verificadores adversariales valen su costo.** Rechazaron tres implementaciones que parecían correctas, encontrando bugs reales de plata mal atribuida. No desplegar sin pasar por ahí.
- **Cambios chicos.** Los tres rechazos fueron cambios de ~700 líneas. Los que llegaron a producción fueron de 20-70 líneas.
- **Cuidado con los comandos a medias:** una llamada `curl` que falló por un error de shell alcanzó a insertar una fila igual y creó un duplicado (fila 624). Verificar el efecto, no solo el código de salida.

---

## 8. Próximo paso concreto

1. **Confirmar el pegado del Apps Script** con la próxima transferencia por BCP (debe decir "BCP Jano", no "Tarjeta BCP Jano").
2. **Atacar la confirmación falsa** (5.1), en pedazos chicos y con verificación adversarial.
3. **Implementar los botones** (5.2) usando el diseño ya hecho, evitando los ALTA listados.
4. Cuando Jano lo diga: saldo en dólares de Interbank Jano, y el recordatorio huérfano 165.
