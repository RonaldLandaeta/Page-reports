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
