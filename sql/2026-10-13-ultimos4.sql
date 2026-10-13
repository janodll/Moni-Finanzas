-- Moni · Últimos 4 dígitos
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.
--
-- Por qué: el nombre del banco lo redacta la IA leyendo el correo, y se equivoca
-- cuando el banco tiene cuenta Y tarjeta (pasó 5 veces con "Interbank Jano").
-- Los 4 dígitos los escribe el banco: no se prestan a interpretación.
-- Guardarlos en la transacción permite además auditar después por qué una
-- operación cayó donde cayó, que hoy sólo se puede reconstruyendo a mano.

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS ultimos4 TEXT;

COMMENT ON COLUMN public.transacciones.ultimos4 IS
  'Últimos 4 dígitos de la tarjeta o cuenta que venían en el correo del banco. NULL si el correo no los mostraba.';
