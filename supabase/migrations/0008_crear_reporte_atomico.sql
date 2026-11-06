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
