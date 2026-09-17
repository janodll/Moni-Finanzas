# ESTADO — Traspaso de sesión (Moni Finanzas)

> Pega este archivo al inicio de la sesión nueva para retomar sin perder contexto.
> **Fecha del traspaso: 2026-08-27.** Todo lo de abajo refleja el estado real verificado al cerrar.
> Las secciones 1-8 son del cierre del 2026-08-21 y siguen vigentes: **no se tocó código después de esa fecha**. La sección 9 cubre lo que pasó entre el 22 y el 27 de agosto.

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

- **`871ab1a` — Mencionar un banco ya no prueba que la plata quedó en casa.** Para dar por interna una transferencia bastaba con que la respuesta nombrara un banco. Pero **la mayoría de las transferencias van a terceros, y los terceros también tienen banco**: si solo existía una cuenta propia de ese banco, quedaba una sola candidata y se acreditaba en silencio. Reproducido ejecutando el código que estaba desplegado: *"pago del alquiler al bbva del casero"* desde BCP Jano acreditaba a **BBVA Andrea**; *"le pagué al gasfitero por interbank"* desde Interbank Andrea acreditaba a **Interbank Jano**. Es la misma falla de los pares 362/363 y 371/372 por otra vía. Ahora se exige una señal explícita de interna (nombrar a Jano/Andrea, o decir "mi/mis"); el banco sigue sirviendo para **desempatar**, no para decidir.
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

**⚠️ EL ERROR DE DISEÑO QUE HAY QUE EVITAR (se implementó completo y se revirtió).**
Se llegó a implementar todo —envío de botones, `answerCallbackQuery`, `preguntas_pendientes`, ruteo de `callback_query`, anti doble toque— y pasó 8 pruebas propias. **Tres verificadores lo rechazaron igual, con 8 problemas ALTA.** El intento quedó guardado en `scratchpad/server.js.botones-intento1` (efímero; si se necesita, rehacer).

La falla de fondo: **el gasto se aparcaba DENTRO de la pregunta y no se insertaba hasta el toque.** Consecuencias:
- Si nadie tocaba en 72 h, `limpiarPreguntasVencidas` borraba la pregunta **con el gasto adentro**: desaparecía sin insertar ni avisar. Falla silenciosa, justo lo que el proyecto combate.
- El gasto aparcado era invisible para la desduplicación de auto-register y para los comandos cancelar/limpiar.
- En el toque se insertaba **antes** de persistir el estado: un corte ahí dejaba la pregunta viva con la plata ya insertada → duplicado al volver a tocar. Agravante verificado: **los pagos de tarjeta reales tienen `nro_operacion: null`** (filas 592, 615, 625), así que el índice UNIQUE no protege de ese duplicado.

**El diseño correcto (invertir el orden):** registrar el GASTO **de inmediato**, como hoy, y usar los botones **solo para agregar la contraparte**. Si el usuario nunca toca, no se pierde nada: queda igual que hoy (gasto registrado, sin espejo). Eso elimina de raíz la pérdida a las 72 h y el riesgo de duplicado.

**Otros ALTA a no repetir:**
- La tarjeta a acreditar se tomaba de `pendingTx.tarjeta_id` (derivado de `banco_o_metodo`), que es justo la fuente que la rama hermana prohíbe: `resolveAccountOrCard('Tarjeta Interbank')` devuelve **siempre** Interbank Jano, aunque el pago haya sido a la de Andrea. `buscarTarjetaEnTexto` devuelve `null` ahí **a propósito**; el código nuevo lo salteaba.
- El caso **más frecuente** (transferencia a un tercero) abría botones preguntando "¿a cuál de tus 4 cuentas?" cuando la respuesta correcta es "a ninguna". Antes registraba con un aviso. Cualquier rediseño tiene que tratar "fue a un tercero" como el caso normal, no como la excepción.
- Se perdía la protección contra un CONSUMO mal categorizado como "Pago Tarjeta": el bot preguntaba afirmando el relato equivocado.

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

1. **Confirmar el pegado del Apps Script** con la próxima transferencia por BCP (debe decir "BCP Jano", no "Tarjeta BCP Jano"). Ya pegado el 2026-08-21; falta la prueba con una transferencia.
2. **Atacar la confirmación falsa** (5.1), en pedazos chicos y con verificación adversarial.
3. **Rehacer los botones** (5.2) con el orden invertido: **registrar el gasto primero, preguntar solo por la contraparte.** No repetir el diseño de aparcar el gasto dentro de la pregunta.
4. Cuando Jano lo diga: saldo en dólares de Interbank Jano, y el recordatorio huérfano 165.

### Marcador de la sesión 2026-08-21
Cuatro implementaciones se rechazaron en el día (tres de agentes, una propia), todas de la misma clase: mover plata a partir de un dato que no existía. Lo que **sí** llegó a producción fueron siete cambios chicos, cada uno verificado con un test aislado antes de subir. **Ese es el ritmo que funciona en este proyecto.** Los verificadores adversariales encontraron bugs reales en las cuatro; no desplegar nada de esta familia sin pasar por ellos.

---

## 9. Sesión 2026-08-22 → 2026-08-27 — reporte de gastos, sin cambios de código

**No se desplegó nada. No se modificó `server.js` ni los lectores.** Los pendientes grandes (5.1 confirmación falsa, 5.2 botones de Telegram) siguen **intactos y son el próximo trabajo real**.

### Lo que se hizo
Se generó **`auditorias_y_reportes/reporte-julio-agosto-2026.md`** (27/08): gasto de julio y agosto por categoría, con proyección de agosto. Números clave: julio cerró en **−S/. 2,916.04** por la moto de S/. 6,995; sin esa compra única el mes daba **+S/. 3,630.96**. Agosto al día 26 iba en **S/. 4,573.43** de gasto contra **S/. 5,003.30** de ingresos.

### Cuatro correcciones de datos que salieron de Jano, no del sistema
El primer borrador del reporte estaba mal en cuatro puntos y **las cuatro las detectó Jano leyéndolo**. Vale la pena registrarlas porque son fallas de captura, no de reporte:

1. **Audífonos S/. 729.30 (08/08) — compra cancelada que seguía viva.** Fue una compra online que Jano canceló y se olvidó de borrar. Se eliminó de Supabase (fila 540). Copia en `backups_datos/fila_540_audifonos_cancelados.json`. Efecto: deuda de la tarjeta BBVA bajó de S/. 2,932.95 a **S/. 2,203.65**; Entretenimiento de agosto bajó de S/. 1,489 a **S/. 759.80**.
2. **Seguros de salud: son mensuales, no anuales.** El sistema los estaba leyendo como pago anual. Faltaban **S/. 448** de julio que nunca se capturaron.
3. **Tres gastos reembolsados se contaban como propios.** Plata que Jano adelantó y le devolvieron, sumando a su gasto.
4. **Compra de gaseosas por mayor leída como salida a comer.** Una compra de oferta que dura 2-3 meses estaba inflando "comer fuera" de agosto. Es el mismo patrón de fondo del proyecto: **el correo del banco no distingue una compra de stock de un consumo del día.**

### Lo que quedó pendiente **de Jano** (no del código)
- **Anotar los S/. 700 del concierto** en "Por Cobrar", para octubre.
- **Verificar el estado de cuenta de la tarjeta BBVA**: si el banco nunca llegó a cobrar los audífonos cancelados, debe decir **S/. 2,203.65**.
- **Vigilar la próxima transferencia por BCP**: es la prueba concluyente del Apps Script pegado el 21/08. Debe llegar como **"BCP Jano"** y **no** como "Tarjeta BCP Jano" (ver sección 4).

### Las filas INERTES: registradas, confirmadas, e invisibles (2026-09-02)

**Sintoma:** Jano reporta que el alquiler de US$500 (30/08) y el mantenimiento de S/250 (31/08) "nunca llegaron a Moni", pese a que Telegram confirmo "Registrado con exito" en los dos.

**No era una confirmacion falsa.** Las dos filas SI estaban insertadas (ids 686 y 698). Entraron **inertes**: `cuenta_id` null y `tarjeta_id` null, asi que no mueven ningun saldo. Registradas, confirmadas, e invisibles en la app. Para el usuario es identico a que no existieran — y es peor que un error visible, porque no hay nada que revisar.

**Causa raiz, dos capas:**

1. El lector escribio `banco_o_metodo = "Tarjeta BCP Andrea"`. El prompt dice explicitamente que BCP nunca es tarjeta de credito, pero **la excepcion vive dentro de la regla general** ("deduce el banco y agregale el nombre al final") y el modelo aplica la regla y se come la excepcion. Es la MISMA falla que produce `"CMR Falabella Jano"` en vez de `"CMR Falabella"`. Es un patron del prompt, no del modelo: cambiar de modelo no lo arregla (se verifico con 3.1-flash-lite y 3.5-flash-lite: los dos fallan igual).
2. `resolveAccountOrCard` trataba la rama de tarjeta como **puerta de un solo sentido**: al entrar por `query.includes('tarjeta')` y no calzar ninguna tarjeta (no existe ninguna BCP), devolvia los dos ids en null en vez de intentar por cuenta. La regla que resuelve BCP vive en la rama `else`, inalcanzable. Lo mas revelador: el llamador **ya sabia** que no era tarjeta — su lista de `isCreditCard` no incluye `"tarjeta bcp"` — pero el resolvedor re-decidia por su cuenta leyendo la palabra "tarjeta" del texto.

**Arreglado** en `70f110d`: si ninguna tarjeta calza, se sigue a la busqueda por cuenta. Solo puede convertir nulls en cuenta resuelta; nunca cambia una tarjeta que ya calzaba. La funcion se movio a `resolver.js` (server.js levanta el servidor al importarse y no se podia probar sola) con `tests/resolver.test.js`: los dos bugs mas 12 casos de regresion.

**Segundo bug, encontrado por el test:** con `banco_o_metodo` vacio, `query = ''` hacia que `name.includes('')` fuera true para todas y la fila caia en **la primera cuenta del array (BCP Jano) por puro orden**. Plata asignada por accidente. Ahora un texto vacio devuelve null.

**Datos:** ids 686 y 698 corregidos a `cuenta_id=2` (BCP Andrea) el 2026-09-02, con relectura independiente. Respaldo en `backups_datos/filas_686_698_inertes_2026-09-02.json`.

**Las 3 filas inertes de julio se dejan como estan por decision de Jano** (ids 495 S/400, 461 S/14.95, 364 S/2.04). Ya compenso esos saldos en su momento con un movimiento de ajuste, asi que **corregirlas ahora duplicaria la correccion**. No tocarlas. Si algun dia se cuadra julio contra el estado de cuenta y aparece una diferencia de ~S/417, la explicacion es esta, no un bug nuevo.

**Lo que sigue faltando (y es lo que cierra el "todos los meses pasa algo"):** cuando una fila queda inerte, Telegram igual dice "Registrado con exito". El bot confirma sin mirar si la plata se movio. Una fila con `cuenta_id` y `tarjeta_id` en null deberia avisar, no confirmar. Es hermano del pendiente 5.1 y va en el flujo de Telegram — donde tres intentos previos fueron rechazados por los verificadores. Hacerlo por pedazos chicos.

### Cierre del 2026-09-17: cuadre forzado, y lo que sigue roto

**Qué se hizo el 16/09**

- **Se registraron los movimientos identificados que faltaban:** los Yape recibidos de Santiago (S/ 20) y Steven (S/ 40) del 13/09 en BCP Jano (ids 776, 777), y dos pagos de tarjeta del 15/09 como pares: S/ 299.31 de la cuenta Interbank Jano a su tarjeta (778/779) y S/ 491.04 de la cuenta Interbank Andrea a su tarjeta (780/781).
- **Cuadre forzado de las 5 cuentas de débito** a los saldos reales del banco (ids 782-787): BCP Jano a S/ 165.00, Interbank Jano a S/ 105.90, y las tres de Andrea a cero en soles y dólares. **Neto agregado por los cuadres míos: +S/ 201.16** (7/09 y 16/09 juntos). Respaldo en `backups_datos/cuadre_saldos_2026-09-16.json`.
- **Se vació la cola de Telegram**, que tenía 31 pendientes, algunos del 20/08. Respaldo completo en `backups_datos/cola_pendientes_vaciada_2026-09-16.json`. Motivo: tras un cuadre forzado, responder un pendiente viejo lo cuenta dos veces.
- **Los recordatorios NO se tocaron**, por decisión de Jano ("ya ni me guío de esos"). Los de las tarjetas Interbank quedaron en "Pendiente" con vencimiento 15/09 pese a estar pagadas. **No usar el botón "Pagar" de la web en esas: registraría el pago de nuevo.**

**Por qué se descuadró: tres causas confirmadas y una sin resolver**

1. **La app web pisa la cola de pendientes.** `saveState()` (public/js/state.js) manda todo el estado que cargó al abrirse, incluida `transacciones_pendientes`, y `/api/data` lo sobrescribe entero. La app nunca lee ni modifica esa cola: solo la reenvía vieja. Si la app quedó abierta, cualquier guardado borra los pendientes que llegaron después. Hay 45 acciones que guardan y la app no refresca sola. **CONFIRMADO en código, sin arreglar.**
2. **El lector descarta correos en silencio.** Si Gemini responde `IGNORAR`, `extraerDatosConGemini` devuelve true, el correo se marca leído y no hay alerta. Medido: el mismo correo de constancia de pago dio IGNORAR 1 de cada 2 veces en el lector de Jano. Además solo busca `newer_than:1d`: lo que se atasca más de un día se pierde. **CONFIRMADO, sin arreglar.**
3. **Duplicados por ceros a la izquierda.** Cada Yape llega en dos correos (Yape y BCP) y el nro_operacion viene `02505825` en uno y `2505825` en el otro. La comparación es por texto, no los reconoce iguales y el segundo entra a la cola. **CONFIRMADO, sin arreglar.**
4. **Sin resolver:** el pago de S/ 491.04 de Andrea (15/09) nunca llegó al servidor pese a que su lector lee ese correo bien en pruebas (2 de 2), el correo existía y no hubo aviso en Telegram. Se descartaron: carrera entre correos simultáneos (hay mutex), duplicado por nro_operacion (ninguno repetido), y lentitud del modelo 3.5-flash-lite (mide 1.6 s por correo, más rápido que el anterior). Los avisos de fallo de Apps Script del 15-16/09 son errores transitorios de Google y no explican pérdidas, solo posibles duplicados.

**Decisión: NO se implementa el vínculo reembolso → gasto (2026-09-17)**

Jano lo descartó por tamaño del cambio. El problema real que queda sin resolver: un reembolso entra como INGRESO y el gasto original queda por su monto completo, así que **ingresos y egresos de los reportes quedan inflados por el mismo monto**. Ejemplo suyo: pizza de S/ 100, le devuelven S/ 60, gasto propio S/ 40, pero Moni muestra 100 de gasto y 60 de ingreso. Los saldos de las cuentas no se ven afectados, solo los reportes.

Lo mismo pasa con la plata que solo pasa por la cuenta y no tiene gasto registrado (la cuota de S/ 245 de Mariana). **Al leer cualquier reporte hay que descontar a mano estos dos casos.** En setiembre, de S/ 2,418 de "ingresos del mes", el ingreso propio eran S/ 2,086: solo lo categorizado como Sueldo más la venta del monitor.

### Trampa recurrente: los reembolsos inflan todo reporte

**Ya mordió dos veces** (reporte de julio-agosto el 27/08, reporte de agosto el 01/09). Los reembolsos entran a Moni como **INGRESO de categoría "Otros"**, sin ningún vínculo al gasto que devuelven. El gasto original queda contado como propio, así que **todo reporte sobrestima lo que Jano gasta** hasta que alguien cruza a mano.

En agosto 2026 fueron **siete movimientos por S/. 999.86**: Google Workspace 589.86, collar de Kyra 209, torta Maria Almenara 54.50, alitas de fío 45, pádel 31.50, y la devolución de S/. 70 del préstamo a Telto. El primer borrador del reporte llegó a señalar el pago de Google Workspace como "la principal fuga del mes" cuando ya se lo habían reembolsado cuatro días después.

**Antes de cualquier reporte: listar los INGRESO de categoría "Otros" del período y cruzarlos contra los gastos por monto y fecha.** El arreglo de fondo —que el reembolso apunte al gasto original— sigue pendiente en el sistema.

### Nota de método
Esta conversación llegó a **824,000 tokens** de historial acumulado (arrancó el 20/07). Cada vez que Jano volvía a ella tras varias horas, se reprocesaba el historial completo: **~25% del límite de 5 horas del plan Pro por un solo mensaje**, aunque fuera una palabra. Siete veces en un día. **Este archivo existe para no repetir eso**: cerrar la conversación cuando se pone pesada y arrancar una nueva leyendo el ESTADO.
