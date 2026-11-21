-- ============================================================================
-- Reporte de Horarios · migración 0016: endurecimiento de la base
--
-- Complementa a 0009 (que ya retiró permisos a anon/authenticated y borró
-- políticas). Esta migración añade capas de defensa en profundidad:
--
--   1) La vista reportes_con_llegada respeta los permisos de quien consulta
--      (security_invoker) en lugar de los del dueño.
--   2) anon, authenticated y PUBLIC pierden el USAGE del esquema public: la
--      Data API (REST/GraphQL) ya no los deja ni listar sus objetos.
--   3) Toda función SECURITY DEFINER fija su search_path con pg_temp al final,
--      para que nadie pueda «sombrear» tablas o funciones con objetos propios.
--   4) Se vuelve a retirar EXECUTE de las funciones a PUBLIC/anon/authenticated
--      (por si alguna se creó después de 0009).
--   5) Nadie puede crear objetos en public salvo los roles de servicio, ni
--      crear tablas temporales desde la Data API.
--   6) Toda tabla nueva en public nace con RLS activado (event trigger).
--   7) Tiempo máximo por consulta para los roles de la Data API.
--
-- Es idempotente: se puede ejecutar varias veces. Los bloques que necesitan
-- privilegios que el rol actual podría no tener avisan con NOTICE y siguen.
-- ============================================================================

-- 1) Vista con los permisos de quien consulta --------------------------------
do $$
begin
  if exists (
    select 1 from pg_views
     where schemaname = 'public' and viewname = 'reportes_con_llegada'
  ) then
    alter view public.reportes_con_llegada set (security_invoker = true);
  end if;
exception when others then
  raise notice 'No se pudo activar security_invoker: %', sqlerrm;
end
$$;

-- 2) Sin acceso al esquema public para los roles de la Data API --------------
-- Ojo: Postgres da USAGE sobre public a PUBLIC por defecto, y anon/authenticated
-- lo heredan. Hay que retirarlo también de PUBLIC o la revocación no surte efecto.
revoke usage  on schema public from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

-- Siguen entrando solo los roles que lo necesitan: la API del servidor usa
-- service_role; postgres/supabase_admin son los roles administrativos.
do $$
declare
  r text;
begin
  foreach r in array array['service_role', 'postgres', 'supabase_admin'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
    end if;
  end loop;
end
$$;

-- 3) search_path fijo en todas las funciones SECURITY DEFINER ----------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp', f.firma
    );
  end loop;
end
$$;

-- 4) EXECUTE solo para service_role ------------------------------------------
revoke execute on all functions in schema public
  from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Las tablas, secuencias y vistas siguen cerradas (refuerzo de 0009).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 5) Sin tablas temporales desde la Data API ---------------------------------
do $$
begin
  execute format(
    'revoke temporary on database %I from public, anon, authenticated',
    current_database()
  );
exception when others then
  raise notice 'No se pudo retirar TEMPORARY: %', sqlerrm;
end
$$;

-- 6) Toda tabla nueva en public nace con RLS ---------------------------------
create or replace function public.activar_rls_automatico()
returns event_trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
     where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
       and object_type = 'table'
       and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end;
$$;

revoke execute on function public.activar_rls_automatico()
  from public, anon, authenticated;

do $$
begin
  drop event trigger if exists activar_rls_automatico;

  create event trigger activar_rls_automatico
    on ddl_command_end
    when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    execute function public.activar_rls_automatico();
exception when others then
  raise notice 'No se pudo crear el event trigger de RLS automático: %', sqlerrm;
end
$$;

-- 7) Tiempo máximo por consulta en la Data API -------------------------------
do $$
begin
  alter role anon          set statement_timeout = '3s';
  alter role authenticated set statement_timeout = '8s';
exception when others then
  raise notice 'No se pudieron fijar los statement_timeout: %', sqlerrm;
end
$$;

notify pgrst, 'reload schema';
