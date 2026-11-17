-- ============================================================================
-- Reporte de Horarios · migración 0011: número de llegada por cédula
--
-- El panel de administración atiende por orden de llegada: la primera cédula
-- que reportó es la #1 y conserva ese número PARA SIEMPRE: no avanza cuando se
-- resuelven tickets, no cambia si la cédula vuelve a reportar y tampoco se
-- renumera si se borra o se importa un reporte.
--
-- Por eso el número se guarda (tabla cedula_llegadas) en vez de recalcularse.
-- Un trigger lo asigna cuando entra el primer reporte de una cédula; el
-- candado asesor serializa solo el alta de cédulas nuevas, así que no hay
-- números repetidos ni huecos aunque lleguen dos reportes a la vez.
--
-- La vista reportes_con_llegada se conserva (ci, numero_llegada) para que la
-- API no cambie. Solo la lee service_role, igual que el resto del esquema.
--
-- Es idempotente: se puede ejecutar encima de 0001–0010 o repetirla. Si ya se
-- ejecutó la versión anterior (vista calculada), la reemplaza sin perder nada.
-- ============================================================================

create table if not exists public.cedula_llegadas (
  ci        text primary key,
  numero    integer not null unique check (numero > 0),
  creado_en timestamptz not null default now()
);

comment on table public.cedula_llegadas is
  'Número de llegada fijo de cada cédula (1 = primera en reportar).';

alter table public.cedula_llegadas enable row level security;
revoke all on public.cedula_llegadas from public, anon, authenticated;
grant select on public.cedula_llegadas to service_role;

-- Asigna el número en el primer reporte de cada cédula.
create or replace function public.asignar_llegada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Camino rápido: la cédula ya tiene número (casi todos los reportes).
  if exists (select 1 from public.cedula_llegadas where ci = new.ci) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.cedula_llegadas'));

  insert into public.cedula_llegadas (ci, numero)
  select new.ci, coalesce(max(numero), 0) + 1
    from public.cedula_llegadas
  on conflict (ci) do nothing;

  return new;
end;
$$;

revoke all on function public.asignar_llegada() from public, anon, authenticated;

drop trigger if exists reportes_asignar_llegada on public.reportes;
create trigger reportes_asignar_llegada
  after insert on public.reportes
  for each row execute function public.asignar_llegada();

-- Relleno inicial: las cédulas que ya reportaron reciben su número según la
-- fecha de su primer reporte (la cédula desempata un mismo instante).
do $$
begin
  perform pg_advisory_xact_lock(hashtext('public.cedula_llegadas'));

  insert into public.cedula_llegadas (ci, numero, creado_en)
  select p.ci,
         (select coalesce(max(numero), 0) from public.cedula_llegadas)
           + row_number() over (order by p.primera_vez, p.ci),
         p.primera_vez
    from (
      select ci, min(creado_en) as primera_vez
        from public.reportes
       group by ci
    ) p
   where not exists (
     select 1 from public.cedula_llegadas l where l.ci = p.ci
   );
end;
$$;

-- Se recrea para que el nombre y las columnas sigan siendo los que usa la API.
drop view if exists public.reportes_con_llegada;
create view public.reportes_con_llegada as
select ci, numero as numero_llegada
  from public.cedula_llegadas;

comment on view public.reportes_con_llegada is
  'Número de llegada de cada cédula (1 = primera cédula en reportar; fijo).';

revoke all on public.reportes_con_llegada from public, anon, authenticated;
grant select on public.reportes_con_llegada to service_role;

notify pgrst, 'reload schema';
