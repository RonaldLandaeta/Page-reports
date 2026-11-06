-- ============================================================================
-- Reporte de Horarios · setup completo
-- ----------------------------------------------------------------------------
-- GENERADO AUTOMÁTICAMENTE por scripts/generar-setup.mjs.
-- No edites este archivo a mano: modifica supabase/migrations y ejecuta
--   npm run db:setup
--
-- Supabase → SQL Editor → pega TODO el contenido y pulsa Run.
-- Es idempotente: puede ejecutarse sobre una base nueva o ya existente.
-- Se ejecuta dentro de una transacción: si algo falla, no deja la base a medias.
-- ============================================================================

begin;

-- ============================================================================
-- supabase/migrations/0001_init.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · esquema inicial
-- Ejecutar en Supabase → SQL Editor (o `supabase db push`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Catálogo de materias
-- ----------------------------------------------------------------------------
create table if not exists public.materias (
  nrc            text primary key,
  nombre         text not null,
  docente        text not null default '',
  horario        text not null default '',
  aula           text not null default '',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint materias_nrc_formato check (nrc ~ '^[0-9]{3,10}$'),
  constraint materias_nombre_largo check (char_length(nombre) between 2 and 160)
);

comment on table public.materias is 'Catálogo académico (obsoleto: se elimina en 0006; la malla es local).';

-- ----------------------------------------------------------------------------
-- Reportes
-- ----------------------------------------------------------------------------
create table if not exists public.reportes (
  id             uuid primary key default gen_random_uuid(),
  ticket         text not null unique,
  ci             text not null,
  nombre         text not null,
  correo         text not null,
  nrc            text not null references public.materias(nrc) on update cascade,
  tipo_error     text not null,
  motivo         text not null,
  -- Copia del catálogo al momento del reporte: el histórico no cambia si luego
  -- se edita la materia.
  materia_nombre text not null,
  materia_aula   text not null default '',
  estado         text not null default 'pendiente',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint reportes_ticket_formato check (ticket ~ '^TK-[0-9]{6}$'),
  constraint reportes_ci_formato check (ci ~ '^[0-9]{7,8}$'),
  constraint reportes_correo_formato check (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  constraint reportes_nombre_largo check (char_length(nombre) between 3 and 120),
  constraint reportes_motivo_largo check (char_length(motivo) between 15 and 600),
  constraint reportes_tipo_error_valido check (
    tipo_error in (
      'horario-incorrecto',
      'aula-incorrecta',
      'docente-incorrecto',
      'cruce-materias',
      'otro'
    )
  ),
  constraint reportes_estado_valido check (
    estado in ('pendiente', 'en-revision', 'resuelto')
  )
);

comment on table public.reportes is 'Reportes de horarios. Escritura y lectura solo mediante la API con service_role.';

-- Búsqueda por cédula (límite diario) y por duplicado (cédula + NRC + tipo).
create index if not exists reportes_ci_creado_idx
  on public.reportes (ci, creado_en desc);
create index if not exists reportes_duplicado_idx
  on public.reportes (ci, nrc, tipo_error, creado_en desc);
create index if not exists reportes_estado_idx
  on public.reportes (estado, creado_en desc);
create index if not exists reportes_correo_idx
  on public.reportes (correo);

-- ----------------------------------------------------------------------------
-- Historial de estados
-- ----------------------------------------------------------------------------
create table if not exists public.reporte_eventos (
  id              bigint generated always as identity primary key,
  reporte_id      uuid not null references public.reportes(id) on delete cascade,
  estado_anterior text,
  estado_nuevo    text not null,
  nota            text,
  creado_en       timestamptz not null default now()
);

create index if not exists reporte_eventos_reporte_idx
  on public.reporte_eventos (reporte_id, creado_en desc);

-- ----------------------------------------------------------------------------
-- Códigos de verificación de correo
-- ----------------------------------------------------------------------------
create table if not exists public.codigos_verificacion (
  id           uuid primary key default gen_random_uuid(),
  correo       text not null,
  codigo_hash  text not null,
  expira_en    timestamptz not null,
  intentos     smallint not null default 0,
  consumido_en timestamptz,
  ip_hash      text,
  creado_en    timestamptz not null default now(),
  constraint codigos_intentos_no_negativos check (intentos >= 0)
);

create index if not exists codigos_correo_creado_idx
  on public.codigos_verificacion (correo, creado_en desc);
create index if not exists codigos_ip_creado_idx
  on public.codigos_verificacion (ip_hash, creado_en desc);
create index if not exists codigos_limpia_idx
  on public.codigos_verificacion (expira_en);

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists materias_tocar_actualizado_en on public.materias;
create trigger materias_tocar_actualizado_en
  before update on public.materias
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists reportes_tocar_actualizado_en on public.reportes;
create trigger reportes_tocar_actualizado_en
  before update on public.reportes
  for each row execute function public.tocar_actualizado_en();

create or replace function public.registrar_cambio_estado()
returns trigger
language plpgsql
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.reporte_eventos (reporte_id, estado_anterior, estado_nuevo)
    values (new.id, old.estado, new.estado);
  end if;
  return new;
end;
$$;

drop trigger if exists reportes_registrar_cambio_estado on public.reportes;
create trigger reportes_registrar_cambio_estado
  after update of estado on public.reportes
  for each row execute function public.registrar_cambio_estado();

-- ----------------------------------------------------------------------------
-- Registro atómico de un reporte
--
-- Devuelve jsonb en vez de lanzar excepciones para que la API pueda responder
-- con códigos claros. El advisory lock serializa las peticiones de una misma
-- cédula: dos envíos simultáneos no pueden saltarse el duplicado ni el límite.
-- ----------------------------------------------------------------------------
create or replace function public.registrar_reporte(
  p_ci         text,
  p_nombre     text,
  p_correo     text,
  p_nrc        text,
  p_tipo_error text,
  p_motivo     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_ventana_horas constant int := 24;
  c_max_por_dia   constant int := 5;
  c_zona          constant text := 'America/Caracas';

  v_materia   public.materias%rowtype;
  v_duplicado public.reportes%rowtype;
  v_reporte   public.reportes%rowtype;
  v_hoy       date := (now() at time zone c_zona)::date;
  v_total     int;
  v_ticket    text;
  v_intento   int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('reporte:' || p_ci));

  select * into v_materia
    from public.materias
   where nrc = p_nrc and activo = true;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'materia',
      'mensaje', 'La materia indicada no existe o no está activa.'
    );
  end if;

  select * into v_duplicado
    from public.reportes
   where ci = p_ci
     and nrc = p_nrc
     and tipo_error = p_tipo_error
     and creado_en >= now() - make_interval(hours => c_ventana_horas)
   order by creado_en desc
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'duplicado',
      'mensaje', format(
        'Ya registraste un reporte para esta materia con el mismo tipo de error en las últimas %s horas.',
        c_ventana_horas
      ),
      'ticket', v_duplicado.ticket
    );
  end if;

  select count(*) into v_total
    from public.reportes
   where ci = p_ci
     and (creado_en at time zone c_zona)::date = v_hoy;

  if v_total >= c_max_por_dia then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'limite',
      'mensaje', format(
        'Alcanzaste el límite de %s reportes por día. Intenta nuevamente mañana.',
        c_max_por_dia
      )
    );
  end if;

  loop
    v_intento := v_intento + 1;
    v_ticket := 'TK-' || lpad((100000 + floor(random() * 900000))::int::text, 6, '0');

    begin
      insert into public.reportes (
        ticket, ci, nombre, correo, nrc, tipo_error, motivo,
        materia_nombre, materia_aula
      )
      values (
        v_ticket, p_ci, p_nombre, p_correo, p_nrc, p_tipo_error, p_motivo,
        v_materia.nombre, v_materia.aula
      )
      returning * into v_reporte;

      exit;
    exception when unique_violation then
      if v_intento >= 25 then
        return jsonb_build_object(
          'ok', false,
          'codigo', 'interno',
          'mensaje', 'No fue posible generar un ticket único. Intenta nuevamente.'
        );
      end if;
    end;
  end loop;

  insert into public.reporte_eventos (reporte_id, estado_anterior, estado_nuevo, nota)
  values (v_reporte.id, null, 'pendiente', 'Reporte creado');

  return jsonb_build_object('ok', true, 'reporte', to_jsonb(v_reporte));
end;
$$;

-- La función es security definer: sin este revoke, cualquiera con la anon key
-- podría llamarla por RPC y saltarse la verificación de correo.
revoke all on function public.registrar_reporte(text, text, text, text, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.registrar_reporte(text, text, text, text, text, text)
  to service_role;

-- ----------------------------------------------------------------------------
-- RLS: nadie lee ni escribe directamente; la API usa service_role.
-- El catálogo sí es de lectura pública (útil para futuras apps).
-- ----------------------------------------------------------------------------
alter table public.materias enable row level security;
alter table public.reportes enable row level security;
alter table public.reporte_eventos enable row level security;
alter table public.codigos_verificacion enable row level security;

drop policy if exists materias_lectura_publica on public.materias;
create policy materias_lectura_publica
  on public.materias
  for select
  to anon, authenticated
  using (activo = true);

-- Sin políticas en reportes, reporte_eventos ni codigos_verificacion:
-- anon y authenticated quedan denegados por defecto.

-- ----------------------------------------------------------------------------
-- Limpieza de códigos vencidos (opcional, ejecutar con pg_cron)
-- ----------------------------------------------------------------------------
create or replace function public.limpiar_codigos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.codigos_verificacion
   where creado_en < now() - interval '2 days';
$$;

revoke all on function public.limpiar_codigos_vencidos() from PUBLIC, anon, authenticated;
grant execute on function public.limpiar_codigos_vencidos() to service_role;

-- Refresca la caché de PostgREST para que la RPC esté disponible de inmediato.
notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0002_auditoria.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0002 (auditoría)
--   · Intentos de código y canje atómicos (evita adivinar en paralelo).
--   · Registro de consultas fallidas para limitar fuerza bruta de ticket+cédula.
--   · Zona horaria del límite diario: America/Caracas (antes Guayaquil).
-- Se puede ejecutar encima de 0001. Es idempotente.
-- ============================================================================

create table if not exists public.consulta_intentos (
  id        bigint generated always as identity primary key,
  ip_hash   text not null,
  creado_en timestamptz not null default now()
);

create index if not exists consulta_intentos_ip_idx
  on public.consulta_intentos (ip_hash, creado_en desc);

alter table public.consulta_intentos enable row level security;
-- Sin políticas: solo la API (service_role) lee y escribe.

create or replace function public.registrar_intento_codigo(p_id uuid)
returns smallint
language sql
security definer
set search_path = public
as $$
  update public.codigos_verificacion
     set intentos = intentos + 1
   where id = p_id
     and consumido_en is null
  returning intentos;
$$;

create or replace function public.consumir_codigo(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
begin
  update public.codigos_verificacion
     set consumido_en = now()
   where id = p_id
     and consumido_en is null
     and expira_en > now();

  get diagnostics v_filas = row_count;
  return v_filas = 1;
end;
$$;

revoke all on function public.registrar_intento_codigo(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.consumir_codigo(uuid) from PUBLIC, anon, authenticated;
grant execute on function public.registrar_intento_codigo(uuid) to service_role;
grant execute on function public.consumir_codigo(uuid) to service_role;

create or replace function public.limpiar_codigos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.codigos_verificacion
   where creado_en < now() - interval '2 days';
  delete from public.consulta_intentos
   where creado_en < now() - interval '2 days';
$$;

-- `create or replace` conserva los permisos, pero se repiten para que la
-- migración sea explícita y segura si algún día se recrea la función.
revoke all on function public.limpiar_codigos_vencidos() from PUBLIC, anon, authenticated;
grant execute on function public.limpiar_codigos_vencidos() to service_role;

-- ----------------------------------------------------------------------------
-- registrar_reporte con zona horaria de Venezuela (resto idéntico a 0001).
-- ----------------------------------------------------------------------------
create or replace function public.registrar_reporte(
  p_ci         text,
  p_nombre     text,
  p_correo     text,
  p_nrc        text,
  p_tipo_error text,
  p_motivo     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_ventana_horas constant int := 24;
  c_max_por_dia   constant int := 5;
  c_zona          constant text := 'America/Caracas';

  v_materia   public.materias%rowtype;
  v_duplicado public.reportes%rowtype;
  v_reporte   public.reportes%rowtype;
  v_hoy       date := (now() at time zone c_zona)::date;
  v_total     int;
  v_ticket    text;
  v_intento   int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('reporte:' || p_ci));

  select * into v_materia
    from public.materias
   where nrc = p_nrc and activo = true;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'materia',
      'mensaje', 'La materia indicada no existe o no está activa.'
    );
  end if;

  select * into v_duplicado
    from public.reportes
   where ci = p_ci
     and nrc = p_nrc
     and tipo_error = p_tipo_error
     and creado_en >= now() - make_interval(hours => c_ventana_horas)
   order by creado_en desc
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'duplicado',
      'mensaje', format(
        'Ya registraste un reporte para esta materia con el mismo tipo de error en las últimas %s horas.',
        c_ventana_horas
      ),
      'ticket', v_duplicado.ticket
    );
  end if;

  select count(*) into v_total
    from public.reportes
   where ci = p_ci
     and (creado_en at time zone c_zona)::date = v_hoy;

  if v_total >= c_max_por_dia then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'limite',
      'mensaje', format(
        'Alcanzaste el límite de %s reportes por día. Intenta nuevamente mañana.',
        c_max_por_dia
      )
    );
  end if;

  loop
    v_intento := v_intento + 1;
    v_ticket := 'TK-' || lpad((100000 + floor(random() * 900000))::int::text, 6, '0');

    begin
      insert into public.reportes (
        ticket, ci, nombre, correo, nrc, tipo_error, motivo,
        materia_nombre, materia_aula
      )
      values (
        v_ticket, p_ci, p_nombre, p_correo, p_nrc, p_tipo_error, p_motivo,
        v_materia.nombre, v_materia.aula
      )
      returning * into v_reporte;

      exit;
    exception when unique_violation then
      if v_intento >= 25 then
        return jsonb_build_object(
          'ok', false,
          'codigo', 'interno',
          'mensaje', 'No fue posible generar un ticket único. Intenta nuevamente.'
        );
      end if;
    end;
  end loop;

  insert into public.reporte_eventos (reporte_id, estado_anterior, estado_nuevo, nota)
  values (v_reporte.id, null, 'pendiente', 'Reporte creado');

  return jsonb_build_object('ok', true, 'reporte', to_jsonb(v_reporte));
end;
$$;

revoke all on function public.registrar_reporte(text, text, text, text, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.registrar_reporte(text, text, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0003_admin.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0003: panel /admin
-- 1) Crea el usuario en Supabase → Authentication → Users (email + contraseña).
-- 2) Autorízalo como administrador (cambia el correo):
--      insert into public.administradores (user_id)
--      select id from auth.users where email = 'admin@tu-dominio.edu.ve';
-- ============================================================================

create table if not exists public.administradores (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);

alter table public.administradores enable row level security;
-- Sin políticas: solo la API (service_role) la consulta.

-- Cambia el estado y guarda la nota en el historial, de forma atómica.
create or replace function public.cambiar_estado_reporte(
  p_id     uuid,
  p_estado text,
  p_nota   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
begin
  if p_estado not in ('pendiente', 'en-revision', 'resuelto') then
    return jsonb_build_object('ok', false, 'mensaje', 'Estado inválido.');
  end if;

  select estado into v_anterior from public.reportes where id = p_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'Reporte no encontrado.');
  end if;

  if v_anterior = p_estado then
    return jsonb_build_object('ok', true, 'cambio', false);
  end if;

  update public.reportes set estado = p_estado where id = p_id;

  if p_nota is not null and btrim(p_nota) <> '' then
    update public.reporte_eventos
       set nota = left(btrim(p_nota), 500)
     where id = (
       select max(id) from public.reporte_eventos where reporte_id = p_id
     );
  end if;

  return jsonb_build_object('ok', true, 'cambio', true);
end;
$$;

revoke all on function public.cambiar_estado_reporte(uuid, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.cambiar_estado_reporte(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0004_permisos.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0004: permisos de la Data API
--
-- Supabase suele conceder estos permisos automáticamente cuando la opción
-- "Expose new tables automatically" está activa. Se declaran aquí para que el
-- proyecto funcione aunque esa opción esté desactivada.
-- ============================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Las tablas/sequences que se creen en el futuro también quedan cubiertas.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0005_catalogo_local.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0005: catálogo local
--
-- La aplicación dejó de usar public.materias: el catálogo vive ahora en
-- lib/materias/index.ts y los NRC son códigos como "FING-02002". La tabla
-- public.reportes conservaba una clave foránea hacia public.materias, que
-- rechazaba esos códigos. Se elimina la dependencia sin borrar datos.
--
-- Se conserva en el repositorio para que el historial de migraciones sea
-- completo (0006 repite esta limpieza por si esta migración no se ejecutó).
-- ============================================================================

do $$
declare
  v_constraint text;
begin
  select conname
    into v_constraint
    from pg_constraint
   where conrelid = 'public.reportes'::regclass
     and contype = 'f'
     and conkey = array[
       (
         select attnum
           from pg_attribute
          where attrelid = 'public.reportes'::regclass
            and attname = 'nrc'
       )
     ];

  if v_constraint is not null then
    execute format(
      'alter table public.reportes drop constraint %I',
      v_constraint
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0006_malla_local.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0006: malla curricular local
--
-- En Supabase quedan SOLO los reportes/tickets y los datos del usuario. La
-- malla vive en el repositorio (lib/materias/index.ts); el NRC visible
-- (nroCurso) se repite entre carreras, así que el reporte guarda:
--   · nrc            → nroCurso visible (ej. '02002')
--   · materia_codigo → código único de la malla (ej. 'FING-02002')
--   · materia_nombre → snapshot del nombre (ya no hay aula ni horario)
--
-- Es idempotente: se puede ejecutar encima de 0001–0005 (o repetirla).
-- Las tablas operativas (reportes, reporte_eventos, codigos_verificacion,
-- consulta_intentos y administradores) no se tocan.
-- ============================================================================

-- 1) Quitar la FK reportes.nrc -> materias (si 0005 no llegó a ejecutarse).
do $$
declare
  v_constraint text;
begin
  select conname
    into v_constraint
    from pg_constraint
   where conrelid = 'public.reportes'::regclass
     and contype = 'f'
     and confrelid = to_regclass('public.materias');

  if v_constraint is not null then
    execute format(
      'alter table public.reportes drop constraint %I',
      v_constraint
    );
  end if;
end;
$$;

-- 2) Eliminar la función que dependía de materias. La API ya aplica las
--    reglas de duplicado y límite diario; ya no se usa por RPC.
drop function if exists public.registrar_reporte(text, text, text, text, text, text);

-- 3) Columnas nuevas.
alter table public.reportes
  add column if not exists materia_codigo text,
  add column if not exists tipo_error_detalle text not null default '';

-- 4) Filas del esquema anterior (la base de producción tiene 0 reportes; esto
--    solo protege una base de pruebas): se conservan con los tipos nuevos.
--    IMPORTANTE: el CHECK viejo debe quitarse ANTES de cambiar los valores;
--    de lo contrario el UPDATE choca con la restricción anterior.
alter table public.reportes
  drop constraint if exists reportes_tipo_error_valido;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'reportes'
       and column_name = 'materia_aula'
  ) then
    -- La versión intermedia de la API guardaba el código de la malla en la
    -- columna materia_aula. Si tiene ese formato, se recupera; si era un
    -- aula real, se usa el NRC como respaldo.
    update public.reportes
       set materia_codigo = case
         when materia_aula ~ '^[A-Z]{2,6}-[0-9]+$' then materia_aula
         else nrc
       end
     where materia_codigo is null;
  else
    update public.reportes
       set materia_codigo = nrc
     where materia_codigo is null;
  end if;
end;
$$;

-- Solo si tipo_error todavía es text. Después de 0007 es un enum y compararlo
-- con los valores viejos ("horario-incorrecto", etc.) daría error.
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
       set tipo_error_detalle = case tipo_error
             when 'aula-incorrecta'    then 'Aula incorrecta'
             when 'docente-incorrecto' then 'Docente no coincide'
             when 'otro'               then 'Otro problema'
             else tipo_error_detalle
           end,
           tipo_error = case tipo_error
             when 'horario-incorrecto' then 'cambio-horario'
             when 'cruce-materias'     then 'cruce-horario'
             when 'aula-incorrecta'    then 'otro'
             when 'docente-incorrecto' then 'otro'
             else tipo_error
           end
     where tipo_error in (
       'horario-incorrecto', 'aula-incorrecta', 'docente-incorrecto', 'cruce-materias'
     )
        or (tipo_error = 'otro' and btrim(tipo_error_detalle) = '');
  end if;
end;
$$;

alter table public.reportes
  alter column materia_codigo set not null;

-- 5) El aula ya no se guarda en el reporte.
alter table public.reportes
  drop column if exists materia_aula;

-- 6) CHECK de tipo_error con los seis valores nuevos.
alter table public.reportes
  drop constraint if exists reportes_tipo_error_valido;
alter table public.reportes
  add constraint reportes_tipo_error_valido check (
    tipo_error in (
      'error-prerrequisito',
      'error-correquisito',
      'reserva-cerrada',
      'cruce-horario',
      'cambio-horario',
      'otro'
    )
  );

-- 7) tipo_error_detalle: máximo 100 caracteres y solo para "otro"
--    (obligatorio ahí, vacío en los demás tipos).
alter table public.reportes
  drop constraint if exists reportes_tipo_error_detalle_largo;
alter table public.reportes
  add constraint reportes_tipo_error_detalle_largo check (
    char_length(tipo_error_detalle) <= 100
  );

alter table public.reportes
  drop constraint if exists reportes_tipo_error_detalle_coherente;
alter table public.reportes
  add constraint reportes_tipo_error_detalle_coherente check (
    (tipo_error = 'otro' and char_length(btrim(tipo_error_detalle)) >= 1)
    or (tipo_error <> 'otro' and tipo_error_detalle = '')
  );

-- 8) Índice de duplicados con materia_codigo (cédula + materia + tipo, 24 h).
drop index if exists public.reportes_duplicado_idx;
create index if not exists reportes_duplicado_idx
  on public.reportes (ci, materia_codigo, tipo_error, creado_en desc);

comment on table public.reportes is
  'Reportes de horarios. Escritura y lectura solo mediante la API con service_role. La malla curricular es local (lib/materias).';
comment on column public.reportes.nrc is
  'NRC visible (nroCurso). Se repite entre carreras: no es único.';
comment on column public.reportes.materia_codigo is
  'Código único de la malla local (ej. FING-02002).';
comment on column public.reportes.materia_nombre is
  'Snapshot del nombre de la materia al momento del reporte.';
comment on column public.reportes.tipo_error_detalle is
  'Solo para tipo_error = otro (obligatorio, máximo 100 caracteres).';

-- 9) Fuera el catálogo de materias en Supabase.
drop table if exists public.materias;

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0007_esquema_consistente.sql
-- ============================================================================

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

-- ============================================================================
-- supabase/migrations/0008_crear_reporte_atomico.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0008: creación atómica de reportes
--
-- La API comprobaba duplicados y límite diario en consultas separadas y luego
-- insertaba. Dos peticiones simultáneas de la misma cédula podían pasar ambas
-- comprobaciones y saltarse el límite o crear duplicados (TOCTOU).
--
-- Esta función hace las tres cosas dentro de una sola transacción y serializa
-- por cédula con un advisory lock. Devuelve jsonb para que la API traduzca el
-- resultado a una respuesta HTTP clara.
--
-- Es idempotente: se puede ejecutar encima de 0001–0007 (o repetirla).
-- ============================================================================

create or replace function public.crear_reporte(
  p_ci                text,
  p_nombre            text,
  p_correo            text,
  p_nrc               text,
  p_materia_codigo    text,
  p_materia_nombre    text,
  p_tipo_error        public.tipo_error_reporte,
  p_tipo_error_detalle text,
  p_motivo            text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Deben coincidir con CONFIG (lib/config.ts).
  c_ventana_horas constant int := 24;
  c_max_por_dia   constant int := 5;
  c_zona          constant text := 'America/Caracas';

  v_duplicado public.reportes%rowtype;
  v_reporte   public.reportes%rowtype;
  v_hoy       date := (now() at time zone c_zona)::date;
  v_total     int;
  v_ticket    text;
  v_intento   int := 0;
  v_detalle   text := '';
begin
  -- Serializa todas las altas de una misma cédula y de un mismo correo. El
  -- lock se libera al terminar la transacción (commit o rollback). El segundo
  -- lock cierra la carrera de «un correo, una cédula» entre cédulas distintas.
  perform pg_advisory_xact_lock(hashtext('reporte:' || p_ci));
  perform pg_advisory_xact_lock(hashtext('correo:' || lower(p_correo)));

  if p_tipo_error = 'otro' then
    v_detalle := left(btrim(coalesce(p_tipo_error_detalle, '')), 100);

    if v_detalle = '' then
      return jsonb_build_object(
        'ok', false,
        'codigo', 'validacion',
        'mensaje', 'Especifica el error cuando eliges «Otros».'
      );
    end if;
  end if;

  -- Un correo institucional solo puede usar una cédula. Se comprueba también
  -- con los reportes históricos, no solo con los que se creen desde ahora.
  if exists (
    select 1
      from public.reportes
     where lower(correo) = lower(p_correo)
       and ci <> p_ci
  ) then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'validacion',
      'mensaje', 'Este correo ya está vinculado a otra cédula. Usa el correo con el que registraste tus reportes.'
    );
  end if;

  select * into v_duplicado
    from public.reportes
   where ci = p_ci
     and materia_codigo = p_materia_codigo
     and tipo_error = p_tipo_error
     and creado_en >= now() - make_interval(hours => c_ventana_horas)
   order by creado_en desc
   limit 1;

  if found then
    -- El ticket solo se devuelve a quien lo creó (mismo correo verificado). A
    -- cualquier otro solo se le dice que ya existe un reporte: la cédula no
    -- demuestra identidad, y un ticket ajeno permitiría consultar sus datos.
    return jsonb_build_object(
      'ok', false,
      'codigo', 'duplicado',
      'mensaje', format(
        'Ya existe un reporte para esta materia con el mismo tipo de error en las últimas %s horas.',
        c_ventana_horas
      )
    ) || case
      when lower(v_duplicado.correo) = lower(p_correo)
        then jsonb_build_object('ticket', v_duplicado.ticket)
      else '{}'::jsonb
    end;
  end if;

  select count(*) into v_total
    from public.reportes
   where ci = p_ci
     and (creado_en at time zone c_zona)::date = v_hoy;

  if v_total >= c_max_por_dia then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'limite',
      'mensaje', format(
        'Alcanzaste el límite de %s reportes por día. Intenta nuevamente mañana.',
        c_max_por_dia
      )
    );
  end if;

  loop
    v_intento := v_intento + 1;
    -- 7 dígitos: 9 000 000 combinaciones frente a 900 000.
    v_ticket := 'TK-' || lpad(
      (1000000 + floor(random() * 9000000))::int::text, 7, '0'
    );

    begin
      insert into public.reportes (
        ticket, ci, nombre, correo, nrc, materia_codigo, materia_nombre,
        tipo_error, tipo_error_detalle, motivo
      )
      values (
        v_ticket, p_ci, p_nombre, lower(p_correo), p_nrc, p_materia_codigo,
        p_materia_nombre, p_tipo_error, v_detalle, p_motivo
      )
      returning * into v_reporte;

      exit;
    exception when unique_violation then
      if v_intento >= 25 then
        return jsonb_build_object(
          'ok', false,
          'codigo', 'interno',
          'mensaje', 'No fue posible generar un ticket único. Intenta nuevamente.'
        );
      end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'reporte', to_jsonb(v_reporte));
end;
$$;

-- Es security definer: solo la API (service_role) puede ejecutarla.
revoke all on function public.crear_reporte(
  text, text, text, text, text, text, public.tipo_error_reporte, text, text
) from PUBLIC, anon, authenticated;

grant execute on function public.crear_reporte(
  text, text, text, text, text, text, public.tipo_error_reporte, text, text
) to service_role;

comment on function public.crear_reporte(
  text, text, text, text, text, text, public.tipo_error_reporte, text, text
) is
  'Alta atómica de reportes: valida un correo por cédula, duplicado de 24 h y límite diario bajo advisory lock.';

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0009_cerrar_acceso_publico.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0009: cerrar el acceso directo a la base
--
-- Toda la app habla con Supabase desde el servidor con service_role. Los roles
-- anon (la clave pública que viaja en el navegador) y authenticated no deben
-- poder leer ni escribir NADA en public. Esta migración lo garantiza aunque
-- alguien haya creado políticas a mano desde el panel de Supabase:
--
--   · borra cualquier política de public (el diseño es «sin políticas»);
--   · deja RLS activo en todas las tablas;
--   · retira los permisos de tablas, secuencias y funciones a anon y
--     authenticated (y el EXECUTE implícito de PUBLIC);
--   · hace que lo que se cree en el futuro nazca ya cerrado;
--   · serializa la protección del último super administrador.
--
-- Es idempotente: se puede ejecutar encima de 0001–0008 o repetirla.
-- ============================================================================

-- 1) Sin políticas en public -------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      p.policyname, p.schemaname, p.tablename
    );
  end loop;
end
$$;

-- 2) RLS activo en todas las tablas ------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'alter table public.%I enable row level security', t.tablename
    );
  end loop;
end
$$;

-- 3) Sin permisos para anon/authenticated ------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public
  from public, anon, authenticated;

-- service_role sigue funcionando (la API lo usa para todo).
grant select, insert, update, delete on all tables in schema public
  to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 4) Lo que se cree desde ahora nace cerrado ---------------------------------
-- Supabase concede por defecto al crear objetos con el rol postgres (y
-- supabase_admin). Se retira para ambos; si el rol actual no puede, se omite.
do $$
declare
  r text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    begin
      execute format(
        'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated', r);
      execute format(
        'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated', r);
      execute format(
        'alter default privileges for role %I in schema public revoke execute on functions from public, anon, authenticated', r);
    exception when others then
      raise notice 'No se pudieron ajustar los privilegios por defecto de %: %', r, sqlerrm;
    end;
  end loop;
end
$$;

-- 5) Último super administrador: protección serializada ----------------------
-- Sin lock, dos bajas simultáneas de dos super distintos podían pasar ambas
-- la comprobación y dejar el sistema sin ninguno.
create or replace function public.proteger_ultimo_super()
returns trigger
language plpgsql
as $$
begin
  if old.rol = 'super'
     and (tg_op = 'DELETE' or new.rol is distinct from 'super')
  then
    perform pg_advisory_xact_lock(hashtext('administradores:super'));

    if not exists (
      select 1
        from public.administradores
       where rol = 'super'
         and user_id <> old.user_id
    ) then
      raise exception 'Debe quedar al menos un super administrador.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 6) search_path fijo en las funciones de trigger (aviso del linter) ---------
alter function public.tocar_actualizado_en()     set search_path = public;
alter function public.registrar_cambio_estado()  set search_path = public;
alter function public.proteger_ultimo_super()    set search_path = public;

notify pgrst, 'reload schema';

-- ============================================================================
-- supabase/migrations/0010_ticket_consultas.sql
-- ============================================================================

-- ============================================================================
-- Reporte de Horarios · migración 0010: tickets de 7 dígitos y consultas por
-- cédula
--
--   · permite tickets nuevos de 7 dígitos sin invalidar los de 6 ya emitidos;
--   · actualiza el ticket por defecto de Postgres a 7 dígitos;
--   · guarda la cédula en `consulta_intentos` para limitar también por cédula;
--   · vuelve a definir `crear_reporte` con las reglas de 0008 corregidas
--     (un correo = una cédula, ticket ajeno oculto y tickets de 7 dígitos).
--
-- Es idempotente: se puede ejecutar encima de 0001–0009 o repetirla.
-- ============================================================================

-- 1) Formato del ticket ------------------------------------------------------
-- Se aceptan 6 y 7 dígitos: los reportes antiguos deben seguir consultándose.
alter table public.reportes
  drop constraint if exists reportes_ticket_formato;

alter table public.reportes
  add constraint reportes_ticket_formato
  check (ticket ~ '^TK-[0-9]{6,7}$') not valid;

alter table public.reportes
  validate constraint reportes_ticket_formato;

-- 2) Ticket por defecto (inserciones directas o integraciones) ---------------
alter table public.reportes
  alter column ticket set default (
    'TK-' ||
    lpad(
      ((nextval('public.reportes_ticket_seq') % 9000000) + 1000000)::text,
      7,
      '0'
    )
  );

comment on sequence public.reportes_ticket_seq is
  'Secuencia de respaldo para generar tickets TK-XXXXXXX (7 dígitos) cuando no los envía la API.';

-- 3) Consultas fallidas por cédula ------------------------------------------
alter table public.consulta_intentos
  add column if not exists ci text;

-- Búsqueda «un correo, una cédula» sin distinguir mayúsculas.
create index if not exists reportes_correo_lower_idx
  on public.reportes (lower(correo));

create index if not exists consulta_intentos_ci_creado_idx
  on public.consulta_intentos (ci, creado_en desc);

-- 4) crear_reporte con las reglas definitivas --------------------------------
create or replace function public.crear_reporte(
  p_ci                text,
  p_nombre            text,
  p_correo            text,
  p_nrc               text,
  p_materia_codigo    text,
  p_materia_nombre    text,
  p_tipo_error        public.tipo_error_reporte,
  p_tipo_error_detalle text,
  p_motivo            text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Deben coincidir con CONFIG (lib/config.ts).
  c_ventana_horas constant int := 24;
  c_max_por_dia   constant int := 5;
  c_zona          constant text := 'America/Caracas';

  v_duplicado public.reportes%rowtype;
  v_reporte   public.reportes%rowtype;
  v_hoy       date := (now() at time zone c_zona)::date;
  v_total     int;
  v_ticket    text;
  v_intento   int := 0;
  v_detalle   text := '';
begin
  -- Serializa por cédula y por correo para cerrar carreras de duplicado,
  -- límite diario y «un correo, una cédula».
  perform pg_advisory_xact_lock(hashtext('reporte:' || p_ci));
  perform pg_advisory_xact_lock(hashtext('correo:' || lower(p_correo)));

  if p_tipo_error = 'otro' then
    v_detalle := left(btrim(coalesce(p_tipo_error_detalle, '')), 100);

    if v_detalle = '' then
      return jsonb_build_object(
        'ok', false,
        'codigo', 'validacion',
        'mensaje', 'Especifica el error cuando eliges «Otros».'
      );
    end if;
  end if;

  if exists (
    select 1
      from public.reportes
     where lower(correo) = lower(p_correo)
       and ci <> p_ci
  ) then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'validacion',
      'mensaje', 'Este correo ya está vinculado a otra cédula. Usa el correo con el que registraste tus reportes.'
    );
  end if;

  select * into v_duplicado
    from public.reportes
   where ci = p_ci
     and materia_codigo = p_materia_codigo
     and tipo_error = p_tipo_error
     and creado_en >= now() - make_interval(hours => c_ventana_horas)
   order by creado_en desc
   limit 1;

  if found then
    -- El ticket solo vuelve al mismo correo verificado.
    return jsonb_build_object(
      'ok', false,
      'codigo', 'duplicado',
      'mensaje', format(
        'Ya existe un reporte para esta materia con el mismo tipo de error en las últimas %s horas.',
        c_ventana_horas
      )
    ) || case
      when lower(v_duplicado.correo) = lower(p_correo)
        then jsonb_build_object('ticket', v_duplicado.ticket)
      else '{}'::jsonb
    end;
  end if;

  select count(*) into v_total
    from public.reportes
   where ci = p_ci
     and (creado_en at time zone c_zona)::date = v_hoy;

  if v_total >= c_max_por_dia then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'limite',
      'mensaje', format(
        'Alcanzaste el límite de %s reportes por día. Intenta nuevamente mañana.',
        c_max_por_dia
      )
    );
  end if;

  loop
    v_intento := v_intento + 1;
    v_ticket := 'TK-' || lpad(
      (1000000 + floor(random() * 9000000))::int::text, 7, '0'
    );

    begin
      insert into public.reportes (
        ticket, ci, nombre, correo, nrc, materia_codigo, materia_nombre,
        tipo_error, tipo_error_detalle, motivo
      )
      values (
        v_ticket, p_ci, p_nombre, lower(p_correo), p_nrc, p_materia_codigo,
        p_materia_nombre, p_tipo_error, v_detalle, p_motivo
      )
      returning * into v_reporte;

      exit;
    exception when unique_violation then
      if v_intento >= 25 then
        return jsonb_build_object(
          'ok', false,
          'codigo', 'interno',
          'mensaje', 'No fue posible generar un ticket único. Intenta nuevamente.'
        );
      end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'reporte', to_jsonb(v_reporte));
end;
$$;

revoke all on function public.crear_reporte(
  text, text, text, text, text, text, public.tipo_error_reporte, text, text
) from PUBLIC, anon, authenticated;

grant execute on function public.crear_reporte(
  text, text, text, text, text, text, public.tipo_error_reporte, text, text
) to service_role;

comment on function public.crear_reporte(
  text, text, text, text, text, text, public.tipo_error_reporte, text, text
) is
  'Alta atómica de reportes: un correo por cédula, duplicado de 24 h y límite diario bajo advisory lock; ticket de 7 dígitos.';

notify pgrst, 'reload schema';

commit;
