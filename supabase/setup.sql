-- Reporte de Horarios · setup completo (0001 + 0002 + 0003 + 0004 + catálogo inicial).
-- Supabase → SQL Editor → pega TODO el contenido (no la ruta) y pulsa Run.

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

comment on table public.materias is 'Catálogo académico. Se importa desde data/materias.csv con supabase/seed.sql.';

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

-- Catálogo inicial (origen: data/materias.csv).
-- Se puede volver a ejecutar: actualiza las materias existentes por NRC.
insert into public.materias (nrc, nombre, docente, horario, aula)
values
  ('10245', 'Cálculo Diferencial', 'Ing. María Torres', 'Lun y Mié · 08:00 – 10:00', 'B-204'),
  ('10482', 'Programación Orientada a Objetos', 'Ing. Carlos Vera', 'Mar y Jue · 10:00 – 12:00', 'C-105'),
  ('10817', 'Base de Datos', 'Ing. Andrea Salazar', 'Lun y Vie · 14:00 – 16:00', 'A-310'),
  ('11039', 'Redes de Computadoras', 'Ing. Jorge Mendoza', 'Mié y Vie · 16:00 – 18:00', 'B-102'),
  ('11264', 'Estadística Aplicada', 'Lic. Paola Cedeño', 'Mar y Jue · 07:00 – 09:00', 'D-201'),
  ('11598', 'Ingeniería de Software', 'Ing. Diego Ramírez', 'Lun y Mié · 18:00 – 20:00', 'C-401'),
  ('11803', 'Física General', 'Ing. Sofía Almeida', 'Mar y Vie · 08:00 – 10:00', 'A-105'),
  ('12077', 'Arquitectura de Computadores', 'Ing. Ricardo Paredes', 'Jue y Vie · 14:00 – 16:00', 'Lab. B-210')
on conflict (nrc) do update set
  nombre    = excluded.nombre,
  docente   = excluded.docente,
  horario   = excluded.horario,
  aula      = excluded.aula,
  activo    = true;
