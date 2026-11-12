-- Centro LIBRE Marquelia: almacenamiento privado de las evidencias fotográficas (versión 0.16).
-- Ejecútelo una sola vez en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.
-- Requisito: haber ejecutado antes supabase/blindaje.sql (usa la función es_cuenta_del_centro()).
--
-- Crea un bucket privado «evidencias» (límite de 2 MB por archivo, solo imágenes JPEG) y deja que
-- únicamente la cuenta del Centro lea, agregue, cambie o elimine archivos. No toca los datos existentes.
-- Las fotografías ocupan unos 150 a 300 KB cada una; el plan gratuito incluye 1 GB de archivos.

begin;

do $$
begin
  if to_regprocedure('public.es_cuenta_del_centro()') is null then
    raise exception 'Primero ejecute supabase/blindaje.sql.';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "Evidencias: la cuenta del Centro lee" on storage.objects;
create policy "Evidencias: la cuenta del Centro lee" on storage.objects
  for select to authenticated using (bucket_id = 'evidencias' and public.es_cuenta_del_centro());

drop policy if exists "Evidencias: la cuenta del Centro agrega" on storage.objects;
create policy "Evidencias: la cuenta del Centro agrega" on storage.objects
  for insert to authenticated with check (bucket_id = 'evidencias' and public.es_cuenta_del_centro());

drop policy if exists "Evidencias: la cuenta del Centro actualiza" on storage.objects;
create policy "Evidencias: la cuenta del Centro actualiza" on storage.objects
  for update to authenticated using (bucket_id = 'evidencias' and public.es_cuenta_del_centro())
  with check (bucket_id = 'evidencias' and public.es_cuenta_del_centro());

drop policy if exists "Evidencias: la cuenta del Centro elimina" on storage.objects;
create policy "Evidencias: la cuenta del Centro elimina" on storage.objects
  for delete to authenticated using (bucket_id = 'evidencias' and public.es_cuenta_del_centro());

commit;
