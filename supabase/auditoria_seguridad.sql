-- ============================================================================
-- Auditoría de seguridad (solo lectura). Pégala en Supabase → SQL Editor.
-- Cada consulta debe devolver 0 filas. Si devuelve alguna, esa fila es un
-- problema que corregir. No modifica nada.
-- ============================================================================

-- 1) Tablas de public SIN RLS ------------------------------------------------
select 'tabla sin RLS' as problema, c.relname as objeto
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind in ('r', 'p')
   and not c.relrowsecurity;

-- 2) Políticas en public (el diseño es «sin políticas») ----------------------
select 'política existente' as problema, tablename || '.' || policyname as objeto
  from pg_policies
 where schemaname = 'public';

-- 3) Permisos de tablas/vistas para anon, authenticated o PUBLIC -------------
select 'permiso de tabla abierto' as problema,
       grantee || ' → ' || table_name || ' (' || privilege_type || ')' as objeto
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated', 'PUBLIC');

-- 4) Funciones ejecutables por anon, authenticated o PUBLIC ------------------
select 'función ejecutable' as problema,
       p.oid::regprocedure::text as objeto
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and (
        has_function_privilege('anon',          p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute')
     or exists (
          select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.grantee = 0 and a.privilege_type = 'EXECUTE'
        )
   )
   and p.proname <> 'activar_rls_automatico';

-- 5) SECURITY DEFINER sin search_path fijo -----------------------------------
select 'definer sin search_path' as problema, p.oid::regprocedure::text as objeto
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
         where cfg like 'search_path=%'
      );

-- 6) Vistas sin security_invoker ---------------------------------------------
select 'vista sin security_invoker' as problema, c.relname as objeto
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and not coalesce(
         (select option_value = 'true'
            from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'),
         false);

-- 7) anon/authenticated con USAGE o CREATE sobre el esquema public -----------
select 'acceso al esquema public' as problema, r.rolname || ' (' || p.priv || ')' as objeto
  from pg_roles r
 cross join (values ('USAGE'), ('CREATE')) as p(priv)
 where r.rolname in ('anon', 'authenticated')
   and has_schema_privilege(r.rolname, 'public', p.priv);

-- 8) Extensiones instaladas en public (deben vivir en otro esquema) ----------
select 'extensión en public' as problema, e.extname as objeto
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 where n.nspname = 'public';

-- 9) Administradores: debe haber al menos un super ---------------------------
select 'no hay ningún super administrador' as problema, '-' as objeto
 where not exists (select 1 from public.administradores where rol = 'super');
