-- Centro LIBRE Marquelia: cambio de nombres de la versión 0.5.
-- Ejecútalo una sola vez en Supabase → SQL Editor → New query → Run,
-- después de actualizar la app a la versión 0.5 en todos los dispositivos.
-- Es seguro volver a ejecutarlo.
--
--   usuarias (integrantes del Centro)  →  perfiles
--   personas (quienes usan los servicios)  →  usuarias
--   asistencias.personaId  →  asistencias.usuariaId

begin;

-- Si un dispositivo ya actualizado envió el mismo registro con el nombre nuevo, se queda ese.
delete from public.registros v
 where v.almacen = 'usuarias' and v.datos ? 'pin'
   and exists (select 1 from public.registros n where n.almacen = 'perfiles' and n.id = v.id);
update public.registros set almacen = 'perfiles'
 where almacen = 'usuarias' and datos ? 'pin';

delete from public.registros v
 where v.almacen = 'personas'
   and exists (select 1 from public.registros n where n.almacen = 'usuarias' and n.id = v.id);
update public.registros set almacen = 'usuarias'
 where almacen = 'personas';

update public.registros
   set datos = (datos - 'personaId') || jsonb_build_object('usuariaId', datos -> 'personaId')
 where almacen = 'asistencias' and datos ? 'personaId';

commit;
