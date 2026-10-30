-- 1. Crear extensión para UUIDs si no existe
create extension if not exists "uuid-ossp";

-- 2. Tabla de reportes / tickets
create table if not exists public.reportes (
  id uuid primary key default uuid_generate_v4(),
  ticket text not null unique,
  ci text not null,
  nombre text not null,
  correo text not null,
  nrc text not null,
  materia_nombre text not null,
  tipo_error text not null,
  motivo text not null,
  estado text not null default 'pendiente',
  creado_en timestamp with time zone default now()
);

-- 3. Tabla de administradores autorizados
create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamp with time zone default now()
);

-- 4. Habilitar RLS en reportes (Lectura/Escritura vía Service Role en el backend)
alter table public.reportes enable row level security;
alter table public.administradores enable row level security;