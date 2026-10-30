-- ============================================================================
-- Reporte de Horarios · migración 0003: panel /admin
-- 1) Crea el usuario en Supabase → Authentication → Users (email + contraseña).
-- 2) Autorízalo como administrador (cambia el correo):
--      insert into public.administradores (user_id)
--      select id from auth.users where email = 'admin@tu-dominio.edu.ve';
-- ============================================================================

create table if not exists public.administradores (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);

alter table public.administradores enable row level security;
-- Sin políticas: solo la API (service_role) la consulta.

-- Cambia el estado y guarda la nota en el historial, de forma atómica.
create or replace function public.cambiar_estado_reporte(
  p_id     uuid,
  p_estado text,
  p_nota   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
begin
  if p_estado not in ('pendiente', 'en-revision', 'resuelto') then
    return jsonb_build_object('ok', false, 'mensaje', 'Estado inválido.');
  end if;

  select estado into v_anterior from public.reportes where id = p_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'Reporte no encontrado.');
  end if;

  if v_anterior = p_estado then
    return jsonb_build_object('ok', true, 'cambio', false);
  end if;

  update public.reportes set estado = p_estado where id = p_id;

  if p_nota is not null and btrim(p_nota) <> '' then
    update public.reporte_eventos
       set nota = left(btrim(p_nota), 500)
     where id = (
       select max(id) from public.reporte_eventos where reporte_id = p_id
     );
  end if;

  return jsonb_build_object('ok', true, 'cambio', true);
end;
$$;

revoke all on function public.cambiar_estado_reporte(uuid, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.cambiar_estado_reporte(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
