-- Centro LIBRE Marquelia: agenda de citas individuales (versión 0.37).
-- Ejecútelo una sola vez en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.
-- Requisito: haber ejecutado antes supabase/esquema.sql y supabase/blindaje.sql (y, si ya lo hizo, supabase/casos.sql).
--
-- Igual que en el seguimiento de casos, todos los dispositivos entran con la MISMA cuenta de Supabase: la privacidad
-- por perfil se logra cifrando en el dispositivo. En las citas viajan en claro solo los datos que la agenda necesita
-- para ordenar y contar (perfil, usuaria, fecha, hora, duración, estado y enlaces entre citas); el motivo y el lugar
-- viajan cifrados dentro de «sobre». Este script rechaza citas con campos de más o sin su contenido cifrado, para que
-- ni un error ni una versión vieja de la aplicación dejen texto legible en la nube. No toca los datos existentes.
--
-- Nota: este script reemplaza la función registros_exige_cifrado de casos.sql por una que también vigila las citas
-- (sigue vigilando casos y notas igual que antes), así que puede ejecutarse antes o después de casos.sql.

begin;

do $$
begin
  if to_regprocedure('public.es_cuenta_del_centro()') is null then
    raise exception 'Primero ejecute supabase/blindaje.sql.';
  end if;
end $$;

create or replace function public.registros_exige_cifrado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  permitidos text[];
  clave text;
begin
  if new.almacen not in ('casos', 'notasCaso', 'citas') then
    return new;
  end if;

  if jsonb_typeof(new.datos) is distinct from 'object' then
    raise exception 'Registro de % inválido: debe ser un objeto.', new.almacen;
  end if;

  permitidos := case new.almacen
    when 'casos' then array['id', 'perfilId', 'usuariaId', 'sobre', 'creado', 'actualizado', 'borrado']
    when 'notasCaso' then array['id', 'casoId', 'perfilId', 'sobre', 'creado', 'actualizado', 'borrado']
    else array['id', 'perfilId', 'usuariaId', 'fecha', 'hora', 'duracion', 'estado', 'casoId', 'reprogramadaDe', 'reprogramadaA', 'agendadaPor', 'sobre', 'creado', 'actualizado', 'borrado']
  end;

  for clave in select jsonb_object_keys(new.datos) loop
    if not (clave = any (permitidos)) then
      raise exception 'Campo no permitido en %: %. El contenido debe viajar cifrado.', new.almacen, clave;
    end if;
  end loop;

  if jsonb_typeof(new.datos -> 'sobre') is distinct from 'object'
     or jsonb_typeof(new.datos -> 'sobre' -> 'iv') is distinct from 'string'
     or jsonb_typeof(new.datos -> 'sobre' -> 'datos') is distinct from 'string'
     or jsonb_typeof(new.datos -> 'sobre' -> 'kid') is distinct from 'string' then
    raise exception 'Los registros de % deben incluir su contenido cifrado (sobre).', new.almacen;
  end if;

  return new;
end;
$$;

drop trigger if exists a_registros_exige_cifrado on public.registros;
create trigger a_registros_exige_cifrado
  before insert or update on public.registros
  for each row execute function public.registros_exige_cifrado();

commit;
