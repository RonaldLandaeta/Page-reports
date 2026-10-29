# Reporte de Horarios

Prototipo frontend en Next.js (App Router), React y Tailwind CSS para reportar
problemas de horarios académicos y consultar su estado.

## Rutas

| Ruta         | Descripción                                                     |
| ------------ | --------------------------------------------------------------- |
| `/`          | Inicio, accesos a reportar y consultar.                          |
| `/reportar`  | Formulario tradicional, chatbot interactivo, resumen y consola JSON. |
| `/consultar` | Consulta de un reporte mediante ticket + cédula.                 |

## Funcionalidad

- **Formulario Tradicional** con `ci`, nombre, correo, materia (`nrc`), tipo de
  error (`tipo_error`) y motivo.
- **Catálogo de materias desde CSV** (`data/materias.csv`), leído en el servidor
  en cada solicitud. No hay materias hardcodeadas en el código.
- **Verificación de correo simulada**: genera un código de 6 dígitos, lo muestra
  en pantalla (entorno demo) y exige confirmarlo antes de enviar.
- **Reglas de negocio**:
  - Se bloquea un duplicado con la misma cédula + NRC + tipo de error dentro de
    las últimas 24 horas.
  - Se permite un máximo de 5 reportes por cédula por día calendario.
- **Ticket único** con formato `TK-XXXXXX`; se comprueba contra los tickets ya
  emitidos en este navegador.
- **Modal de éxito** con ticket copiable, estado inicial y confirmación de correo
  simulada.
- **Persistencia local** en `localStorage`, con estado global en React Context.
  Sobrevive recargas y se sincroniza entre pestañas del mismo navegador.
- **Consulta protegida** con ticket + cédula, sin revelar cuál dato falló.
- **Notificaciones simuladas**: se registran en `localStorage` y en la consola
  del navegador. No se envía correo real todavía.
- **Chatbot interactivo**: guía paso a paso (cédula, nombre, correo con verificación simulada, materia, tipo de error y motivo), aplica las mismas reglas que el formulario y entrega el ticket en la conversación.
- **Consola JSON**: panel lateral con los reportes en tiempo real (`ci`, `nrc`, `tipo_error`, `motivo`, `ticket`). Se apaga con `NEXT_PUBLIC_MOSTRAR_CONSOLA=false`.
- **Supabase preparado**: `guardarEnSupabase(reporte)` está comentada en `lib/reportes/almacen.ts`.

## Reglas y configuración

Los valores están centralizados en `lib/config.ts`:

```ts
export const CONFIG = {
  maxReportesPorDia: 5,
  ventanaDuplicadosHoras: 24,
  duracionCodigoVerificacionMinutos: 10,
  claves: {
    reportes: "reportes-horarios:reportes:v1",
    notificaciones: "reportes-horarios:notificaciones:v1",
  },
} as const;
```

## Catálogo CSV

Edita `data/materias.csv`. Formato esperado:

```csv
nrc,materia,docente,horario,aula
10245,Cálculo Diferencial,Ing. María Torres,Lun y Mié · 08:00 – 10:00,B-204
```

- `nrc` y `materia` son obligatorios.
- `docente`, `horario` y `aula` son opcionales.
- Se admiten campos entre comillas y comillas escapadas.
- `/reportar` es dinámica (`force-dynamic`), por lo que los cambios al CSV se
  reflejan sin reconstruir la aplicación.

## Estructura

```
app/
  layout.tsx                     # Metadata y <ReportesProvider>
  (portal)/
    layout.tsx                   # Header, main y footer compartidos
    page.tsx                     # Inicio
    reportar/
      page.tsx                   # Server component: lee el CSV
      ReportarView.tsx           # Pestañas, formulario y resumen
    consultar/
      page.tsx
      ConsultarView.tsx          # Ticket + cédula y resultado
components/
  FormularioTradicional.tsx      # Validación, reglas y envío
  VerificacionCorreo.tsx         # Código demo de 6 dígitos
  ModalExito.tsx                 # Ticket y confirmación simulada
  ResumenReportes.tsx            # Estado global agregado
  ReporteTabs.tsx
  ChatbotPanel.tsx
  SiteHeader.tsx / SiteFooter.tsx
  icons.tsx
context/
  ReportesContext.tsx            # Estado global + casos de uso
lib/
  catalogo-materias.ts           # Lectura y parser del CSV (servidor)
  catalogos.ts                   # Tipos de error y estados
  config.ts
  notificaciones.ts              # Correo simulado
  reportes/
    almacen.ts                   # localStorage (punto de cambio por API)
    reglas.ts                    # Duplicados, límite y ticket
  validaciones.ts
  types.ts
data/
  materias.csv
```

## Puesta en marcha

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

## Migración futura a API + base de datos

El prototipo está separado para facilitar el cambio:

1. Reemplazar `leerReportes` y `guardarReportes` de `lib/reportes/almacen.ts` por
   llamadas `fetch` a la API.
2. Mover `validarReglas`, la generación del ticket y el estado a la API para que
   las reglas no puedan saltarse desde el cliente.
3. Reemplazar `VerificacionCorreo` por un flujo de código enviado y validado en
   el servidor.
4. Reemplazar `lib/notificaciones.ts` por el proveedor real de correo.
5. Sustituir `lib/catalogo-materias.ts` por el catálogo académico oficial.
6. Añadir `/admin` para gestionar estados y reportes.

## Limitaciones del prototipo

- La verificación de correo, los tickets y las notificaciones se generan en el
  cliente. Son demostrativos, no seguros para producción.
- Los reportes solo son visibles en el navegador donde se crearon.
- El catálogo se lee del sistema de archivos local.
- El código de verificación del chatbot se muestra en la conversación (demo).
