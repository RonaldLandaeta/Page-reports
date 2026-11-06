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
