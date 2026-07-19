# ESTADO — Traspaso de sesión (Moni Finanzas)

> Pega este archivo al inicio de la sesión nueva para retomar sin perder contexto.
> Fecha del traspaso: 2026-07-19. Todo lo de abajo refleja el estado real al cerrar la sesión anterior.

---

## 1. Proyecto y objetivo

**Moni** = sistema de finanzas personales de **Jano** (y su esposa **Andrea**), Perú. Uso personal, un solo usuario, activo a diario.

**Flujo:** correos bancarios (BCP, Interbank, BBVA, Falabella/CMR, Yape, Plin) → **Apps Script** (`lector_jano.js`, `lector_andrea.js`) los lee y extrae un JSON con **Gemini** → POST al **servidor Express en Render** → **bot de Telegram** para categorizar el gasto → datos en **Supabase**. Frontend SPA en `public/` (dashboard "Moni").

- **Ruta local:** `/Users/jano/Proyectos/Agentes Antigravity/Finanzas`
- **Repo:** github.com/janodll/Moni-Finanzas — rama `main` — **push a main = auto-deploy en Render**.
- **Trabajo en curso:** se está estabilizando el sistema (bugs de raíz) y se migró la arquitectura de datos. La pieza grande (migración de transacciones a tabla relacional) YA se hizo.

**Modo de trabajo (orquestador + subagentes):** el agente del chat actúa como **CABEZA / orquestador**. NO hace el trabajo pesado inline; lo **delega a subagentes** para mantener el chat principal liviano de contexto:
- Investigar/buscar en el código → subagente de exploración (read-only).
- Implementar cambios acotados → subagente de implementación.
- Revisar código/diffs → subagente revisor.
- Correr pruebas/verificaciones → subagente.
En el chat principal quedan solo: planificar, decidir y dar resúmenes concisos al usuario.

Reglas para orquestar bien:
- Cada subagente arranca EN FRÍO: darle un brief autocontenido (que lea este `ESTADO.md` + los archivos/contexto específicos que necesita).
- Tareas bien acotadas; NO correr subagentes en paralelo que editen el mismo archivo (se pisan). Para paralelo, aislar por archivo/worktree.
- **Verificar** el resultado del subagente antes de reportar algo como hecho/desplegado (no fiarse ciego).
- Verificar en el código real antes de afirmar, no de memoria.

Lo que hace **Jano** (no los subagentes): pasos en la UI de Moni y en el dashboard de Supabase (el agente no tiene acceso a ninguno); y **pegar a mano** los lectores de Apps Script en script.google.com (**dos proyectos separados** — el agente edita los `.js` locales, Jano los pega). Recordar: **push a `main` = auto-deploy en Render**.

---

## 2. Estado actual — resuelto y funcionando

- **Migración Fase 1 COMPLETA y desplegada:** las transacciones viven en la tabla relacional **`public.transacciones`** en Supabase (una fila por transacción, `id` autogenerado, índice **UNIQUE en `nro_operacion`** = dedup real a nivel base de datos). Backfill de 373 filas, secuencia en 409. RLS activado sin políticas (solo `service_role`). El **blob `moni_state`** (id=1) sigue guardando todo lo demás: cuentas, tarjetas, categorías, metas, recordatorios, presupuestos, configuración y `transacciones_pendientes`.
  - Servidor: `getLatestState()` une blob + tabla al leer; escrituras de transacciones van por `db.js`; el blob se guarda SIN transacciones.
  - Frontend: `saveState()` ya no manda transacciones; usa endpoints granulares.
  - **Dedup confirmado en vivo** (dos intentos del mismo gasto → una sola fila).
- **Gemini robusto y barato:** helper con **fallback multi-modelo**. Orden actual **`['gemini-3.1-flash-lite', 'gemini-flash-latest']`** (lite primero por costo; el grande de respaldo ante 503/429). NO usar `gemini-1.5-flash` ni `gemini-2.5-flash` (descontinuados por Google jul-2026, dan 404). Reintentos bajados (10 → 2-3).
- **Filtro de correos robusto:** los lectores buscan el nombre del banco en TODO el correo (no por dominio), así nuevos dominios (ej. `netinterbank.com.pe`) se capturan solos.
- **`markRead` solo si el backend confirma** (200) → se acabó el reprocesamiento en bucle.
- **Emparejamiento por Reply** en categorización Y en "cancelar" (por `telegram_message_id` o por el monto citado; con varios pendientes y sin Reply, pide responder al correcto).
- **Comando "limpiar pendientes" / "cancelar todo"** para vaciar la cola.
- **Pagos de tarjeta:** de dos piernas enlazadas (`dbInsertPair`), a la tarjeta correcta; mapeo **crédito vs débito por persona** (un consumo con la TC Interbank ya no cae en la cuenta débito).
- **Secretos** en Script Properties (Apps Script) y env vars (Render); `secret_token` del webhook de Telegram; `LOCAL_API_TOKEN` obligatorio en prod.
- **Saldos reconciliados** con la realidad (cuentas y tarjetas cuadran con el banco).
- **UI:** sección "Próximos Pagos" (recordatorios) del dashboard **oculta** (`display:none` en `index.html`, reversible; datos intactos).

---

## 3. Bug prioritario — RECIÉN ARREGLADO, PENDIENTE DE VERIFICAR

**Síntoma:** una transferencia entre cuentas se registraba como **GASTO** (sale de la cuenta origen) pero **NO creaba el INGRESO** en la cuenta destino. Ocurría al categorizar por Telegram (responder un gasto como "transferencia a jano/andrea").

**Causa raíz (encontrada):** el "espejo" de transferencia comparaba `sourceAccount.titular === "Andrea"` y `c.titular === targetName`, pero los **titulares reales de las cuentas son "Yo"/"Esposa"**, no "Jano"/"Andrea". Nunca identificaba el destino → no creaba el ingreso.

**Arreglo aplicado y desplegado (commit `be45696`):** ahora identifica origen/destino por el **NOMBRE** de la cuenta (contiene "Jano"/"Andrea") y el banco por el **primer token del nombre**. Verificado con test:
- BCP Andrea + "a jano bcp" → INGRESO a BCP Jano ✅
- BCP Jano + "a andrea" → INGRESO a BCP Andrea ✅
- Sin persona / destino inexistente → no hace nada (sin crash) ✅

**Dónde está el código:** `server.js`, dentro del handler `app.post('/api/telegram-webhook', ...)`, bloque comentado `// Lógica de transferencia automática entre cuentas internas` / `[Transferencia Automática]` (aprox. línea ~1287, `if (catNorm.includes("transferencia") && pendingTx.tipo === "GASTO" && pendingTx.cuenta_id)`).

**FALTA (arrancar la sesión nueva por aquí):**
1. **Verificar en vivo:** hacer una transferencia nueva por Telegram (categorizar mencionando la persona) y confirmar que aparecen **las dos piernas** (gasto + ingreso).
2. **Arreglar la transferencia que ya falló:** hubo una de **S/715 de BCP Andrea → Jano BCP** que solo dejó el gasto. Agregar manualmente en la web un **INGRESO de S/715 a BCP Jano, categoría "Transferencia"**.
3. **Probar el registro manual** (modal de Transferencia de la web): esa ruta usa `executeActionOnState('transfer', ...)` → `dbInsertPair` y **debería** crear las dos piernas, pero **el usuario aún no lo verificó**.

**Nota de diseño:** el ingreso espejo del path de Telegram queda **SIN enlazar** por `transfer_id` (como los espejos históricos), así que borrar el gasto no borra el ingreso automáticamente. Si se quiere borrado atómico, es un cambio extra (insertar el gasto primero para obtener su id y enlazar ambas piernas) — pendiente/opcional.

---

## 4. Pendientes opcionales (no bloqueantes)

- **Fantasma de US$ 23.12 en la tarjeta Interbank Jano (id 2):** COSMÉTICO. La deuda real en dólares es **0** (verificado: las transacciones en dólares netean a 0). El dashboard muestra 23.12 por **3 transacciones legacy en dólares sin campo `moneda`**: "Reembolso Apple ($22.58)" (id 89, INGRESO), "Pago Tarjeta Interbank Jano (US$ 1.54)" (id 135, INGRESO), "App Videolite ($1.00 USD)" (id 147, GASTO). **NO es efecto de la migración.** Fix limpio (ahora es un UPDATE en la tabla): ponerles `moneda='US$'` con el monto EN DÓLARES correcto (ojo: hoy su `monto` está en soles; hay que convertir). Jano dijo que por ahora lo deja.
- **Re-envío de Telegram:** el webhook se bloquea llamando a Gemini → Telegram reentrega el update → doble procesamiento. El **dedup ya evita la fila doble**, y el mensaje doble ya se maneja (dice "duplicado, ignorado"). El fix de fondo (responder **200 a Telegram ANTES** de llamar a Gemini y procesar en segundo plano) es un cambio más grande, **no hecho**.

---

## 5. Archivos, tablas y rutas clave

**Servidor / backend:**
- `server.js` — Express en Render. Funciones/zonas clave: `getLatestState()` (merge blob+tabla), `executeActionOnState()`, `handleAutoRegister()`, `app.post('/api/telegram-webhook')` (categorización, espejo de transferencia, cancelar), endpoints `POST/PUT/DELETE /api/transaccion(/par/:id)`, `getSystemPrompt()` (inyecta TODO el estado — solo lo usan el chat web `/api/command` y comandos de voz; Jano NO los usa), helper `geminiGenerateContent()` (lista de modelos), `POST /api/data`.
- `db.js` (nuevo) — acceso a la tabla vía PostgREST/fetch: `dbGetTransacciones`, `dbInsert` (devuelve `null` si es duplicado por el índice UNIQUE), `dbInsertPair`, `dbUpdate`, `dbDelete`, `dbDeleteByTransfer`.

**Frontend (`public/`):**
- `js/state.js` (saveState sin transacciones, helpers `apiAdd/Update/Delete Transaccion`, `apiAddPar`), `js/main.js` (formularios/altas/transfer/pago recordatorio/meta), `js/ui/history.js` (editar/borrar), `js/ui/dashboard.js` (render de saldos y tarjetas), `js/calculations.js` (motor de saldos — el dashboard calcula deuda de tarjetas separando soles/US$, distinto del motor), `index.html` (sección "Próximos Pagos" oculta).

**Apps Script (pegar a mano en script.google.com, DOS proyectos):**
- `scripts_gmail/lector_jano.js` y `scripts_gmail/lector_andrea.js`. Función principal: `procesarCorreosMoni` (Jano) / `procesarCorreosMoniAndrea` (Andrea). Secretos en Script Properties: `GEMINI_API_KEY`, `MONI_API_URL`, `MONI_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

**Supabase:**
- Blob `moni_state` (id=1, columna `data` JSON) + tabla **`public.transacciones`** (RLS on, sin políticas, solo service_role). Columnas: id, fecha, tipo, categoria, descripcion, monto, moneda, cuenta_id, tarjeta_id, fijo, nro_operacion, transfer_id, banco_o_metodo, descripcion_original, telegram_message_id, created_at.

**Estructura de cuentas/tarjetas (clave para la lógica de transferencias y mapeo):**
- Cuentas (débito): id1 "BCP Jano" (titular "Yo"), id2 "BCP Andrea" (titular "Esposa"), id3 "Interbank Jano" (titular "Yo"). Sin campo `banco`; el titular es "Yo"/"Esposa", el NOMBRE contiene "Jano"/"Andrea".
- Tarjetas (crédito): id1 "CMR Falabella" (Yo/Esposa), id2 "Interbank Jano" (Yo), id3 "Interbank Andrea" (Esposa), id5 "Tarjeta BBVA" (Yo).

**Docs y respaldo:**
- Plan de la migración: `docs/superpowers/specs/2026-07-15-migracion-transacciones-tabla.md`
- Informe de la migración: `CAMBIOS-2026-07-16-migracion-transacciones.md`
- Backups del usuario: `~/Downloads/Moni_Backup_*.json`
- **Punto de rollback (antes de la migración):** commit `2ab9eca`. Rama `migracion-transacciones-tabla` fusionada (no borrada).
- Commits recientes en `main`: `454c3a4` (cancelar-reply + mensaje duplicado), `131181b` (flash-lite primero), `be45696` (fix espejo transferencias), `95b5abe` (ocultar Próximos Pagos).

---

## 6. Próximo paso concreto para arrancar la sesión nueva

1. **Verificar el fix de transferencias por Telegram** (ya desplegado, commit `be45696`): hacer una transferencia nueva y confirmar que crea **gasto + ingreso**. Si falla, revisar el bloque `[Transferencia Automática]` en `server.js` (webhook).
2. **Cuadrar la transferencia de S/715** que ya falló: agregar manualmente el INGRESO de S/715 a BCP Jano (categoría Transferencia) en la web.
3. **Probar la transferencia manual por el modal web** (aún no verificada por el usuario).
4. Decidir si se quiere el **borrado atómico** (enlazar las piernas de transferencia por `transfer_id`).
5. Opcionales cuando haya ganas: limpiar el fantasma de **US$ 23.12** (UPDATE en la tabla) y el fix de fondo del **re-envío de Telegram** (responder 200 antes de llamar a Gemini).

**Vigilancia pasiva:** confirmar el dedup con un duplicado real en el uso normal; conservar el backup pre-corte y la rama unos días antes de borrarlos.
