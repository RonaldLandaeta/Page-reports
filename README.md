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
  └── Resend o Gmail SMTP (confirmación del ticket)

Malla curricular ── vive en el repositorio (lib/materias), nunca en Supabase
```

- El navegador **nunca** recibe la `service_role` ni habla directo con la base
  de datos.
- Las reglas de negocio (duplicados, límite diario) se validan en el servidor;
  el ticket único se genera en la API y la base de datos garantiza su unicidad.
- **La malla curricular es local**: `MALLA_OFICIAL` en `lib/materias/index.ts`.
  En Supabase solo hay reportes, historial, credenciales TOTP, códigos de
  enrolamiento, intentos de consulta y administradores. No existen «ofertas»: la
  persona elige una materia de la malla y reporta el error que tuvo.
- El NRC visible (`nroCurso`, ej. `02002`) **se repite entre carreras**, por eso
  el formulario y el chatbot envían el **código único** (`FING-02002`,
  `TELE-02002`) y la API resuelve y guarda ambos (`nrc` y `materia_codigo`).
- La identidad se comprueba con **TOTP** (Google Authenticator, Authy, 1Password,
  Microsoft Authenticator). El secreto se genera y cifra en el servidor; el
  cliente solo recibe un **token firmado** (HMAC, 20 minutos) que autoriza crear
  el reporte. El correo institucional sigue siendo obligatorio como dato de
  contacto, pero ya no prueba la identidad.

## Funcionalidad

- **Formulario tradicional** con cédula, nombre, correo, tipo de alumno
  (`Alumno`, `Beca trabajo`, `Deportista` o `Colaboradores`), materia (se envía
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
- **Verificación con app de autenticación (TOTP)**. Un administrador genera un
  código de enrolamiento de un solo uso para la cédula; el estudiante lo canjea,
  escanea el QR y confirma con el primer código de 6 dígitos. Después solo
  necesita el código de su app para reportar. Si pierde el teléfono, el panel
  ofrece **«Reiniciar mi app»**: un administrador genera un código de reinicio
  (que invalida la app anterior) y el estudiante vincula una nueva.
- **Reglas de negocio en el servidor**:
  - Duplicado con la misma cédula + `materia_codigo` + tipo de error en 24
    horas (así `FING-02002` y `TELE-02002` son reportes distintos).
  - Máximo 10 reportes por cédula por día calendario (`America/Caracas`).
- **Ticket único** `TK-XXXXXXX` (7 dígitos) generado por la API.
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
* **Verificación de Identidad:** Enrolamiento con app de autenticación (TOTP) y token de un solo uso para autorizar cada reporte.
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
   git clone https://github.com/tu-usuario/reporte-horarios.git
   cd reporte-horarios
   npm install

## API

| Método | Ruta                             | Descripción                                                   |
| ------ | -------------------------------- | ------------------------------------------------------------- |
| `POST` | `/api/verificacion/estado`       | Indica si la cédula ya tiene una app vinculada.               |
| `POST` | `/api/verificacion/enrolar`      | Canjea el código de enrolamiento y devuelve el QR.            |
| `POST` | `/api/verificacion/confirmar`    | Confirma el primer TOTP y devuelve el token firmado.          |
| `POST` | `/api/verificacion/validar`      | Valida un TOTP y devuelve el token firmado.                   |
| `POST` | `/api/reportes`                  | Crea el reporte (exige token de verificación).                |
| `POST` | `/api/reportes/consultar`        | Consulta por ticket + cédula (POST evita la CI en logs/URL).  |
| `POST` | `/api/admin/login`               | Valida correo y contraseña; devuelve el token previo al TOTP. |
| `POST` | `/api/admin/totp/enrolar`        | Devuelve el QR para el primer inicio de sesión del admin.     |
| `POST` | `/api/admin/totp/confirmar`      | Confirma el primer TOTP y crea la cookie de sesión.           |
| `POST` | `/api/admin/totp/validar`        | Valida el TOTP y crea la cookie de sesión.                    |
| `POST` | `/api/admin/estudiantes/enrolamiento` | Genera un código de enrolamiento para una cédula.        |

Contrato de error:

```json
{
  "ok": false,
  "codigo": "duplicado",
  "mensaje": "Ya registraste un reporte...",
  "ticket": "TK-1234567"
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
  "correo": "ana@est.ucab.edu.ve",
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

### Panel de administración (`/admin`)

1. Supabase → Authentication → Users → crea el primer usuario (correo +
   contraseña, marca **Auto Confirm User**) y autorízalo:
   `insert into public.administradores (user_id) select id from auth.users where email = 'tu-admin@dominio';`
   (la migración 0007 convierte en `super` al administrador más antiguo).
2. La contraseña es solo el primer factor. En el primer inicio de sesión el
   administrador debe vincular obligatoriamente una app de autenticación (TOTP):
   se muestra un QR y hay que confirmar con el primer código de 6 dígitos. En
   los siguientes accesos se pide el código de la app. **No se crea ninguna
   cookie de sesión hasta superar el segundo factor.**
3. La sesión es una cookie `httpOnly` firmada de **2 horas como máximo**
   (`ADMIN_SESION_HORAS` solo puede acortarla), sin renovación. En cada
   petición se lee de la base si el usuario sigue siendo administrador y con
   qué rol: si lo quitas o lo degradas, rige al instante.
4. Roles: `admin` gestiona reportes; `super` además agrega/quita
   administradores, cambia roles y reinicia la app TOTP de otro administrador
   (sección «Administradores», solo visible para super). Un trigger impide
   dejar el sistema sin ningún super. No hay códigos de respaldo: la
   recuperación es siempre un reinicio por un super.
5. Cualquier administrador puede generar **códigos de enrolamiento para
   estudiantes** desde el panel: se introduce la cédula, se entrega el código de
   un solo uso (24 h) y el estudiante lo canjea escaneando el QR. El mismo
   mecanismo sirve para reiniciar la app si el estudiante cambió de teléfono.
6. Lotes: marca reportes y pásalos de estado juntos. Para descargar (CSV para
   Excel o JSON para app_ingresos) escribe un rango de números de llegada
   (p. ej. `1-10`, que incluye todas las cédulas con llegada 1 a 10) o descarga
   todo lo que cumpla el filtro (hasta 5000). Al descargar, los «Pendiente de
   revisión» pasan a «En revisión».
7. Auditoría: cada intento de login queda en `public.admin_intentos` (correo,
   IP hasheada, motivo, incluido `mfa_requerido` y `mfa_fallido`) y cada cambio
   de estado guarda en `reporte_eventos.admin_email` quién lo hizo.

### Exportación para app_ingresos (`datos.json`)

En `/admin`, con el formato **JSON (app de ingreso)**, la descarga genera
`datos-AAAA-MM-DD-HH-MM.json` listo para cargar en `app_ingresos`
(`POST /api/admin/reportes` con `accion: "descargar"` y `formato: "json"`).
Solo contiene los datos que la app necesita; ticket, estado, fechas y motivo
no salen en este archivo (están en el CSV).

```json
{
  "estudiantes": [
    {
      "ci": "28123456",
      "nombre": "Carlos Mendoza",
      "correo": "carlos@est.ucab.edu.ve",
      "perfil": "Alumno"
    }
  ],
  "reportes": [
    {
      "ci": "28123456",
      "tipo_error": "Cruce de horario",
      "nrc": "02002",
      "cod": "TELE-02002",
      "materia": "Circuitos Eléctricos",
      "horario": "Sábado 08:00-12:00"
    }
  ]
}
```

* `estudiantes` trae una sola fila por cédula; si el alumno cambió su nombre,
  correo o perfil entre reportes, queda el del reporte más reciente.
* `perfil` es el tipo de alumno declarado en el formulario: `Alumno`,
  `Beca trabajo`, `Deportista` o `Colaboradores` (tutores, consejeros...).
* `tipo_error` va con la etiqueta legible del catálogo (`Error de prerrequisito`,
  `Error de correquisito`, `Reserva cerrada`, `Cruce de horario`,
  `Cambio de horario`, `Otros`).
* `nrc` es el número de curso. **Se repite entre carreras** (p. ej. `02002`
  existe en FING, MECA y TELE), por eso cada reporte lleva también `cod`, el
  código único de la malla, que es con el que `app_ingresos` enlaza la materia.
* `horario` sale de la malla local; si el código ya no existe en la malla
  queda vacío.

### Diagnóstico

Los errores de configuración (variables faltantes, URL inválida o clave con el
rol equivocado) se registran en los logs de Vercel con el prefijo
`[supabase/...]` o `[api/...]`. No hay un endpoint público de diagnóstico: así
no se expone el estado interno del proyecto.

> Si los reportes fallan con un error de columna (`materia_codigo` o
> `tipo_error_detalle` inexistentes), de tipo (`estado`/`tipo_error` como
> texto en vez de enum) o de función (`crear_reporte` inexistente), ejecuta
> `supabase/setup.sql` completo o las migraciones pendientes (la última es
> `0014_totp.sql`).

### Comprobaciones en Supabase

Si algo falla, revisa en el SQL Editor:

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
  'crear_totp_pendiente',
  'enrolar_estudiante',
  'confirmar_totp',
  'marcar_paso_totp',
  'registrar_fallo_totp',
  'generar_codigo_enrolamiento',
  'cambiar_estado_reporte',
  'crear_reporte',
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
- `0009_cerrar_acceso_publico.sql` borra cualquier política creada a mano,
  deja RLS activo y retira todos los permisos de tablas, secuencias y
  funciones a `anon` y `authenticated`; las tablas nuevas nacen cerradas.
- La escritura de reportes se hace con `service_role`; las funciones SQL de
  verificación tienen `EXECUTE` revocado para `anon`/`authenticated`.
- El token de verificación queda ligado a una cédula y al correo del formulario
  (una cédula puede tener varios tokens; un token sirve para una sola cédula).
- Los secretos TOTP se guardan cifrados con AES-256-GCM. La clave se deriva de
  `TOTP_SECRET` (o de `VERIFICACION_SECRET` si no se define) y nunca se expone
  al navegador.
- Cada código TOTP se acepta una sola vez: `marcar_paso_totp` impide reutilizar
  el mismo paso de 30 s. Cinco fallos bloquean la app 15 minutos.
- Los códigos de enrolamiento son de un solo uso, se guardan como hash HMAC,
  vencen a las 24 h y solo los genera un administrador autenticado.
- Los tokens previos al segundo factor de `/admin` viven 10 minutos y solo
  autorizan el enrolamiento o la validación TOTP; no son cookies de sesión.
- **Solo se acepta el dominio institucional exacto `@est.ucab.edu.ve`** como
  dato de contacto, tanto en el formulario como al crear el reporte. No se
  configura por variable.
- **Un correo institucional solo puede quedar vinculado a una cédula**: se
  comprueba al validar el TOTP y otra vez, de forma atómica, en
  `crear_reporte`.
- Consulta por ticket + cédula: máximo 10 consultas fallidas por IP y 20 por
  cédula cada 15 min; el correo se devuelve enmascarado.
- Login de `/admin`: máximo 10 intentos fallidos por IP y 5 por correo cada
  15 min (el bloqueo por correo frena ataques distribuidos; también permite
  bloquear una cuenta a propósito, decisión aceptada). El TOTP es obligatorio y
  se auditan `mfa_requerido` y `mfa_fallido`.
- La sesión de administrador usa una cookie `httpOnly` firmada con prefijo
  `__Host-` en producción (sin `Domain`, `Secure` y `Path=/`).
- La creación del reporte es atómica en Postgres (`crear_reporte`): un
  advisory lock por cédula y por correo impide saltarse el duplicado de 24 h,
  el límite diario o la regla «un correo, una cédula» con peticiones
  simultáneas. En producción no hay ruta de respaldo: si falta la función, la
  API falla de forma visible. Ejecuta `supabase/setup.sql` para actualizarla.
- El ticket duplicado solo se devuelve a quien usa el mismo correo del token de
  verificación; a cualquier otra persona solo se le informa que el reporte ya
  existe.
- Los tickets nuevos llevan **7 dígitos** (`TK-1234567`); los antiguos de 6
  siguen siendo consultables.
- Las peticiones JSON tienen un tope de 64 KB y las respuestas de API llevan
  `Cache-Control: no-store`.
- La IP solo se toma de cabeceras de proxy cuando la plataforma las controla
  (Vercel/Cloudflare) o cuando se activa `TRUST_PROXY_HEADERS=true`. El valor
  se valida con `net.isIP()`, así que una cabecera falsa o basura no sirve
  para saltarse los límites.
- Cabeceras de seguridad en `next.config.ts`: CSP, HSTS (solo producción),
  `X-Frame-Options`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `Permissions-Policy` y `nosniff`.
- El correo de confirmación es best-effort: si no hay proveedor o falla, el
  reporte ya quedó registrado y solo se pierde la notificación.
- La consola JSON muestra cédula y motivo: solo existe en desarrollo y en
  producción siempre queda apagada.
