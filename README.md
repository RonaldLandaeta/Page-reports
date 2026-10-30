# Reporte de Horarios

Aplicación web para reportar problemas de horarios académicos y consultar su
estado. Frontend en Next.js (App Router), React y Tailwind CSS; backend en
Supabase (Postgres + RLS) y correo transaccional con Resend o Gmail SMTP.

## Rutas

| Ruta         | Descripción                                                          |
| ------------ | -------------------------------------------------------------------- |
| `/`          | Inicio, accesos a reportar y consultar.                              |
| `/reportar`  | Formulario tradicional, chatbot interactivo, resumen y consola JSON. |
| `/consultar` | Consulta de un reporte mediante ticket + cédula.                     |

## Arquitectura

```
Navegador
  │  fetch JSON (sin claves de Supabase)
  ▼
Next.js Route Handlers  (/api/*)
  │  service_role + reglas + tokens firmados
  ▼
Supabase Postgres  ── RLS activo, sin acceso directo para anon
  │
  └── Resend o Gmail SMTP (código de verificación y confirmación)
```

- El navegador **nunca** recibe la `service_role` ni habla directo con la base
  de datos.
- Las reglas de negocio (duplicados, límite diario, ticket único) se ejecutan
  dentro de una función de Postgres, con un advisory lock por cédula.
- El código de verificación se genera y valida en el servidor. El cliente solo
  recibe un **token firmado** (HMAC, 20 minutos) que autoriza crear el reporte.

## Funcionalidad

- **Formulario tradicional** con cédula, nombre, correo, materia (`nrc`), tipo
  de error y motivo.
- **Catálogo de materias en Supabase** (tabla `materias`), importado desde
  `data/materias.csv` con `supabase/seed.sql`.
- **Verificación de correo real** con código de 6 dígitos enviado por Resend o
  Gmail SMTP.
  En desarrollo, si no hay `RESEND_API_KEY`, el código se muestra en pantalla.
- **Reglas de negocio en el servidor**:
  - Duplicado con la misma cédula + NRC + tipo de error en 24 horas.
  - Máximo 5 reportes por cédula por día calendario (`America/Caracas`).
- **Ticket único** `TK-XXXXXX` generado en Postgres.
- **Consulta protegida** por ticket + cédula, sin revelar cuál dato falló.
- **Correo de confirmación** con el ticket (best-effort: si falla, el reporte
  ya quedó registrado).
- **Chatbot interactivo** con el mismo flujo y las mismas reglas que el
  formulario.
- **Historial de estados** en `reporte_eventos` (trigger al cambiar `estado`).

## Puesta en marcha

### 1. Base de datos

En el dashboard de Supabase → **SQL Editor**, ejecuta en este orden:

1. `supabase/migrations/0001_init.sql` — tablas, índices, RLS, triggers y la
   función `registrar_reporte`.
2. `supabase/migrations/0002_auditoria.sql` — intentos de código atómicos,
   límite de consultas fallidas y zona horaria de Venezuela.
3. `supabase/migrations/0003_admin.sql` — tabla `administradores` y función
   para cambiar estados (panel `/admin`).
4. `supabase/seed.sql` — catálogo inicial de materias.

(`supabase/setup.sql` ya trae todo junto para pegar de una vez.)

También puedes usar la CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completa:

| Variable                        | Dónde se obtiene                                |
| ------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API               |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Project Settings → API (secreta)     |
| `VERIFICACION_SECRET`           | `openssl rand -hex 32`                          |
| `RESEND_API_KEY`                | Resend → API Keys (opcional)                    |
| `GMAIL_USER`                    | Tu correo de Gmail (opcional)                   |
| `GMAIL_APP_PASSWORD`            | Contraseña de aplicación de Google (opcional)   |
| `EMAIL_FROM`                    | Remitente; vacío usa el proveedor configurado   |
| `NEXT_PUBLIC_DOMINIOS_CORREO`   | Dominios institucionales permitidos (coma)      |

`SUPABASE_SERVICE_ROLE_KEY` y `VERIFICACION_SECRET` **no** deben llevar el
prefijo `NEXT_PUBLIC_` ni subirse al repositorio.

### 3. Correo

El orden de preferencia es: **Resend → Gmail SMTP → modo desarrollo**.

**Opción A: Gmail SMTP (rápida para probar)**

1. Activa la verificación en 2 pasos en tu cuenta de Google.
2. Entra a [myaccount.google.com/security](https://myaccount.google.com/security)
   y abre **Contraseñas de aplicaciones**.
3. Crea una para “Correo” y copia la clave de 16 caracteres.
4. En `.env.local`:

```bash
GMAIL_USER=tucorreo@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

No uses tu contraseña normal de Gmail. Si es una cuenta institucional, el
administrador puede tener las contraseñas de aplicación desactivadas.

**Opción B: Resend (recomendada para producción)**

1. Crea una cuenta en [resend.com](https://resend.com) y una API key con
   permiso *Sending access*.
2. Sin dominio propio puedes usar
   `EMAIL_FROM="Reportes Horarios <onboarding@resend.dev>"`, pero Resend solo
   entregará a la dirección del dueño de la cuenta.
3. Con dominio, verifica los registros DNS y usa
   `EMAIL_FROM="Reportes Horarios <reportes@tudominio.com>"`.

```bash
RESEND_API_KEY=re_...
EMAIL_FROM="Reportes Horarios <onboarding@resend.dev>"
```

**Modo desarrollo:** sin `RESEND_API_KEY` ni credenciales de Gmail, el código se
imprime en la consola del servidor y se devuelve como `codigoDemo`
(controlado por `MOSTRAR_CODIGO_DEMO`).

### 4. Ejecutar

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

```bash
npm run build
npm run start
npm run typecheck
```

## Panel de administración (`/admin`)

1. Supabase → Authentication → Users → crea un usuario (correo + contraseña).
2. Autorízalo (SQL Editor):
   `insert into public.administradores (user_id) select id from auth.users where email = 'tu-admin@dominio';`
3. Entra en `/admin/login`. La sesión dura lo que el JWT de Supabase (1 h por
   defecto); después pide login de nuevo. Cookie `httpOnly` + `SameSite=Strict`.
4. Filtra por estado, busca por ticket/cédula/NRC y cambia el estado con una
   nota opcional (queda en `reporte_eventos`).

## API

| Método | Ruta                          | Descripción                                      |
| ------ | ----------------------------- | ------------------------------------------------ |
| `POST` | `/api/verificacion/solicitar` | Genera y envía un código de 6 dígitos.           |
| `POST` | `/api/verificacion/validar`   | Valida el código y devuelve un token firmado.    |
| `POST` | `/api/reportes`               | Crea el reporte (exige token de verificación).   |
| `POST` | `/api/reportes/consultar`     | Consulta por ticket + cédula (POST evita la CI en logs/URL). |
| `GET`  | `/api/materias?q=`            | Catálogo activo, con búsqueda opcional.          |

Contrato de error:

```json
{
  "ok": false,
  "codigo": "duplicado",
  "mensaje": "Ya registraste un reporte...",
  "ticket": "TK-123456"
}
```

Códigos: `validacion`, `verificacion`, `duplicado`, `limite`, `materia`,
`no_encontrado`, `interno`.

## Modelo de datos

- `materias`: catálogo (`nrc` PK, nombre, docente, horario, aula, activo).
- `reportes`: reporte con copia del nombre/aula de la materia al momento del
  envío, ticket único, estado y fechas.
- `reporte_eventos`: historial de cambios de estado.
- `codigos_verificacion`: hash del código, expiración, intentos, consumo e IP
  hasheada.

RLS está activo en todas las tablas. Solo `materias` tiene lectura pública; el
resto queda denegado para `anon` y `authenticated`. La API usa `service_role`.

## Estructura

```
app/
  api/
    materias/route.ts
    reportes/route.ts
    reportes/consultar/route.ts
    verificacion/solicitar/route.ts
    verificacion/validar/route.ts
  (portal)/
    layout.tsx
    page.tsx
    reportar/page.tsx            # Server component: catálogo desde Supabase
    reportar/ReportarView.tsx
    consultar/page.tsx
    consultar/ConsultarView.tsx
components/
  FormularioTradicional.tsx      # Validación cliente + envío a la API
  VerificacionCorreo.tsx         # Código real vía API
  ChatbotPanel.tsx
  ModalExito.tsx
  ResumenReportes.tsx            # Reportes de la sesión (panel dev)
  ConsolaJson.tsx                # Panel dev; apagar en producción
  ReporteTabs.tsx
  SiteHeader.tsx / SiteFooter.tsx
  icons.tsx
context/
  ReportesContext.tsx            # Estado de sesión + llamadas a la API
lib/
  api/                           # Helpers de route handlers (respuestas, IP)
  api-cliente.ts                 # fetch tipado para el navegador
  supabase/
    admin.ts                     # Cliente service_role (solo servidor)
    materias.ts
    reportes.ts
  verificacion-servidor.ts       # Códigos, límites y tokens HMAC
  email.ts                       # Resend / Gmail SMTP
  catalogo-materias.ts           # Respaldo CSV si falta configuración
  secreto.ts                     # Secreto único de firma/hash
  catalogos.ts
  config.ts
  reportes/formato.ts
  types.ts
  validaciones.ts
supabase/
  migrations/0001_init.sql
  seed.sql
data/
  materias.csv
```

## Seguridad

- `service_role` solo en servidor; RLS bloquea el acceso directo.
- La función `registrar_reporte` es `security definer` y tiene `EXECUTE`
  revocado para `anon`/`authenticated`.
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

## Pendientes

- Rate limit distribuido (Upstash/Cloudflare) además del control en Postgres.
- Cron (`pg_cron`) para ejecutar `limpiar_codigos_vencidos()`.
- Reintentos y cola para el correo de confirmación.
- Pruebas automatizadas de las reglas y de los route handlers.
