import "server-only";

import { randomInt } from "node:crypto";

import type { CodigoErrorApi } from "@/lib/api/respuestas";
import { CONFIG } from "@/lib/config";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import type { FilaReporteDb } from "@/lib/supabase/types";
import type { Reporte, TipoError } from "@/lib/types";

export type { FilaReporteDb };

/** Columnas que puede ver un administrador (nunca se envían secretos). */
export const CAMPOS_PUBLICOS =
  "id,ticket,ci,nombre,correo,nrc,materia_codigo,materia_nombre,tipo_error,tipo_error_detalle,motivo,estado,creado_en,actualizado_en" as const;

/** Datos que ya vienen validados desde la API y se insertan en Postgres. */
export type ReporteNuevoDb = {
  ci: string;
  nombre: string;
  correo: string;
  nrc: string;
  materia_codigo: string;
  materia_nombre: string;
  tipo_error: TipoError;
  tipo_error_detalle?: string;
  motivo: string;
};

export type ResultadoCreacion =
  | { ok: true; reporte: Reporte; ticket: string }
  | { ok: false; codigo: CodigoErrorApi; mensaje: string; ticket?: string };

/** Traduce la fila de Postgres (snake_case) al modelo de la aplicación. */
export function mapearReporte(fila: FilaReporteDb): Reporte {
  return {
    id: fila.id,
    ticket: fila.ticket,
    ci: fila.ci,
    nombre: fila.nombre,
    correo: fila.correo,
    nrc: fila.nrc,
    materiaCodigo: fila.materia_codigo,
    materiaNombre: fila.materia_nombre,
    tipo_error: fila.tipo_error,
    tipoErrorDetalle: fila.tipo_error_detalle,
    motivo: fila.motivo,
    estado: fila.estado,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

const CODIGOS_API: ReadonlySet<string> = new Set<CodigoErrorApi>([
  "validacion",
  "verificacion",
  "duplicado",
  "limite",
  "materia",
  "no_encontrado",
  "interno",
]);

function esCodigoErrorApi(valor: unknown): valor is CodigoErrorApi {
  return typeof valor === "string" && CODIGOS_API.has(valor);
}

function codigoDeErrorDb(error: { code?: string }): CodigoErrorApi {
  if (error.code === "23514") return "validacion"; // CHECK
  if (error.code === "23502") return "validacion"; // NOT NULL
  if (error.code === "22P02") return "validacion"; // valor inválido para el enum
  return "interno";
}

/**
 * Crea el reporte con una sola llamada a Postgres. La función `crear_reporte`
 * (migración 0008) comprueba duplicado y límite diario bajo un advisory lock
 * por cédula: dos peticiones simultáneas no pueden saltarse las reglas.
 */
export async function crearReporteEnDb(
  input: ReporteNuevoDb,
): Promise<ResultadoCreacion> {
  const detalle =
    input.tipo_error === "otro"
      ? (input.tipo_error_detalle ?? "").trim().replace(/\s+/g, " ").slice(0, 100)
      : "";

  if (input.tipo_error === "otro" && detalle.length === 0) {
    return {
      ok: false,
      codigo: "validacion",
      mensaje: "Especifica el error cuando eliges «Otros».",
    };
  }

  const { data, error } = await obtenerSupabaseAdmin().rpc("crear_reporte", {
    p_ci: input.ci,
    p_nombre: input.nombre,
    p_correo: input.correo,
    p_nrc: input.nrc,
    p_materia_codigo: input.materia_codigo,
    p_materia_nombre: input.materia_nombre,
    p_tipo_error: input.tipo_error,
    p_tipo_error_detalle: detalle,
    p_motivo: input.motivo,
  });

  if (error) {
    console.error("[supabase/reportes] crear_reporte falló:", error);

    // PGRST202 / 42883: la función no existe porque falta la migración 0008.
    // En producción NO se usa el respaldo: reintroduce la carrera TOCTOU y ya
    // no conoce las reglas nuevas. Es preferible fallar de forma visible a
    // degradar la seguridad en silencio.
    if (
      (error.code === "PGRST202" || error.code === "42883") &&
      process.env.NODE_ENV !== "production"
    ) {
      console.warn(
        "[supabase/reportes] falta la migración 0008 (crear_reporte); usando respaldo no atómico.",
      );
      return crearReporteDeRespaldo(input, detalle);
    }

    return {
      ok: false,
      codigo: codigoDeErrorDb(error),
      mensaje: "No pudimos guardar el reporte. Intenta nuevamente.",
    };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.error("[supabase/reportes] respuesta inesperada de crear_reporte.");
    return {
      ok: false,
      codigo: "interno",
      mensaje: "No pudimos guardar el reporte. Intenta nuevamente.",
    };
  }

  const resultado = data as Record<string, unknown>;

  if (resultado.ok === true) {
    const reporte = resultado.reporte;

    if (
      typeof reporte === "object" &&
      reporte !== null &&
      !Array.isArray(reporte) &&
      typeof (reporte as { ticket?: unknown }).ticket === "string"
    ) {
      const fila = reporte as FilaReporteDb;
      return { ok: true, ticket: fila.ticket, reporte: mapearReporte(fila) };
    }

    console.error("[supabase/reportes] crear_reporte no devolvió el reporte.");
    return {
      ok: false,
      codigo: "interno",
      mensaje: "No pudimos guardar el reporte. Intenta nuevamente.",
    };
  }

  const codigo = esCodigoErrorApi(resultado.codigo)
    ? resultado.codigo
    : "interno";
  const mensaje =
    typeof resultado.mensaje === "string"
      ? resultado.mensaje
      : "No pudimos guardar el reporte. Intenta nuevamente.";
  const ticket =
    typeof resultado.ticket === "string" ? resultado.ticket : undefined;

  return { ok: false, codigo, mensaje, ...(ticket ? { ticket } : {}) };
}

/** Ticket aleatorio para la ruta de respaldo (la RPC usa random() en SQL). */
function generarTicket(): string {
  // 7 dígitos: 9 000 000 combinaciones frente a 900 000.
  return `TK-${randomInt(1_000_000, 10_000_000)}`;
}

/** Inicio del día calendario en la zona configurada, expresado en UTC. */
function inicioDelDiaEnZona(): string {
  const ahora = new Date();

  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);

  const nombreZona = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.zonaHoraria,
    timeZoneName: "longOffset",
  })
    .formatToParts(ahora)
    .find((parte) => parte.type === "timeZoneName")?.value;

  const coincidencia = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(
    nombreZona ?? "",
  );
  const signo = coincidencia?.[1] === "-" ? -1 : 1;
  const desplazamientoMinutos =
    signo *
    (Number(coincidencia?.[2] ?? 0) * 60 + Number(coincidencia?.[3] ?? 0));

  const inicio = new Date(`${fecha}T00:00:00.000Z`);
  inicio.setUTCMinutes(inicio.getUTCMinutes() - desplazamientoMinutos);

  return inicio.toISOString();
}

async function buscarTicketDuplicado(
  ci: string,
  correo: string,
  materiaCodigo: string,
  tipoError: TipoError,
): Promise<{ ticket: string | null } | null> {
  const desde = new Date(
    Date.now() - CONFIG.ventanaDuplicadosHoras * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await obtenerSupabaseAdmin()
    .from("reportes")
    .select("ticket,correo")
    .eq("ci", ci)
    .eq("materia_codigo", materiaCodigo)
    .eq("tipo_error", tipoError)
    .gte("creado_en", desde)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // La cédula no demuestra identidad: solo quien usa el mismo correo
  // verificado puede recibir el ticket del reporte duplicado.
  const mismoCorreo = data.correo.toLowerCase() === correo.toLowerCase();

  return { ticket: mismoCorreo ? data.ticket : null };
}

async function contarReportesDelDia(ci: string): Promise<number> {
  const { count, error } = await obtenerSupabaseAdmin()
    .from("reportes")
    .select("id", { count: "exact", head: true })
    .eq("ci", ci)
    .gte("creado_en", inicioDelDiaEnZona());

  if (error) throw error;

  return count ?? 0;
}

/**
 * Ruta de respaldo para bases sin la migración 0008. Aplica las mismas reglas,
 * pero con consultas separadas: dos peticiones simultáneas podrían colarse.
 * Se elimina en cuanto `crear_reporte` esté disponible.
 */
async function crearReporteDeRespaldo(
  input: ReporteNuevoDb,
  detalle: string,
): Promise<ResultadoCreacion> {
  // Un correo institucional solo puede quedar vinculado a una cédula. La RPC
  // lo garantiza con un lock; esta ruta de respaldo (solo desarrollo) lo
  // comprueba antes de insertar.
  const { data: vinculo, error: errorVinculo } = await obtenerSupabaseAdmin()
    .from("reportes")
    .select("ci")
    .eq("correo", input.correo)
    .limit(1)
    .maybeSingle();

  if (errorVinculo) throw errorVinculo;

  if (vinculo && vinculo.ci !== input.ci) {
    return {
      ok: false,
      codigo: "validacion",
      mensaje:
        "Este correo ya está vinculado a otra cédula. Usa el correo con el que registraste tus reportes.",
    };
  }

  const duplicado = await buscarTicketDuplicado(
    input.ci,
    input.correo,
    input.materia_codigo,
    input.tipo_error,
  );

  if (duplicado) {
    return {
      ok: false,
      codigo: "duplicado",
      mensaje: `Ya existe un reporte para esta materia con el mismo tipo de error en las últimas ${CONFIG.ventanaDuplicadosHoras} horas.`,
      ...(duplicado.ticket ? { ticket: duplicado.ticket } : {}),
    };
  }

  const reportesDelDia = await contarReportesDelDia(input.ci);

  if (reportesDelDia >= CONFIG.maxReportesPorDia) {
    return {
      ok: false,
      codigo: "limite",
      mensaje: `Alcanzaste el límite de ${CONFIG.maxReportesPorDia} reportes por día. Intenta nuevamente mañana.`,
    };
  }

  for (let intento = 1; intento <= 5; intento += 1) {
    const ticket = generarTicket();

    const { data, error } = await obtenerSupabaseAdmin()
      .from("reportes")
      .insert({
        ticket,
        ci: input.ci,
        nombre: input.nombre,
        correo: input.correo,
        nrc: input.nrc,
        materia_codigo: input.materia_codigo,
        materia_nombre: input.materia_nombre,
        tipo_error: input.tipo_error,
        tipo_error_detalle: detalle,
        motivo: input.motivo,
      })
      .select(CAMPOS_PUBLICOS)
      .single();

    if (!error && data) {
      return { ok: true, ticket, reporte: mapearReporte(data) };
    }

    if (error?.code === "23505") continue;

    console.error("[supabase/reportes] respaldo: no se pudo insertar:", error);
    return {
      ok: false,
      codigo: codigoDeErrorDb(error ?? {}),
      mensaje: "No pudimos guardar el reporte. Intenta nuevamente.",
    };
  }

  return {
    ok: false,
    codigo: "interno",
    mensaje: "No pudimos generar un ticket único. Intenta nuevamente.",
  };
}

/** Busca por ticket + cédula (ambos datos deben venir validados por la API). */
export async function buscarReporteEnDb(
  ticket?: string | null,
  ci?: string | null,
): Promise<Reporte | null> {
  const ticketNormalizado = ticket?.trim().toUpperCase() ?? "";
  const ciNormalizada = ci?.trim() ?? "";

  if (!ticketNormalizado && !ciNormalizada) return null;

  let consulta = obtenerSupabaseAdmin()
    .from("reportes")
    .select(CAMPOS_PUBLICOS);

  if (ticketNormalizado) consulta = consulta.eq("ticket", ticketNormalizado);
  if (ciNormalizada) consulta = consulta.eq("ci", ciNormalizada);

  const { data, error } = await consulta
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[supabase/reportes] consulta falló:", error);
    return null;
  }

  return mapearReporte(data);
}
