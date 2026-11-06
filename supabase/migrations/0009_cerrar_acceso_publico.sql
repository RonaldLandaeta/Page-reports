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
