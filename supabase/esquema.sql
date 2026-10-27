-- Centro LIBRE Marquelia: tabla de sincronización.
-- Ejecútalo una sola vez en Supabase → SQL Editor → New query → Run.
-- Es seguro volver a ejecutarlo: no borra datos.

-- Todos los registros de la app (usuarias, personas, actividades, asistencias)
-- en una sola tabla. Cada fila es un registro tal como se guarda en el dispositivo.
create table if not exists public.registros (
  almacen      text        not null,              -- usuarias (perfiles) | personas | actividades | asistencias
  id           text        not null,
  datos        jsonb       not null,              -- el registro completo
  actualizado  bigint      not null,              -- hora del cambio en el dispositivo (ms)
  borrado      boolean     not null default false,
  dispositivo  text,                               -- dispositivo que hizo el último cambio
  recibido     timestamptz not null default clock_timestamp(),  -- hora del servidor
  primary key (almacen, id)
);

create index if not exists registros_recibido on public.registros (recibido);

-- Si dos dispositivos cambian el mismo registro, gana el cambio más reciente.
-- Un cambio más viejo que el guardado se ignora.
create or replace function public.registros_ultimo_gana()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.actualizado < old.actualizado then
    return old;
  end if;
  new.recibido := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists registros_ultimo_gana on public.registros;
create trigger registros_ultimo_gana
  before insert or update on public.registros
  for each row execute function public.registros_ultimo_gana();

-- Solo la cuenta del Centro (sesión autenticada) puede leer y escribir.
-- La clave pública (anon) sola no da acceso a nada.
alter table public.registros enable row level security;

drop policy if exists "Cuenta del Centro lee" on public.registros;
create policy "Cuenta del Centro lee" on public.registros
  for select to authenticated using (true);

drop policy if exists "Cuenta del Centro agrega" on public.registros;
create policy "Cuenta del Centro agrega" on public.registros
  for insert to authenticated with check (true);

drop policy if exists "Cuenta del Centro actualiza" on public.registros;
create policy "Cuenta del Centro actualiza" on public.registros
  for update to authenticated using (true) with check (true);

revoke all on public.registros from anon;
grant select, insert, update on public.registros to authenticated;
