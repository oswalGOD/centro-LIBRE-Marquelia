-- Centro LIBRE Marquelia: panel del desarrollador (panel.html), versión 0.13.
--
-- Qué hace:
--   · Crea la tabla `estado_dispositivos`, donde cada tableta deja su estado técnico al sincronizar
--     (versión, última sincronización, cambios por enviar, espacio, reloj y errores recientes).
--     No guarda nombres, CURP, firmas ni ningún otro dato de usuarias.
--   · Crea la lista `cuentas_desarrollo`: solo esas cuentas entran al panel.
--   · La cuenta de desarrollo NO puede leer ni cambiar la tabla `registros` (los datos del Centro):
--     ese permiso sigue siendo solo de las cuentas de `cuentas_permitidas` (blindaje.sql).
--
-- Cómo usarlo:
--   1. Supabase → Authentication → Users → Add user → Create new user: crea TU cuenta de desarrollo
--      con un correo DISTINTO al de la cuenta del Centro y marca «Auto Confirm User».
--   2. Supabase → SQL Editor → New query: pega este archivo, cambia el correo de la línea marcada
--      por el de tu cuenta de desarrollo y toca Run. Es seguro volver a ejecutarlo.
-- Requiere haber ejecutado antes esquema.sql y blindaje.sql.

begin;

-- ---------- Quién es desarrollador ----------
create table if not exists public.cuentas_desarrollo (
  email text primary key check (email = lower(email))
);
alter table public.cuentas_desarrollo enable row level security;  -- sin políticas: nadie la lee desde la app
revoke all on public.cuentas_desarrollo from anon, authenticated;

-- ▼ Cambia este correo por el de tu cuenta de desarrollo (en minúsculas) ▼
insert into public.cuentas_desarrollo (email) values ('correo-del-desarrollador@ejemplo.com') on conflict do nothing;

do $$
begin
  if exists (select 1 from public.cuentas_desarrollo where email = 'correo-del-desarrollador@ejemplo.com') then
    raise exception 'Cambia el correo de ejemplo por el de tu cuenta de desarrollo antes de ejecutar.';
  end if;
  if exists (select 1 from public.cuentas_desarrollo d join public.cuentas_permitidas p using (email)) then
    raise exception 'La cuenta de desarrollo no puede ser la misma que la cuenta del Centro: crea otra con un correo distinto.';
  end if;
end $$;

create or replace function public.es_cuenta_desarrollo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cuentas_desarrollo
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.es_cuenta_desarrollo() from public, anon;
grant execute on function public.es_cuenta_desarrollo() to authenticated;

-- ---------- Estado técnico de cada tableta ----------
create table if not exists public.estado_dispositivos (
  dispositivo  text        primary key,          -- identificador interno del dispositivo
  id_corto     text,                              -- letra del folio (A, B, C…)
  estado       jsonb       not null,              -- versión, sincronización, espacio, reloj, errores…
  reportado    timestamptz not null default now() -- hora del servidor del último reporte
);
alter table public.estado_dispositivos enable row level security;
revoke all on public.estado_dispositivos from anon, authenticated;
-- La tabla solo se toca con las funciones de abajo, que revisan quién llama.

-- Las tabletas (cuenta del Centro) reportan su estado. Máximo 64 KB por reporte.
create or replace function public.reportar_estado(p_dispositivo text, p_id_corto text, p_estado jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_cuenta_del_centro() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if length(coalesce(p_dispositivo, '')) not between 1 and 64 or length(coalesce(p_id_corto, '')) > 4
     or jsonb_typeof(p_estado) <> 'object' or pg_column_size(p_estado) > 65536 then
    raise exception 'Reporte no válido' using errcode = '22023';
  end if;
  insert into public.estado_dispositivos (dispositivo, id_corto, estado, reportado)
  values (p_dispositivo, p_id_corto, p_estado, now())
  on conflict (dispositivo) do update set id_corto = excluded.id_corto, estado = excluded.estado, reportado = now();
end;
$$;
revoke all on function public.reportar_estado(text, text, jsonb) from public, anon;
grant execute on function public.reportar_estado(text, text, jsonb) to authenticated;

-- El panel lee todo lo técnico de una vez: tabletas, conteos de la nube (solo números) y espacio usado.
create or replace function public.resumen_panel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_cuenta_desarrollo() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hora_servidor', now(),
    'base_bytes', pg_database_size(current_database()),
    'registros_bytes', pg_total_relation_size('public.registros'),
    'dispositivos', coalesce((
      select jsonb_agg(jsonb_build_object('dispositivo', dispositivo, 'id_corto', id_corto, 'estado', estado, 'reportado', reportado) order by id_corto, dispositivo)
      from public.estado_dispositivos), '[]'::jsonb),
    'conteos', coalesce((
      select jsonb_object_agg(almacen, jsonb_build_object('vigentes', vigentes, 'borrados', borrados, 'ultimo', ultimo))
      from (select almacen, count(*) filter (where not borrado) as vigentes, count(*) filter (where borrado) as borrados, max(recibido) as ultimo
            from public.registros group by almacen) c), '{}'::jsonb),
    'por_dispositivo', coalesce((
      select jsonb_object_agg(coalesce(dispositivo, '?'), jsonb_build_object('cambios', cambios, 'ultimo', ultimo))
      from (select dispositivo, count(*) as cambios, max(recibido) as ultimo from public.registros group by dispositivo) d), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.resumen_panel() from public, anon;
grant execute on function public.resumen_panel() to authenticated;

-- Quitar del panel una tableta que ya no se usa (no toca sus datos; si vuelve a sincronizar, reaparece).
create or replace function public.olvidar_dispositivo(p_dispositivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_cuenta_desarrollo() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  delete from public.estado_dispositivos where dispositivo = p_dispositivo;
end;
$$;
revoke all on function public.olvidar_dispositivo(text) from public, anon;
grant execute on function public.olvidar_dispositivo(text) to authenticated;

commit;
