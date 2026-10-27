-- Centro LIBRE Marquelia: blindaje de la tabla de sincronización.
-- Antes: cualquier sesión autenticada podía leer y escribir.
-- Ahora: solo las cuentas de la lista `cuentas_permitidas`. Así, aunque alguien lograra
-- crear una cuenta en el proyecto (por ejemplo, si se activara el registro por error),
-- no vería ni podría cambiar ningún dato.
--
-- Cómo usarlo: en Supabase → SQL Editor → New query, pega este archivo, cambia el correo
-- de la línea marcada por el de la cuenta del Centro y toca Run. Es seguro volver a ejecutarlo.

begin;

create table if not exists public.cuentas_permitidas (
  email text primary key check (email = lower(email))
);
alter table public.cuentas_permitidas enable row level security;  -- sin políticas: nadie la lee desde la app
revoke all on public.cuentas_permitidas from anon, authenticated;

-- ▼ Cambia este correo por el de la cuenta del Centro (en minúsculas) ▼
insert into public.cuentas_permitidas (email) values ('correo-de-la-cuenta@ejemplo.com') on conflict do nothing;

do $$
begin
  if exists (select 1 from public.cuentas_permitidas where email = 'correo-de-la-cuenta@ejemplo.com') then
    raise exception 'Cambia el correo de ejemplo por el de la cuenta del Centro antes de ejecutar.';
  end if;
end $$;

create or replace function public.es_cuenta_del_centro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cuentas_permitidas
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.es_cuenta_del_centro() from public, anon;
grant execute on function public.es_cuenta_del_centro() to authenticated;

drop policy if exists "Cuenta del Centro lee" on public.registros;
create policy "Cuenta del Centro lee" on public.registros
  for select to authenticated using (public.es_cuenta_del_centro());

drop policy if exists "Cuenta del Centro agrega" on public.registros;
create policy "Cuenta del Centro agrega" on public.registros
  for insert to authenticated with check (public.es_cuenta_del_centro());

drop policy if exists "Cuenta del Centro actualiza" on public.registros;
create policy "Cuenta del Centro actualiza" on public.registros
  for update to authenticated using (public.es_cuenta_del_centro()) with check (public.es_cuenta_del_centro());

commit;
