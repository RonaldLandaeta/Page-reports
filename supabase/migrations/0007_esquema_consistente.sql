-- ============================================================================
-- Reporte de Horarios · migración 0007: esquema tipado y consistente
--
-- Objetivo: que la base de datos y lib/supabase/types.ts describan exactamente
-- lo mismo. Convierte las columnas de estado y tipo de error a enums nativos
-- (adiós a los CHECK duplicados y a los `as any`), agrega el evento inicial al
-- historial y deja un ticket por defecto generado en Postgres.
--
-- Es idempotente: se puede ejecutar encima de 0001–0006 (o repetirla).
-- ============================================================================

-- 1) Enums -------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_type
     where typname = 'estado_reporte'
       and typnamespace = 'public'::regnamespace
  ) then
    create type public.estado_reporte as enum (
      'pendiente',
      'en-revision',
      'resuelto'
    );
  end if;

  if not exists (
    select 1
      from pg_type
     where typname = 'tipo_error_reporte'
       and typnamespace = 'public'::regnamespace
  ) then
    create type public.tipo_error_reporte as enum (
      'error-prerrequisito',
      'error-correquisito',
      'reserva-cerrada',
      'cruce-horario',
      'cambio-horario',
      'otro'
    );
  end if;
end;
$$;

comment on type public.estado_reporte is
  'Estado de un reporte. Coincide con EstadoReporte en lib/types.ts.';
comment on type public.tipo_error_reporte is
  'Tipo de error reportado. Coincide con TipoError en lib/types.ts.';

-- 2) Normalizar datos del esquema anterior antes de convertir tipos ----------
-- (Solo aplica si tipo_error todavía es text; 0006 ya lo hizo, pero así 0007
-- también funciona en bases que solo tenían 0001–0005.)
do $$
declare
  v_tipo text;
begin
  select data_type
    into v_tipo
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'reportes'
     and column_name = 'tipo_error';

  if v_tipo = 'text' then
    update public.reportes
       set tipo_error = case tipo_error
             when 'horario-incorrecto' then 'cambio-horario'
             when 'cruce-materias'     then 'cruce-horario'
             when 'aula-incorrecta'    then 'otro'
             when 'docente-incorrecto' then 'otro'
             else tipo_error
           end
     where tipo_error in (
       'horario-incorrecto',
       'aula-incorrecta',
       'docente-incorrecto',
       'cruce-materias'
     );
  end if;
end;
$$;

-- 3) Quitar CHECKs y triggers que dependen de las columnas a convertir -------
alter table public.reportes
  drop constraint if exists reportes_estado_valido;
alter table public.reportes
  drop constraint if exists reportes_tipo_error_valido;
alter table public.reportes
  drop constraint if exists reportes_tipo_error_detalle_coherente;

-- Postgres no permite cambiar el tipo de una columna usada por un trigger
-- (`after update of estado`). Se recrean al final del bloque 4.
drop trigger if exists reportes_registrar_cambio_estado on public.reportes;
drop trigger if exists reportes_tocar_actualizado_en on public.reportes;
drop trigger if exists reportes_registrar_evento_inicial on public.reportes;

-- 4) Convertir columnas text → enum ------------------------------------------
alter table public.reportes
  alter column estado drop default;

alter table public.reportes
  alter column estado type public.estado_reporte
  using estado::text::public.estado_reporte;

alter table public.reportes
  alter column tipo_error type public.tipo_error_reporte
  using tipo_error::text::public.tipo_error_reporte;

alter table public.reporte_eventos
  alter column estado_anterior type public.estado_reporte
  using estado_anterior::text::public.estado_reporte;

alter table public.reporte_eventos
  alter column estado_nuevo type public.estado_reporte
  using estado_nuevo::text::public.estado_reporte;

alter table public.reportes
  alter column estado set default 'pendiente'::public.estado_reporte;

-- El enum ya garantiza los valores: no hace falta reportes_estado_valido ni
-- reportes_tipo_error_valido. Solo se conserva la coherencia del detalle.
alter table public.reportes
  add constraint reportes_tipo_error_detalle_coherente check (
    (tipo_error = 'otro' and char_length(btrim(tipo_error_detalle)) >= 1)
    or (tipo_error <> 'otro' and tipo_error_detalle = '')
  );

-- Recrear los triggers que se quitaron antes de cambiar los tipos.
drop trigger if exists reportes_tocar_actualizado_en on public.reportes;
create trigger reportes_tocar_actualizado_en
  before update on public.reportes
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists reportes_registrar_cambio_estado on public.reportes;
create trigger reportes_registrar_cambio_estado
  after update of estado on public.reportes
  for each row execute function public.registrar_cambio_estado();

-- 5) Ticket único generado también por Postgres ------------------------------
-- La API sigue generando el ticket; este default es la red de seguridad para
-- inserciones manuales o futuras integraciones. El formato se mantiene.
create sequence if not exists public.reportes_ticket_seq
  as bigint
  start with 1
  increment by 1
  no cycle;

alter table public.reportes
  alter column ticket set default (
    'TK-' ||
    lpad(((nextval('public.reportes_ticket_seq') % 900000) + 100000)::text, 6, '0')
  );

comment on sequence public.reportes_ticket_seq is
  'Secuencia de respaldo para generar tickets TK-XXXXXX cuando no los envía la API.';

-- 6) Historial: todo reporte nace con su evento inicial ----------------------
-- Reportes antiguos que quedaron sin historial (la API insertaba directo).
insert into public.reporte_eventos (
  reporte_id, estado_anterior, estado_nuevo, nota
)
select r.id, null, r.estado, 'Historial reconstruido'
  from public.reportes r
 where not exists (
   select 1 from public.reporte_eventos e where e.reporte_id = r.id
 );

create or replace function public.registrar_evento_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reporte_eventos (
    reporte_id, estado_anterior, estado_nuevo, nota
  )
  values (new.id, null, new.estado, 'Reporte creado');

  return new;
end;
$$;

drop trigger if exists reportes_registrar_evento_inicial on public.reportes;
create trigger reportes_registrar_evento_inicial
  after insert on public.reportes
  for each row execute function public.registrar_evento_inicial();

-- Evita duplicados si se ejecuta esta migración dos veces.
delete from public.reporte_eventos e
 where e.estado_anterior is null
   and e.nota = 'Reporte creado'
   and exists (
     select 1
       from public.reporte_eventos anterior
      where anterior.reporte_id = e.reporte_id
        and anterior.id < e.id
   );

-- 7) cambiar_estado_reporte con el enum y quién hizo el cambio ----------------
-- El historial guarda el correo del administrador (admin_email). Es nulo en
-- los eventos automáticos (creación del reporte).
alter table public.reporte_eventos
  add column if not exists admin_email text;

drop function if exists public.cambiar_estado_reporte(uuid, text, text);
drop function if exists public.cambiar_estado_reporte(
  uuid, public.estado_reporte, text
);
drop function if exists public.cambiar_estado_reporte(
  uuid, public.estado_reporte, text, text
);

create or replace function public.cambiar_estado_reporte(
  p_id     uuid,
  p_estado public.estado_reporte,
  p_nota   text default null,
  p_admin  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior public.estado_reporte;
begin
  if p_estado is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Estado inválido.');
  end if;

  select estado into v_anterior
    from public.reportes
   where id = p_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'Reporte no encontrado.');
  end if;

  if v_anterior = p_estado then
    return jsonb_build_object('ok', true, 'cambio', false);
  end if;

  update public.reportes set estado = p_estado where id = p_id;

  -- El trigger registrar_cambio_estado acaba de crear el evento: se le agrega
  -- la nota y el administrador que hizo el cambio.
  update public.reporte_eventos
     set nota = coalesce(nullif(left(btrim(coalesce(p_nota, '')), 500), ''), nota),
         admin_email = nullif(left(btrim(coalesce(p_admin, '')), 254), '')
   where id = (
     select max(id)
       from public.reporte_eventos
      where reporte_id = p_id
   );

  return jsonb_build_object('ok', true, 'cambio', true);
end;
$$;

revoke all on function public.registrar_evento_inicial()
  from PUBLIC, anon, authenticated;
revoke all on function public.cambiar_estado_reporte(
  uuid, public.estado_reporte, text, text
) from PUBLIC, anon, authenticated;

grant execute on function public.cambiar_estado_reporte(
  uuid, public.estado_reporte, text, text
) to service_role;

-- 8) Permisos de la secuencia nueva -----------------------------------------
grant usage, select on sequence public.reportes_ticket_seq to service_role;

-- 9) Documentación del esquema final ----------------------------------------
comment on column public.reportes.estado is
  'Estado del reporte (enum estado_reporte).';
comment on column public.reportes.tipo_error is
  'Tipo de error (enum tipo_error_reporte).';
comment on column public.reporte_eventos.estado_anterior is
  'Estado previo; null en el evento inicial.';
comment on column public.reporte_eventos.estado_nuevo is
  'Estado resultante del cambio.';
comment on column public.reporte_eventos.admin_email is
  'Correo del administrador que hizo el cambio; null en eventos automáticos.';

notify pgrst, 'reload schema';

-- 10) Auditoría de inicios de sesión de administración -----------------------
-- Una fila por intento (correcto o fallido). El correo se guarda tal cual lo
-- escribió la persona (en minúsculas); la IP, solo hasheada.
create table if not exists public.admin_intentos (
  id        bigint generated always as identity primary key,
  correo    text        not null check (char_length(correo) <= 254),
  ip_hash   text        not null,
  exito     boolean     not null,
  motivo    text,
  creado_en timestamptz not null default now()
);

create index if not exists admin_intentos_correo_idx
  on public.admin_intentos (correo, creado_en desc);

alter table public.admin_intentos enable row level security;
-- Sin políticas: solo la API (service_role) la lee y la escribe.

grant select, insert on public.admin_intentos to service_role;

comment on table public.admin_intentos is
  'Auditoría de login de /admin: correo, IP hasheada, resultado y motivo.';

-- 11) Cambio de estado por lotes ---------------------------------------------
-- Reutiliza cambiar_estado_reporte para conservar historial, nota y autor. Los
-- ids se ordenan para que dos lotes simultáneos no se bloqueen entre sí.
drop function if exists public.cambiar_estado_lote(
  uuid[], public.estado_reporte, text
);
drop function if exists public.cambiar_estado_lote(
  uuid[], public.estado_reporte, text, text
);

create or replace function public.cambiar_estado_lote(
  p_ids    uuid[],
  p_estado public.estado_reporte,
  p_nota   text default null,
  p_admin  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_ordenado uuid[];
  v_res      jsonb;
  v_cambios  integer := 0;
begin
  if p_estado is null or p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  if cardinality(p_ids) > 1000 then
    raise exception 'Máximo 1000 reportes por lote.';
  end if;

  select coalesce(array_agg(x order by x), '{}')
    into v_ordenado
    from (select distinct unnest(p_ids) as x) ids;

  foreach v_id in array v_ordenado loop
    v_res := public.cambiar_estado_reporte(v_id, p_estado, p_nota, p_admin);

    if coalesce((v_res ->> 'cambio')::boolean, false) then
      v_cambios := v_cambios + 1;
    end if;
  end loop;

  return v_cambios;
end;
$$;

revoke all on function public.cambiar_estado_lote(
  uuid[], public.estado_reporte, text, text
) from PUBLIC, anon, authenticated;

grant execute on function public.cambiar_estado_lote(
  uuid[], public.estado_reporte, text, text
) to service_role;

-- 12) Roles de administración: admin y super ---------------------------------
-- «super» puede agregar/quitar administradores y cambiar roles. Si todavía no
-- hay ningún super, el administrador más antiguo pasa a serlo (así nadie queda
-- sin gestión). El rol se lee de la base en cada petición.
alter table public.administradores
  add column if not exists rol text not null default 'admin';

alter table public.administradores
  drop constraint if exists administradores_rol_valido;
alter table public.administradores
  add constraint administradores_rol_valido check (rol in ('admin', 'super'));

update public.administradores
   set rol = 'super'
 where user_id = (
         select user_id
           from public.administradores
          order by creado_en, user_id
          limit 1
       )
   and not exists (
         select 1 from public.administradores where rol = 'super'
       );

-- Red de seguridad frente a condiciones de carrera: nunca puede quedar el
-- sistema sin un super administrador.
create or replace function public.proteger_ultimo_super()
returns trigger
language plpgsql
as $$
begin
  if old.rol = 'super'
     and (tg_op = 'DELETE' or new.rol is distinct from 'super')
     and not exists (
       select 1
         from public.administradores
        where rol = 'super'
          and user_id <> old.user_id
     )
  then
    raise exception 'Debe quedar al menos un super administrador.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists administradores_proteger_ultimo_super
  on public.administradores;
create trigger administradores_proteger_ultimo_super
  before update of rol or delete on public.administradores
  for each row execute function public.proteger_ultimo_super();

comment on column public.administradores.rol is
  'admin: gestiona reportes. super: además gestiona administradores.';

notify pgrst, 'reload schema';
