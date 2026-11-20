-- ============================================================================
-- Reporte de Horarios · migración 0014: verificación con app de autenticación
--
-- Reemplaza el código de 6 dígitos enviado por correo por TOTP (Google
-- Authenticator, Authy, 1Password, Microsoft Authenticator, etc.).
--
--   · `totp_credenciales` guarda el secreto cifrado de cada estudiante (por
--     cédula) y de cada administrador (por user_id de Supabase Auth).
--   · `totp_enrolamiento` guarda los códigos de un solo uso que genera un
--     administrador para que un estudiante vincule su app.
--   · Elimina la tabla y las funciones del flujo anterior por correo.
--
-- Es idempotente: se puede ejecutar encima de 0001–0013 o repetirla.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Credenciales TOTP
-- ----------------------------------------------------------------------------
create table if not exists public.totp_credenciales (
  tipo              text not null,
  sujeto            text not null,
  secreto_cifrado   text not null,
  confirmado_en     timestamptz,
  ultimo_paso       bigint not null default 0,
  intentos_fallidos smallint not null default 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  primary key (tipo, sujeto),
  constraint totp_credenciales_tipo_valido
    check (tipo in ('estudiante', 'admin')),
  constraint totp_credenciales_sujeto_formato
    check (
      (tipo = 'estudiante' and sujeto ~ '^[0-9]{7,8}$')
      or (
        tipo = 'admin'
        and sujeto ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      )
    ),
  constraint totp_credenciales_paso_no_negativo check (ultimo_paso >= 0),
  constraint totp_credenciales_intentos_no_negativos check (intentos_fallidos >= 0)
);

comment on table public.totp_credenciales is
  'Secretos TOTP cifrados: estudiantes por cédula y administradores por user_id. Solo service_role.';

create index if not exists totp_credenciales_tipo_idx
  on public.totp_credenciales (tipo, actualizado_en desc);

-- ----------------------------------------------------------------------------
-- 2) Códigos de enrolamiento entregados por un administrador
-- ----------------------------------------------------------------------------
create table if not exists public.totp_enrolamiento (
  id          uuid primary key default gen_random_uuid(),
  ci          text not null,
  codigo_hash text not null,
  expira_en   timestamptz not null,
  usado_en    timestamptz,
  creado_por  text not null,
  creado_en   timestamptz not null default now(),
  constraint totp_enrolamiento_ci_formato
    check (ci ~ '^[0-9]{7,8}$'),
  constraint totp_enrolamiento_creado_por_largo
    check (char_length(creado_por) between 3 and 254)
);

comment on table public.totp_enrolamiento is
  'Códigos de un solo uso para que un estudiante vincule su app de autenticación.';

create index if not exists totp_enrolamiento_ci_idx
  on public.totp_enrolamiento (ci, creado_en desc);
create index if not exists totp_enrolamiento_expira_idx
  on public.totp_enrolamiento (expira_en);

alter table public.totp_credenciales enable row level security;
alter table public.totp_enrolamiento enable row level security;

-- ----------------------------------------------------------------------------
-- 3) Funciones atómicas
-- ----------------------------------------------------------------------------

-- Cuenta un intento fallido. Al llegar al máximo bloquea 15 minutos y reinicia
-- el contador; así, al expirar el bloqueo, vuelve a haber 5 intentos.
create or replace function public.registrar_fallo_totp(
  p_tipo   text,
  p_sujeto text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max     constant int := 5;
  c_bloqueo constant interval := interval '15 minutes';
  v_bloqueado boolean := false;
begin
  update public.totp_credenciales
     set intentos_fallidos = case
           when intentos_fallidos + 1 >= c_max then 0
           else intentos_fallidos + 1
         end,
         bloqueado_hasta = case
           when intentos_fallidos + 1 >= c_max then now() + c_bloqueo
           else bloqueado_hasta
         end,
         actualizado_en = now()
   where tipo = p_tipo
     and sujeto = p_sujeto
   returning (bloqueado_hasta is not null and bloqueado_hasta > now())
     into v_bloqueado;

  return jsonb_build_object('bloqueado', coalesce(v_bloqueado, false));
end;
$$;

-- Marca un paso TOTP como usado. Es la defensa contra reutilizar el mismo
-- código dentro de sus 30 segundos de vida.
create or replace function public.marcar_paso_totp(
  p_tipo   text,
  p_sujeto text,
  p_paso   bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.totp_credenciales
     set ultimo_paso = p_paso,
         intentos_fallidos = 0,
         bloqueado_hasta = null,
         actualizado_en = now()
   where tipo = p_tipo
     and sujeto = p_sujeto
     and confirmado_en is not null
     and p_paso > ultimo_paso
     and (bloqueado_hasta is null or bloqueado_hasta <= now());

  return found;
end;
$$;

-- Confirma el primer código de una credencial pendiente.
create or replace function public.confirmar_totp(
  p_tipo   text,
  p_sujeto text,
  p_paso   bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.totp_credenciales
     set confirmado_en = now(),
         ultimo_paso = p_paso,
         intentos_fallidos = 0,
         bloqueado_hasta = null,
         actualizado_en = now()
   where tipo = p_tipo
     and sujeto = p_sujeto
     and confirmado_en is null
     and p_paso > 0
     and (bloqueado_hasta is null or bloqueado_hasta <= now());

  return found;
end;
$$;

-- Crea o reemplaza una credencial pendiente. Nunca sobrescribe una confirmada:
-- para eso existe el reinicio explícito del administrador.
create or replace function public.crear_totp_pendiente(
  p_tipo    text,
  p_sujeto  text,
  p_secreto text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.totp_credenciales (
    tipo, sujeto, secreto_cifrado, confirmado_en, ultimo_paso,
    intentos_fallidos, bloqueado_hasta
  )
  values (p_tipo, p_sujeto, p_secreto, null, 0, 0, null)
  on conflict (tipo, sujeto) do update
    set secreto_cifrado = excluded.secreto_cifrado,
        confirmado_en = null,
        ultimo_paso = 0,
        intentos_fallidos = 0,
        bloqueado_hasta = null,
        actualizado_en = now()
    where public.totp_credenciales.confirmado_en is null;

  return found;
end;
$$;

-- Valida el código de enrolamiento y deja una credencial pendiente. El código
-- NO se consume aquí: si el estudiante recarga la página puede volver a
-- escanear el QR con el mismo código. Se consume al confirmar el primer TOTP.
create or replace function public.enrolar_estudiante(
  p_ci          text,
  p_codigo_hash text,
  p_secreto     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_filas int := 0;
begin
  select id into v_id
    from public.totp_enrolamiento
   where ci = p_ci
     and codigo_hash = p_codigo_hash
     and usado_en is null
     and expira_en > now()
   order by creado_en desc
   limit 1
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'codigo',
      'mensaje', 'El código de enrolamiento no es válido o expiró.'
    );
  end if;

  if exists (
    select 1
      from public.totp_credenciales
     where tipo = 'estudiante'
       and sujeto = p_ci
       and confirmado_en is not null
  ) then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'ya_configurado',
      'mensaje', 'Esta cédula ya tiene una app vinculada. Pide a un administrador que la reinicie.'
    );
  end if;

  insert into public.totp_credenciales (
    tipo, sujeto, secreto_cifrado, confirmado_en, ultimo_paso,
    intentos_fallidos, bloqueado_hasta
  )
  values ('estudiante', p_ci, p_secreto, null, 0, 0, null)
  on conflict (tipo, sujeto) do update
    set secreto_cifrado = excluded.secreto_cifrado,
        confirmado_en = null,
        ultimo_paso = 0,
        intentos_fallidos = 0,
        bloqueado_hasta = null,
        actualizado_en = now()
    where public.totp_credenciales.confirmado_en is null;

  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'ya_configurado',
      'mensaje', 'Esta cédula ya tiene una app vinculada. Pide a un administrador que la reinicie.'
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Se llama después de confirmar el primer código: el código de enrolamiento
-- ya no puede reutilizarse.
create or replace function public.consumir_enrolamiento(p_ci text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.totp_enrolamiento
     set usado_en = now()
   where ci = p_ci
     and usado_en is null;
$$;

-- Genera un código nuevo y reinicia la app de la cédula. Es el mecanismo de
-- recuperación cuando el estudiante pierde el teléfono.
create or replace function public.generar_codigo_enrolamiento(
  p_ci          text,
  p_codigo_hash text,
  p_expira_en   timestamptz,
  p_creado_por  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  delete from public.totp_credenciales
   where tipo = 'estudiante'
     and sujeto = p_ci;

  update public.totp_enrolamiento
     set usado_en = now()
   where ci = p_ci
     and usado_en is null;

  insert into public.totp_enrolamiento (
    ci, codigo_hash, expira_en, creado_por
  )
  values (
    p_ci, p_codigo_hash, p_expira_en, left(p_creado_por, 254)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Limpieza (reemplaza la versión que borraba códigos de correo)
-- ----------------------------------------------------------------------------
create or replace function public.limpiar_codigos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.consulta_intentos
   where creado_en < now() - interval '2 days';

  delete from public.totp_enrolamiento
   where expira_en < now() - interval '2 days'
      or (usado_en is not null and usado_en < now() - interval '2 days');
$$;

-- ----------------------------------------------------------------------------
-- 5) Retirar el flujo anterior por correo
-- ----------------------------------------------------------------------------
drop function if exists public.registrar_intento_codigo(uuid);
drop function if exists public.consumir_codigo(uuid);
drop table if exists public.codigos_verificacion;

-- ----------------------------------------------------------------------------
-- 6) Permisos: la API usa service_role; anon/authenticated no ven nada
-- ----------------------------------------------------------------------------
revoke all on table public.totp_credenciales from public, anon, authenticated;
revoke all on table public.totp_enrolamiento from public, anon, authenticated;
grant select, insert, update, delete on table public.totp_credenciales
  to service_role;
grant select, insert, update, delete on table public.totp_enrolamiento
  to service_role;

revoke all on function public.registrar_fallo_totp(text, text)
  from public, anon, authenticated;
revoke all on function public.marcar_paso_totp(text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.confirmar_totp(text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.crear_totp_pendiente(text, text, text)
  from public, anon, authenticated;
revoke all on function public.enrolar_estudiante(text, text, text)
  from public, anon, authenticated;
revoke all on function public.consumir_enrolamiento(text)
  from public, anon, authenticated;
revoke all on function public.generar_codigo_enrolamiento(text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.limpiar_codigos_vencidos()
  from public, anon, authenticated;

grant execute on function public.registrar_fallo_totp(text, text)
  to service_role;
grant execute on function public.marcar_paso_totp(text, text, bigint)
  to service_role;
grant execute on function public.confirmar_totp(text, text, bigint)
  to service_role;
grant execute on function public.crear_totp_pendiente(text, text, text)
  to service_role;
grant execute on function public.enrolar_estudiante(text, text, text)
  to service_role;
grant execute on function public.consumir_enrolamiento(text)
  to service_role;
grant execute on function public.generar_codigo_enrolamiento(text, text, timestamptz, text)
  to service_role;
grant execute on function public.limpiar_codigos_vencidos()
  to service_role;

notify pgrst, 'reload schema';
