-- Centro LIBRE Marquelia: verificación pública de constancias (versión 0.40).
-- Ejecútelo una sola vez en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.
-- Requisito: haber ejecutado antes supabase/esquema.sql y supabase/blindaje.sql.
--
-- Cada constancia lleva un código aleatorio de 12 caracteres (60 bits, no se puede adivinar) y un QR que abre verificar.html.
-- Esta tabla guarda SOLO lo que la página pública muestra: nombre, curso, fecha, duración y folio.
-- Nunca CURP, teléfono, firma ni otros datos. Nadie lee la tabla directamente (seguridad por fila sin políticas):
--   · publicar_constancias(...)   la usa la cuenta del Centro al sincronizar, para registrar o anular constancias.
--   · verificar_constancia(...)   la usa cualquiera con el código; devuelve una sola constancia o nada.
-- No modifica la tabla «registros» ni sus reglas.

begin;

do $$
begin
  if to_regprocedure('public.es_cuenta_del_centro()') is null then
    raise exception 'Primero ejecute supabase/blindaje.sql.';
  end if;
end $$;

create table if not exists public.constancias_emitidas (
  codigo     text primary key check (codigo ~ '^[A-HJ-NP-Z2-9]{12}$'),
  nombre     text not null check (char_length(nombre) between 1 and 200),
  curso      text not null check (char_length(curso) between 1 and 300),
  fecha      date not null,
  horas      numeric not null check (horas > 0 and horas < 1000),
  folio      text not null check (char_length(folio) between 1 and 60),
  anulada    boolean not null default false,
  emitida    timestamptz not null default now(),
  actualizada timestamptz not null default now()
);

alter table public.constancias_emitidas enable row level security;  -- sin políticas: no se lee ni se escribe directamente
revoke all on public.constancias_emitidas from public, anon, authenticated;

-- Registra o actualiza constancias. Cada elemento: { codigo, nombre, curso, fecha, horas, folio } o { codigo, anulada: true }.
create or replace function public.publicar_constancias(p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  n integer := 0;
begin
  if not public.es_cuenta_del_centro() then
    raise exception 'Solo la cuenta del Centro puede registrar constancias.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) > 500 then
    raise exception 'Lista de constancias inválida.';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    if coalesce((f ->> 'anulada')::boolean, false) then
      update public.constancias_emitidas set anulada = true, actualizada = now() where codigo = f ->> 'codigo';
    else
      insert into public.constancias_emitidas (codigo, nombre, curso, fecha, horas, folio)
      values (f ->> 'codigo', f ->> 'nombre', f ->> 'curso', (f ->> 'fecha')::date, (f ->> 'horas')::numeric, f ->> 'folio')
      on conflict (codigo) do update
        set nombre = excluded.nombre, curso = excluded.curso, fecha = excluded.fecha,
            horas = excluded.horas, folio = excluded.folio, anulada = false, actualizada = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.publicar_constancias(jsonb) from public, anon;
grant execute on function public.publicar_constancias(jsonb) to authenticated;

-- Consulta pública por código. Devuelve null si no existe.
create or replace function public.verificar_constancia(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('nombre', c.nombre, 'curso', c.curso, 'fecha', c.fecha, 'horas', c.horas, 'folio', c.folio, 'anulada', c.anulada)
  from public.constancias_emitidas c
  where c.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
revoke all on function public.verificar_constancia(text) from public;
grant execute on function public.verificar_constancia(text) to anon, authenticated;

commit;
