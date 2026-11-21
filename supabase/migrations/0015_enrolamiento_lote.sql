-- ============================================================================
-- Reporte de Horarios · migración 0015: códigos de enrolamiento por lote
--
-- Un mismo código puede matricular hasta N cédulas distintas mientras esté
-- vigente. Los códigos con cédula siguen existiendo para reiniciar la app de
-- un estudiante concreto (ese código invalida su credencial anterior).
--
-- Es idempotente: se puede ejecutar encima de 0001–0014 o repetirla.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) El código puede ser general (ci null) o de una sola cédula
-- ----------------------------------------------------------------------------
alter table public.totp_enrolamiento
  alter column ci drop not null;

alter table public.totp_enrolamiento
  add column if not exists max_usos integer not null default 1;

alter table public.totp_enrolamiento
  drop constraint if exists totp_enrolamiento_ci_formato;

alter table public.totp_enrolamiento
  add constraint totp_enrolamiento_ci_formato
  check (ci is null or ci ~ '^[0-9]{7,8}$');

alter table public.totp_enrolamiento
  drop constraint if exists totp_enrolamiento_max_usos;

alter table public.totp_enrolamiento
  add constraint totp_enrolamiento_max_usos
  check (max_usos between 1 and 10000);

create index if not exists totp_enrolamiento_hash_idx
  on public.totp_enrolamiento (codigo_hash);

comment on column public.totp_enrolamiento.ci is
  'NULL = código para varias cédulas; con valor = reinicio de esa cédula.';
comment on column public.totp_enrolamiento.max_usos is
  'Máximo de cédulas distintas que pueden canjear el código.';

-- ----------------------------------------------------------------------------
-- 2) Cédulas que ya canjearon cada código (una fila por cédula y código)
-- ----------------------------------------------------------------------------
create table if not exists public.totp_enrolamiento_usos (
  id              bigint generated always as identity primary key,
  enrolamiento_id uuid not null references public.totp_enrolamiento(id)
    on delete cascade,
  ci              text not null,
  creado_en       timestamptz not null default now(),
  constraint totp_enrolamiento_usos_ci_formato
    check (ci ~ '^[0-9]{7,8}$'),
  constraint totp_enrolamiento_usos_unico
    unique (enrolamiento_id, ci)
);

comment on table public.totp_enrolamiento_usos is
  'Cédulas que canjearon un código de enrolamiento; el conteo limita el cupo.';

create index if not exists totp_enrolamiento_usos_enrolamiento_idx
  on public.totp_enrolamiento_usos (enrolamiento_id);

alter table public.totp_enrolamiento_usos enable row level security;

-- ----------------------------------------------------------------------------
-- 3) Código compartido por varias cédulas
-- ----------------------------------------------------------------------------
create or replace function public.generar_codigo_lote(
  p_codigo_hash text,
  p_max_usos    int,
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
  if p_max_usos < 1 or p_max_usos > 10000 then
    raise exception 'La cantidad de cédulas debe estar entre 1 y 10000.';
  end if;

  insert into public.totp_enrolamiento (
    ci, codigo_hash, max_usos, expira_en, creado_por
  )
  values (
    null, p_codigo_hash, p_max_usos, p_expira_en, left(p_creado_por, 254)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Canje con cupo: cuenta cédulas distintas, no intentos
-- ----------------------------------------------------------------------------
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
  v_max   int;
  v_usos  int;
  v_filas int := 0;
begin
  -- El bloqueo serializa los canjes del mismo código y hace exacto el conteo.
  select id, max_usos
    into v_id, v_max
    from public.totp_enrolamiento
   where codigo_hash = p_codigo_hash
     and usado_en is null
     and expira_en > now()
     and (ci is null or ci = p_ci)
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

  select count(*)::int
    into v_usos
    from public.totp_enrolamiento_usos
   where enrolamiento_id = v_id;

  if v_usos >= v_max
     and not exists (
       select 1
         from public.totp_enrolamiento_usos
        where enrolamiento_id = v_id
          and ci = p_ci
     ) then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'agotado',
      'mensaje', 'El código de enrolamiento ya alcanzó su límite de cédulas.'
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

  insert into public.totp_enrolamiento_usos (enrolamiento_id, ci)
  values (v_id, p_ci)
  on conflict (enrolamiento_id, ci) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- Solo consume los códigos individuales de esa cédula. Los códigos de lote
-- deben seguir sirviendo para las demás cédulas hasta su vencimiento.
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

-- ----------------------------------------------------------------------------
-- 5) Permisos: la API usa service_role; anon/authenticated no ven nada
-- ----------------------------------------------------------------------------
revoke all on table public.totp_enrolamiento_usos
  from public, anon, authenticated;
grant select, insert, delete on table public.totp_enrolamiento_usos
  to service_role;

revoke all on function public.generar_codigo_lote(text, int, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.enrolar_estudiante(text, text, text)
  from public, anon, authenticated;
revoke all on function public.consumir_enrolamiento(text)
  from public, anon, authenticated;

grant execute on function public.generar_codigo_lote(text, int, timestamptz, text)
  to service_role;
grant execute on function public.enrolar_estudiante(text, text, text)
  to service_role;
grant execute on function public.consumir_enrolamiento(text)
  to service_role;

notify pgrst, 'reload schema';
