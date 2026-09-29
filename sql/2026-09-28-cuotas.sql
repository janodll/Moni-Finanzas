-- Moni · Compras en cuotas
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.
--
-- Por qué: los correos del banco dicen "Cuota 7/12", pero la tabla no tenía
-- dónde guardarlo. Sin eso Moni no puede distinguir una deuda comprometida a
-- meses (la moto) de un consumo normal que se paga solo el mes siguiente.

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS cuota_actual        SMALLINT,
  ADD COLUMN IF NOT EXISTS cuota_total         SMALLINT,
  ADD COLUMN IF NOT EXISTS cuota_es_total      BOOLEAN,
  ADD COLUMN IF NOT EXISTS cuota_confirmada_el DATE;

COMMENT ON COLUMN public.transacciones.cuota_total IS
  'Cuántas cuotas tiene el plan. NULL si la compra no está en cuotas.';
COMMENT ON COLUMN public.transacciones.cuota_actual IS
  'Cuántas cuotas van PAGADAS según la última confirmación del banco o de Jano. Nunca se deduce contando meses.';
COMMENT ON COLUMN public.transacciones.cuota_es_total IS
  'true = el monto de la fila es la compra entera (la moto: un cargo de 6995 en 12 cuotas). false/NULL = el monto es UNA cuota (Interbank cobrando "Cuota 7/12").';
COMMENT ON COLUMN public.transacciones.cuota_confirmada_el IS
  'Fecha en que se confirmó cuota_actual. Sirve para avisar que el dato está viejo en vez de estimarlo.';
