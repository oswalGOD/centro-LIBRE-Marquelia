-- Centro LIBRE Marquelia: canalizaciones a instituciones (versión 0.37).
-- Ejecútelo una sola vez en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.
-- Requisito: haber ejecutado antes supabase/esquema.sql y supabase/blindaje.sql.
--
-- Igual que los casos, el contenido de cada canalización (institución, motivo, estatus, fechas, resultado) se cifra
-- en el dispositivo con la clave del perfil. Esta barrera adicional rechaza cualquier registro de «canalizaciones»
-- que no venga cifrado o que traiga campos de más. El catálogo «instituciones» es texto sin datos personales y no se restringe.
-- Es independiente de supabase/casos.sql: no modifica sus reglas.

begin;

do $$
begin
  if to_regprocedure('public.es_cuenta_del_centro()') is null then
    raise exception 'Primero ejecute supabase/blindaje.sql.';
  end if;
end $$;

create or replace function public.registros_exige_cifrado_canalizaciones()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  clave text;
begin
  if new.almacen <> 'canalizaciones' then
    return new;
  end if;

  if jsonb_typeof(new.datos) is distinct from 'object' then
    raise exception 'Registro de canalizaciones inválido: debe ser un objeto.';
  end if;

  for clave in select jsonb_object_keys(new.datos) loop
    if not (clave = any (array['id', 'perfilId', 'usuariaId', 'sobre', 'creado', 'actualizado', 'borrado'])) then
      raise exception 'Campo no permitido en canalizaciones: %. El contenido debe viajar cifrado.', clave;
    end if;
  end loop;

  if jsonb_typeof(new.datos -> 'sobre') is distinct from 'object'
     or jsonb_typeof(new.datos -> 'sobre' -> 'iv') is distinct from 'string'
     or jsonb_typeof(new.datos -> 'sobre' -> 'datos') is distinct from 'string'
     or jsonb_typeof(new.datos -> 'sobre' -> 'kid') is distinct from 'string' then
    raise exception 'Las canalizaciones deben incluir su contenido cifrado (sobre).';
  end if;

  return new;
end;
$$;

drop trigger if exists a_registros_exige_cifrado_canalizaciones on public.registros;
create trigger a_registros_exige_cifrado_canalizaciones
  before insert or update on public.registros
  for each row execute function public.registros_exige_cifrado_canalizaciones();

commit;
