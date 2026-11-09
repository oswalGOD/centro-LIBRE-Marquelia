-- Centro LIBRE Marquelia: ajuste de la versión 0.11.
-- Fija el search_path de la función que decide qué cambio gana, como recomienda Supabase
-- (aviso «Function Search Path Mutable» del Security Advisor). No cambia datos ni permisos.
-- Ejecútalo una vez en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.

alter function public.registros_ultimo_gana() set search_path = '';
