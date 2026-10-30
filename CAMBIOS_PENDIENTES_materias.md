# Materias que no cargan en Vercel — cambios y tareas pendientes

## Diagnóstico
La app ya **no lee `data/materias.csv`**. Desde el commit `fd02972` el catálogo
sale de la tabla `public.materias` de Supabase (`lib/supabase/materias.ts` →
`listarMaterias()`). `lib/catalogo-materias.ts` no la importa nadie.
Si en producción la tabla está vacía, faltan variables de entorno o las filas
tienen `activo = false`, `listarMaterias()` devuelve `[]` sin avisar.

Decisión tomada: **Supabase es la única fuente del catálogo**. El CSV solo
alimenta `supabase/seed.sql`.

## A. Archivos ya modificados (copiar sobre el proyecto, misma ruta)
- `next.config.ts` → vuelve a la versión del último commit (quita `outputFileTracingIncludes`, ya innecesario).
- `app/api/materias/route.ts` → no cachea respuestas vacías (`no-store`); con datos mantiene `s-maxage=300`.
- `components/FormularioTradicional.tsx` → el aviso de catálogo vacío ya no manda a revisar el CSV.
- `lib/supabase/materias.ts` → `console.warn` si la tabla no devuelve filas activas.
- `README.md` → aclara que el CSV es solo fuente del seed; quita la mención al respaldo CSV.

## B. Archivo a borrar
- `lib/catalogo-materias.ts` (código muerto; verificado con grep que nadie lo importa).

## C. Tareas que NO puede hacer una IA sobre el código (hazlas tú o con una IA con acceso)
1. **Comprobar la tabla en el Supabase de producción** (SQL Editor):
   `select count(*) as total, count(*) filter (where activo) as activas from public.materias;`
   - Si `total = 0`: ejecutar `supabase/seed.sql` en ese proyecto.
   - Si `total > 0` y `activas = 0`: `update public.materias set activo = true;`
2. **Confirmar que producción apunta al proyecto de Supabase correcto** (URL y service_role son del mismo proyecto donde corriste el seed).
3. **Variables de entorno en Vercel** (Settings → Environment Variables, entorno *Production*):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VERIFICACION_SECRET`
   (+ correo: `RESEND_API_KEY`/`EMAIL_FROM` o `GMAIL_USER`/`GMAIL_APP_PASSWORD`).
   `.env.local` NO se sube a Vercel (está en `.gitignore`).
4. **Volver a desplegar** tras cambiar variables o subir estos cambios (`git add -A && git commit && git push`).
5. **Verificar en producción**: abrir `/api/materias` → debe devolver 8 materias (con el seed actual). Si devuelve `materias: []`, revisar *Logs* de Vercel buscando `[materias]`.
6. **Seguridad**: el zip incluía `.env.local` con claves reales. Si salió de tu máquina, rotar `SUPABASE_SERVICE_ROLE_KEY`, la clave de Resend y la contraseña de aplicación de Gmail, y actualizarlas en Vercel.
7. **Producción limpia (recordatorio)**: en Vercel poner `MOSTRAR_CODIGO_DEMO` y `NEXT_PUBLIC_MOSTRAR_CONSOLA` en `false` o no definirlas.

## D. Mejoras opcionales (a decidir)
- Que `listarMaterias()` distinga "error" de "tabla vacía" (devolver `{ materias, error }`) y que `/reportar` muestre un mensaje distinto en cada caso.
- Añadir `/api/salud` que haga un `select count(*)` a `materias` para diagnosticar producción de un vistazo.
- Si algún día se quiere respaldo local, reimplementarlo de forma explícita (y restaurar `outputFileTracingIncludes`); hoy no existe.

## Notas de verificación
- No pude ejecutar `tsc`/`next build` aquí (sin red ni dependencias completas). Antes de desplegar: `npm run typecheck && npm run build`.
