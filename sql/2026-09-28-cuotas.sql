-- Moni · Compras en cuotas
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.
--
-- Por qué: los correos del banco dicen "Cuota 7/12", pero la tabla no tenía
-- dónde guardarlo. Sin eso Moni no puede distinguir una deuda comprometida a
-- meses (la moto) de un consumo normal que se paga solo el mes siguiente.

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS cuota_actual SMALLINT,
  ADD COLUMN IF NOT EXISTS cuota_total  SMALLINT;

COMMENT ON COLUMN public.transacciones.cuota_actual IS
  'Número de cuota que cobra este cargo (el 7 de "Cuota 7/12"). NULL si el cargo es por el total de la compra, como la moto en Cencosud.';
COMMENT ON COLUMN public.transacciones.cuota_total IS
  'Cantidad total de cuotas del plan (el 12 de "Cuota 7/12"). NULL si la compra no está en cuotas.';
