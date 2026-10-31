-- ============================================================================
-- Reporte de Horarios · migración 0005: catálogo local
--
-- La aplicación dejó de usar public.materias: el catálogo vive ahora en
-- lib/materias/index.ts y los NRC son códigos como "FING-02002". La tabla
-- public.reportes conservaba una clave foránea hacia public.materias, que
-- rechazaba esos códigos. Se elimina la dependencia sin borrar datos.
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
