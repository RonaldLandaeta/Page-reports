-- ============================================================================
-- Reporte de Horarios · migración 0004: permisos de la Data API
--
-- Supabase suele conceder estos permisos automáticamente cuando la opción
-- "Expose new tables automatically" está activa. Se declaran aquí para que el
-- proyecto funcione aunque esa opción esté desactivada.
-- ============================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Las tablas/sequences que se creen en el futuro también quedan cubiertas.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
