# Registro de Cambios — Sesión de Auditoría y Mejoras v6
**Fecha:** 2026-06-09
**Origen:** Hallazgos de AUDITORIA_v6.md + mejoras UX acordadas
**Magnitud:** 15 archivos modificados (+675/−170 líneas) y 4 archivos nuevos
**Estado:** Sin commitear — pendiente de prueba manual y commit del usuario

---

## 1. Hallazgos de seguridad corregidos

### SEC-04 — XSS almacenado (Alta)
Se aplicó `escapeHTML()` a todo dato dinámico inyectado vía `innerHTML`:
descripciones y categorías de transacciones, nombres y titulares de cuentas/tarjetas,
nombres de recordatorios/metas/categorías, clientes y descripciones freelance,
título y mensaje de todos los toasts (incluye respuestas de la IA), texto del usuario
en el chat del palette y en las sugerencias dinámicas.
**Archivos:** `components.js`, `dashboard.js`, `history.js`, `settings.js`, `reports.js`, `client.js`

### SEC-05 — Exposición en red local (Alta)
- El servidor ahora escucha solo en `127.0.0.1` (configurable con `HOST=0.0.0.0` para despliegues remotos).
- El token fallback hardcodeado se reemplazó por uno aleatorio por arranque (`crypto.randomUUID()`), impreso en la consola del servidor. Para producción se define `LOCAL_API_TOKEN` fijo.
**Archivo:** `server.js`

---

## 2. Bugs corregidos

| ID | Descripción | Archivo |
|---|---|---|
| BUG-04 | `ReferenceError: palette is not defined` rompía la ejecución de comandos locales sin IA y dejaba el palette abierto | `client.js` |
| BUG-05 | La transferencia por NLP ignoraba la cuenta de origen (siempre salía de la 1ª cuenta). Ahora parsea "de X a Y" con nombres completos, respeta la cuenta detectada y rechaza origen = destino | `client.js` |
| BUG-06 | Pagar un recordatorio de tarjeta sin `tarjeta_id` abonaba silenciosamente a la tarjeta id 1 (CMR). Ahora rechaza y pide usar el flujo manual | `client.js` |
| BUG-07 | El NLP podía crear transacciones con `cuenta_id` Y `tarjeta_id` simultáneos (doble contabilización). Ahora son excluyentes (prevalece la tarjeta) | `client.js` |
| RIESGO-01 | `express.json()` limitado a 100 KB: al crecer `datos.json` el guardado fallaría en silencio. Límite ampliado a 10 MB | `server.js` |
| RIESGO-02 | Escritura no atómica y backup de una sola generación. Ahora: escritura a `.tmp` + rename atómico, y backups rotativos `.backup.1/.2/.3` (con `.gitignore` actualizado) | `server.js`, `.gitignore` |
| TEST-01 | La suite dependía de la fecha real (fallaría desde julio 2026). `calculateBalances(state, monthStr)` acepta mes opcional; el test usa mes fijo | `calculations.js`, `tests/` |

---

## 3. Mejoras UX — Quick wins

- **Modales propios** (`showConfirmModal`, `showInputModal` en `components.js`): se eliminaron todos los `confirm()` y `prompt()` nativos. Confirmaciones destructivas con cascada (categorías, cuentas, tarjetas, reinicio de BD) usan modal con el estilo de la app; el token de acceso se pide en modal con campo de contraseña.
- **Borrado con "Deshacer"** (`showUndoToast`): eliminar transacciones, recordatorios, metas, presupuestos y cobros es inmediato y reversible por 6 segundos.
- **Color por signo:** el balance general y los saldos de cuentas se muestran en rojo cuando son negativos.
- **Recordatorios vencidos:** badge "Vencido" y fecha en rojo cuando `fecha_vencimiento` ya pasó.
- **Totales del filtro:** el historial muestra `Total filtrado: +S/. X / -S/. Y` junto al conteo de registros (en soles, convirtiendo las tx en US$).

---

## 4. Mejoras funcionales

### Filtro por periodo en el historial
Selector con: Todo, Este mes, Mes pasado, Últimos 3 meses, Este año y Rango personalizado (dos date pickers). Se combina con búsqueda, tipo, categoría y cuenta.
**Archivos:** `index.html`, `history.js`

### Multi-moneda explícita (S/. | US$)
- Selector de moneda junto al monto en el formulario de transacción; el campo `moneda` se persiste en cada transacción.
- Las tx en US$ se almacenan en dólares y se convierten con `tipo_cambio_usd` en **todos** los cálculos: balance, saldos, deudas, agregados mensuales, gráficos, presupuestos y reportes (`getMontoEnSoles()` en `calculations.js`).
- Las tablas muestran el símbolo real de cada transacción; el CSV exporta columna "Moneda".
- Retrocompatible: tx antiguas sin campo se asumen en soles; el parsing legacy de descripciones (`$/USD`) se mantiene como fallback en el desglose de tarjetas.
- El prompt de la IA (local y servidor) ahora especifica el campo `moneda` para comandos como "gasté 20 dólares".
**Archivos:** `calculations.js`, `main.js`, `history.js`, `dashboard.js`, `reports.js`, `client.js`, `prompt.js`, `server.js`, `index.html`

### Transferencias vinculadas (`transfer_id`)
- Ambas piernas de una transferencia (manual o por IA/NLP) comparten un `transfer_id`.
- Borrar una pierna elimina el par completo (con Deshacer que restaura ambas).
- La edición individual de una pierna está bloqueada con aviso, para no descuadrar cuentas.
**Archivos:** `main.js`, `client.js`, `history.js`

### PWA instalable
- `public/manifest.json` (standalone, theme indigo, español).
- `public/sw.js`: service worker network-first con fallback offline; nunca cachea `/api/` ni orígenes externos.
- Iconos `icons/icon-192.png` y `icon-512.png` generados.
- Registro del SW en `main.js` (solo sobre http/https) y metas PWA en `index.html`.
- Requiere el deploy https de Netlify para probarse en el celular ("Añadir a pantalla de inicio").

---

## 5. Verificación realizada

| Verificación | Resultado |
|---|---|
| Sintaxis (`node --check`) en los 12 módulos JS + server + sw | ✅ Sin errores |
| Suite de tests (ampliada con 2 tests multi-moneda) | ✅ 5/5 pasan |
| Conversión USD (10 US$ a TC 4.0 = 40 soles; deuda tarjeta 25 US$ = 100) | ✅ Correcta |
| Balance real con `datos.json` (142 tx, sin campo moneda) | ✅ Sin cambios: S/. -6,228.13 |
| Smoke test servidor: bind 127.0.0.1, token aleatorio, 401/200 | ✅ Correcto |
| Guardado atómico: 4 POST seguidos → rotación `.backup.1/.2/.3`, sin `.tmp` residual, JSON íntegro | ✅ Correcto |
| `manifest.json` y `sw.js` servidos (HTTP 200) y manifest JSON válido | ✅ Correcto |

---

## 6. Pendientes sugeridos (no incluidos en esta sesión)

Observaciones de diseño de AUDITORIA_v6 (OBS-04 a OBS-14), entre ellas: tratamiento contable de los aportes a metas (hoy cuentan como egreso), recordatorios "Pagado" huérfanos en `datos.json`, drift de `addOneMonth` en meses cortos, validación de referencias al borrar cuentas/tarjetas, y mejoras UX de segunda ola (dark mode, dona clickeable, vista móvil de cards, accesibilidad).

---

*Generado con Claude — Sesión de auditoría y mejoras v6.*
