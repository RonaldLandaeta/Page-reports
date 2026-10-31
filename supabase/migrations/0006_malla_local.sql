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
update public.reportes
   set materia_codigo = nrc
 where materia_codigo is null;

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
