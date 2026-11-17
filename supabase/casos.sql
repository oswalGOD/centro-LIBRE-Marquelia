-- Centro LIBRE Marquelia: seguimiento de casos confidenciales (versión 0.27).
-- Ejecútelo una sola vez en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.
-- Requisito: haber ejecutado antes supabase/esquema.sql y supabase/blindaje.sql.
--
-- IMPORTANTE: todos los dispositivos entran a Supabase con la MISMA cuenta del Centro, así que el servidor
-- no puede distinguir a la Asesora Psicoemocional de la Asesora Jurídica ni de la Coordinadora. Por eso la privacidad por perfil
-- no depende de reglas del servidor, sino de cifrado en el propio dispositivo: el contenido de cada caso y
-- de cada nota se cifra con una clave propia de cada perfil (protegida con su PIN) y solo se guarda cifrado.
-- Este script agrega una barrera adicional en el servidor: rechaza cualquier registro de casos o de notas
-- que no venga cifrado o que traiga campos de más, de modo que ni un error de la aplicación ni una versión
-- vieja pueda dejar texto legible en la nube. No toca los datos existentes.

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
  if new.almacen not in ('casos', 'notasCaso') then
    return new;
  end if;

  if jsonb_typeof(new.datos) is distinct from 'object' then
    raise exception 'Registro de % inválido: debe ser un objeto.', new.almacen;
  end if;

  -- Solo estructura (identificadores y fechas de control) y el sobre cifrado.
  permitidos := case new.almacen
    when 'casos' then array['id', 'perfilId', 'usuariaId', 'sobre', 'creado', 'actualizado', 'borrado']
    else array['id', 'casoId', 'perfilId', 'sobre', 'creado', 'actualizado', 'borrado']
  end;

  for clave in select jsonb_object_keys(new.datos) loop
    if not (clave = any (permitidos)) then
      raise exception 'Campo no permitido en %: %. El contenido de los casos debe viajar cifrado.', new.almacen, clave;
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

-- Se llama «a_...» para que se ejecute antes que registros_ultimo_gana (los disparadores corren en orden alfabético).
drop trigger if exists a_registros_exige_cifrado on public.registros;
create trigger a_registros_exige_cifrado
  before insert or update on public.registros
  for each row execute function public.registros_exige_cifrado();

commit;
