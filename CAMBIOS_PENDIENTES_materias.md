# Materias que no cargan en Vercel — estado y tareas pendientes

> **Estado (30 oct 2026):** todos los cambios de código de este documento ya
> están implementados. Lo que queda es **operativo**: aplicar el SQL en el
> Supabase de producción, revisar las variables de Vercel y volver a desplegar.
>
> Verificado en local: `npm run typecheck` y `npm run build` pasan;
> `/api/salud` responde `ok: true` y `/api/materias` devuelve 8 materias.

## Qué quedó implementado

- **Catálogo:** `lib/supabase/materias.ts` devuelve `{ materias, error }` y
  distingue un fallo de Supabase de una tabla vacía.
- **Interfaz:** `/reportar` muestra un mensaje distinto si Supabase falló o si
  el catálogo está vacío.
- **Caché:** `/api/materias` responde `503` con `no-store` si hay error; solo
  cachea respuestas correctas con datos.
- **Diagnóstico:** `GET /api/salud` comprueba variables, tablas requeridas y
  materias activas.
- **Variables:** se validan URL y claves; se rechaza una
  `SUPABASE_SERVICE_ROLE_KEY` que sea en realidad la clave anon.
- **Login admin:** restaurado el login real con Supabase Auth y
  `public.administradores` (se eliminó la simulación).
- **Errores:** `POST /api/reportes` y las rutas admin devuelven JSON ante
  fallos de configuración/red; timeout de 8 s en las llamadas a Supabase.
- **Código de verificación:** un código ya usado responde “expirado” en lugar
  de 500.
- **SQL:** nueva migración `0004_permisos.sql` con permisos para
  `service_role`; `setup.sql` la incluye antes del seed. `0001` usa ya
  `America/Caracas`.
- **CSV:** la cabecera de `data/materias.csv` ahora es `nombre`.
- **Documentación:** README actualizado con el seed, `/api/salud` y consultas
  de comprobación.

## Tareas pendientes en producción

### 1. Aplicar el esquema y el catálogo en Supabase

En Supabase → **SQL Editor**, ejecutar **`supabase/setup.sql` completo**. Es
idempotente e incluye:

- `0001` a `0004`;
- el catálogo inicial de `materias`.

Si se usa la CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

> `supabase db push` **no ejecuta** `supabase/seed.sql`. Después hay que pegar
> `supabase/seed.sql` en el SQL Editor (o usar `supabase db reset` en local).

Comprobar que existen las tablas y que hay materias activas:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

select count(*) as total, count(*) filter (where activo) as activas
from public.materias;
```

Debe haber 8 materias activas con el seed actual.

### 2. Revisar las variables de Vercel

En **Vercel → Settings → Environment Variables**, tanto en *Production* como en
*Preview*:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` → debe ser la clave **service_role**
  (`service_role` o `sb_secret_…`), **no** la anon.
- `VERIFICACION_SECRET` → mínimo 32 caracteres.
- Correo, si se usa: `RESEND_API_KEY`/`EMAIL_FROM` o
  `GMAIL_USER`/`GMAIL_APP_PASSWORD`.

Opcional: `SUPABASE_URL` en el servidor tiene prioridad sobre
`NEXT_PUBLIC_SUPABASE_URL`.

`.env.local` no se sube a Vercel (está en `.gitignore`).

### 3. Volver a desplegar

Después de cambiar variables o subir estos cambios:

```bash
git add -A
git commit -m "Corrige conexión con Supabase y errores del catálogo"
git push
```

En Vercel, volver a desplegar **sin caché de build**: las variables
`NEXT_PUBLIC_*` se fijan al compilar.

### 4. Verificar en producción

1. Abrir `https://<dominio>/api/salud`.
   - Debe devolver `ok: true`, las 6 tablas en `true` y `materias: 8`.
   - Si faltan tablas, ejecutar `setup.sql`.
   - Si `materias` es `0`, ejecutar `seed.sql`.
2. Abrir `https://<dominio>/api/materias`.
   - Debe devolver 200 y 8 materias.
   - Si devuelve 503, revisar los *Logs* de Vercel buscando `[materias]` y
     errores `PGRST` o `42501`.
3. Abrir `/reportar`: el selector de materias debe cargar.
4. Probar el login de `/admin` con un usuario real.

### 5. Configurar el administrador

1. Supabase → Authentication → Users → crear el usuario (correo + contraseña).
2. Autorizarlo en el SQL Editor:

```sql
insert into public.administradores (user_id)
select id from auth.users where email = 'tu-admin@dominio';
```

3. Probar `/admin/login` y comprobar que `/admin` carga los reportes.

### 6. Seguridad y producción limpia

- Si `.env.local` con claves reales salió de tu máquina, rotar
  `SUPABASE_SERVICE_ROLE_KEY`, la clave de Resend y la contraseña de
  aplicación de Gmail, y actualizarlas en Vercel.
- En Vercel, poner `MOSTRAR_CODIGO_DEMO=false` y
  `NEXT_PUBLIC_MOSTRAR_CONSOLA=false` (o no definirlas).

## Pendiente opcional

- Si algún día se quiere un respaldo local del catálogo, reimplementarlo de
  forma explícita. Hoy la única fuente es Supabase y el CSV solo alimenta el
  seed.
- Añadir pruebas automatizadas para `listarMaterias()` y las rutas API.
