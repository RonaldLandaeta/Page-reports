# Reporte de Horarios

Aplicación web para reportar problemas de horarios académicos y consultar su
estado. Frontend en Next.js (App Router), React y Tailwind CSS; backend en
Supabase (Postgres + RLS) y correo transaccional con Resend o Gmail SMTP.


## Arquitectura

```
Navegador
  │  fetch JSON (sin claves de Supabase)
  ▼
Next.js Route Handlers  (/api/*)
  │  service_role + reglas + tokens firmados
  ▼
Supabase Postgres  ── RLS activo, sin acceso directo para anon
  │                      SOLO reportes/tickets y datos del usuario
  └── Resend o Gmail SMTP (código de verificación y confirmación)

Malla curricular ── vive en el repositorio (lib/materias), nunca en Supabase
```

- El navegador **nunca** recibe la `service_role` ni habla directo con la base
  de datos.
- Las reglas de negocio (duplicados, límite diario) se validan en el servidor;
  el ticket único se genera en la API y la base de datos garantiza su unicidad.
- **La malla curricular es local**: `MALLA_OFICIAL` en `lib/materias/index.ts`.
  En Supabase solo hay reportes, historial, códigos de verificación, intentos
  de consulta y administradores. No existen «ofertas»: la persona elige una
  materia de la malla y reporta el error que tuvo.
- El NRC visible (`nroCurso`, ej. `02002`) **se repite entre carreras**, por eso
  el formulario y el chatbot envían el **código único** (`FING-02002`,
  `TELE-02002`) y la API resuelve y guarda ambos (`nrc` y `materia_codigo`).
- El código de verificación se genera y valida en el servidor. El cliente solo
  recibe un **token firmado** (HMAC, 20 minutos) que autoriza crear el reporte.

## Funcionalidad

- **Formulario tradicional** con cédula, nombre, correo, materia (se envía
  `materia_codigo`; la lista muestra `[nroCurso] nombre` y el horario de la
  materia elegida), tipo de error y motivo (15 a 600 caracteres).
- **Tipos de error** (slug → etiqueta): `error-prerrequisito` → «Error de
  prerrequisito», `error-correquisito` → «Error de correquisito»,
  `reserva-cerrada` → «Reserva cerrada», `cruce-horario` → «Cruce de horario»,
  `cambio-horario` → «Cambio de horario», `otro` → «Otros».
- **«Otros»** muestra el campo obligatorio «Especifica el error» (máximo 100
  caracteres), que se guarda en `tipo_error_detalle`. En los demás tipos queda
  vacío.
- **Catálogo de materias local** en `lib/materias/index.ts` con los campos
  `codigo`, `nroCurso`, `materia`, `prelaciones`, `correquisitos` y
  `horarioDefecto`. Expone el tipo `Materia` (`codigo`, `nrc`, `nombre`,
  `horario`) y funciones para listar y buscar por código, NRC o nombre.
- **Verificación de correo real** con código de 6 dígitos enviado por Resend o
  Gmail SMTP.
  En desarrollo, si no hay `RESEND_API_KEY`, el código se muestra en pantalla.
- **Reglas de negocio en el servidor**:
  - Duplicado con la misma cédula + `materia_codigo` + tipo de error en 24
    horas (así `FING-02002` y `TELE-02002` son reportes distintos).
  - Máximo 5 reportes por cédula por día calendario (`America/Caracas`).
- **Ticket único** `TK-XXXXXX` generado por la API.
- **Consulta protegida** por ticket + cédula, sin revelar cuál dato falló.
- **Correo de confirmación** con el ticket (best-effort: si falla, el reporte
  ya quedó registrado).
- **Chatbot interactivo** con el mismo flujo y las mismas reglas que el
  formulario. Busca la materia por NRC, código o nombre; si un NRC coincide con
  varias materias muestra las opciones y nunca elige una al azar. Con «Otros»
  pide el detalle (máx. 100 caracteres).
- **Historial de estados** en `reporte_eventos` (trigger al cambiar `estado`).

# 🎓 Sistema Integrado de Reporte de Horarios Académicos

Una plataforma web moderna, ágil e interactiva diseñada para optimizar la comunicación entre la comunidad estudiantil y las autoridades académicas en la resolución de incidencias de inscripción y horarios.

---

## 🌟 La Solución

Tradicionalmente, la gestión de incidencias en horarios académicos (cruces de materia, cupos agotados, inconsistencias en prelaciones) genera alta congestión administrativa y respuestas tardías. 

Este sistema reemplaza los canales de atención convencionales por una experiencia digital centralizada que **automatiza la validación de solicitudes, agiliza la toma de decisiones y brinda transparencia total al usuario** mediante el seguimiento de tickets en tiempo real.

---

## 🔥 Características Principales

### 🎯 Para el Estudiante
* **Asistencia Multicanal:** Registro de solicitudes a través de un **formulario tradicional guiado** o mediante un **Chatbot interactivo** que asiste en la búsqueda inteligente de asignaturas.
* **Catálogo Integrado y Búsqueda Inteligente:** Localización inmediata de materias por código, NRC o nombre, evitando errores de selección.
* **Verificación de Identidad:** Validación rápida de correo institucional para asegurar la autenticidad de cada reporte.
* **Seguimiento Transparente:** Consulta de estado en tiempo real (`Pendiente`, `En Revisión`, `Resuelto`) únicamente con el número de ticket y documento de identidad.

### 🛡️ Para la Administración Académica
* **Panel de Control Centralizado:** Gestión eficiente e intuitiva de todos los casos reportados.
* **Acciones en Lote:** Procesamiento masivo de solicitudes y actualización simplificada de estados.
* **Exportación de Datos:** Descarga rápida de reportes para análisis operativo en formatos estándar (Excel / CSV / JSON).
* **Control de Duplicados y Reglas de Negocio:** Validación en tiempo real para prevenir reportes repetidos y saturación del sistema.

---

## 🚀 Innovación y Optimización Tecnológica

La aplicación fue desarrollada desde cero para reemplazar procesos legados de administración de usuarios por una arquitectura web moderna y de alto rendimiento:

* **Experiencia de Usuario Fluida:** Construido sobre **Next.js** y **React**, garantizando una navegación ultrarrápida y adaptada a dispositivos móviles con **Tailwind CSS**.
* **Gestión Eficiente de Datos:** Consulta de catálogo optimizada para responder al instante sin generar latencia ni sobrecargar los servidores centrales.
* **Procesamiento Asíncrono de Notificaciones:** Confirmaciones y actualizaciones enviadas al correo institucional de manera automática.
* **Privacidad y Protección por Diseño:** Arquitectura configurada bajo estándares de aislamiento de datos, validación estricta de dominios institucionales autorizados y control contra accesos no autorizados.

---

## 🗺️ Estructura del Portal

| Sección | Descripción |
| :--- | :--- |
| **Portal Principal (`/`)** | Punto de entrada intuitivo con acceso rápido a reporte y consulta. |
| **Módulo de Reporte (`/reportar`)** | Selección entre formulario estructurado o asistente virtual (Chatbot). |
| **Módulo de Consulta (`/consultar`)** | Rastreador público de estatus de solicitudes mediante ticket asignado. |
| **Panel Administrativo (`/admin`)** | Consola privada para la gestión, resolución y descarga de incidencias. |

---

## 💻 Requisitos para Ejecución en Desarrollo

Si deseas clonar y probar la aplicación en un entorno local:

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone [https://github.com/tu-usuario/reporte-horarios.git](https://github.com/tu-usuario/reporte-horarios.git)
   cd reporte-horarios
   npm install

## API

| Método | Ruta                          | Descripción                                      |
| ------ | ----------------------------- | ------------------------------------------------ |
| `POST` | `/api/verificacion/solicitar` | Genera y envía un código de 6 dígitos.           |
| `POST` | `/api/verificacion/validar`   | Valida el código y devuelve un token firmado.    |
| `POST` | `/api/reportes`               | Crea el reporte (exige token de verificación).   |
| `POST` | `/api/reportes/consultar`     | Consulta por ticket + cédula (POST evita la CI en logs/URL). |
| `GET`  | `/api/salud`                  | Diagnóstico: variables, Supabase y catálogo local. |

Contrato de error:

```json
{
  "ok": false,
  "codigo": "duplicado",
  "mensaje": "Ya registraste un reporte...",
  "ticket": "TK-123456"
}
```

Códigos: `validacion`, `verificacion`, `duplicado`, `limite`,
`no_encontrado`, `interno`.

Cuerpo de `POST /api/reportes` (el servidor resuelve `nrc` y `materia_nombre`
desde la malla local):

```json
{
  "ci": "12345678",
  "nombre": "Ana Martínez",
  "correo": "ana@universidad.edu.ve",
  "materia_codigo": "TELE-02002",
  "tipo_error": "otro",
  "tipo_error_detalle": "La sección no aparece en mi reserva",
  "motivo": "Describe el problema (15 a 600 caracteres).",
  "verificacionToken": "..."
}
```

`materia_codigo` debe existir en la malla local; si `tipo_error` es `otro`,
`tipo_error_detalle` es obligatorio y de máximo 100 caracteres (en los demás
tipos se ignora).

### Diagnóstico rápido

`GET /api/salud` comprueba, sin exponer claves:

- que `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`) sea válida;
- que `SUPABASE_SERVICE_ROLE_KEY` sea la clave `service_role`;
- que exista `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- que `VERIFICACION_SECRET` tenga al menos 32 caracteres;
- que existan las tablas `reportes`, `reporte_eventos`,
  `codigos_verificacion`, `consulta_intentos` y `administradores`;
- que las columnas de `reportes` coincidan con `lib/supabase/types.ts`
  (detecta bases con migraciones viejas);
- cuántas materias tiene el catálogo local (`lib/materias/index.ts`) y cuántos
  reportes hay registrados.

Además devuelve:

- `proyecto`: host del Supabase usado (p. ej. `abcd.supabase.co`). No es un
  secreto; sirve para comparar local y producción.
- `fuenteUrl`: `SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_URL`, según cuál se usó.
  Recuerda que `SUPABASE_URL` tiene prioridad en el servidor.

Si `ok` es `false`, el campo `mensaje` indica qué revisar. Los fallos también
aparecen en los logs de Vercel con el prefijo `[api/salud]`.

> Si los reportes fallan con un error de columna (`materia_codigo` o
> `tipo_error_detalle` inexistentes) o de tipo (`estado`/`tipo_error` como
> texto en vez de enum), ejecuta `supabase/setup.sql` completo o la migración
> `0007_esquema_consistente.sql` en el proyecto que muestra `proyecto`.

### Comprobaciones en Supabase

Si `/api/salud` responde `ok: false`, revisa en el SQL Editor:

```sql
-- ¿Existen todas las tablas?
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- ¿Existen las funciones que usa la app?
select proname
from pg_proc
where proname in (
  'registrar_intento_codigo',
  'consumir_codigo',
  'cambiar_estado_reporte',
  'limpiar_codigos_vencidos'
)
order by proname;

-- ¿Los enums están creados y las columnas los usan?
select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typnamespace = 'public'::regnamespace
order by t.typname, e.enumsortorder;

select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reportes'
  and column_name in ('estado', 'tipo_error');

-- ¿Quedaron restricciones viejas?
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.reportes'::regclass;
```

Si falta alguna tabla o función, vuelve a ejecutar `supabase/setup.sql`
completo. Es idempotente.


## Seguridad

- `service_role` solo en servidor; RLS bloquea el acceso directo.
- `0004_permisos.sql` concede a `service_role` los permisos de tabla y
  secuencia que necesita la Data API, aunque la exposición automática esté
  desactivada.
- La escritura de reportes se hace con `service_role`; las funciones SQL de
  verificación tienen `EXECUTE` revocado para `anon`/`authenticated`.
- El token de verificación queda ligado a una cédula (una cédula puede tener
  varios tokens; un token sirve para una sola cédula).
- Tokens HMAC con expiración; códigos guardados como hash, con límite de
  intentos y expiración.
- Límites de solicitud de códigos por correo (5/hora, 1 cada 60 s) y por IP
  (20/hora).
- Intentos de código contados y canje del código hechos de forma atómica en
  Postgres.
- Consulta por ticket + cédula: máximo 10 consultas fallidas por IP cada 15
  min; el correo se devuelve enmascarado.
- Solo correos de `NEXT_PUBLIC_DOMINIOS_CORREO` pueden verificarse.
- Cabeceras de seguridad en `next.config.ts`.
- La consola JSON muestra cédula y motivo: en producción está apagada salvo
  que pongas `NEXT_PUBLIC_MOSTRAR_CONSOLA=true`.
