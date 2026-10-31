import "server-only";

import { esEstadoReporte, esTipoError } from "@/lib/catalogos";
import { CONFIG } from "@/lib/config";
import type { Reporte, ReporteInput } from "@/lib/types";

import { obtenerSupabaseAdmin } from "./admin";

export interface FilaReporteDb {
  id: string;
  ticket: string;
  ci: string;
  nombre: string;
  correo: string;
  nrc: string;
  materia_codigo: string;
  materia_nombre: string;
  tipo_error: string;
  tipo_error_detalle: string | null;
  motivo: string;
  estado: string;
  creado_en: string;
}

/**
 * Reporte ya validado y con la materia resuelta desde la malla local. Lo arma
 * la API: aquí solo se aplican las reglas de duplicado/límite y se inserta.
 */
export interface ReporteNuevoDb
  extends Omit<ReporteInput, "materia_codigo"> {
  /** NRC visible (nroCurso). */
  nrc: string;
  /** Código único de la malla local. */
  materia_codigo: string;
  /** Snapshot del nombre de la materia. */
  materia_nombre: string;
}

export type CodigoFalloCreacion = "duplicado" | "limite" | "interno";

export type ResultadoCreacion =
  | { ok: true; reporte: Reporte }
  | {
      ok: false;
      codigo: CodigoFalloCreacion;
      mensaje: string;
      ticket?: string;
    };

export const CAMPOS_PUBLICOS =
  "id, ticket, ci, nombre, correo, nrc, materia_codigo, materia_nombre, tipo_error, tipo_error_detalle, motivo, estado, creado_en";

interface ReporteReciente {
  ticket: string;
  materia_codigo: string;
  tipo_error: string;
  creado_en: string;
}

/** Fecha calendario (YYYY-MM-DD) en la zona horaria configurada. */
function fechaEnZona(fecha: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function mapearReporte(fila: FilaReporteDb): Reporte {
  const tipoError = esTipoError(fila.tipo_error) ? fila.tipo_error : "otro";
  const estado = esEstadoReporte(fila.estado) ? fila.estado : "pendiente";

  return {
    id: fila.id,
    ticket: fila.ticket,
    ci: fila.ci,
    nombre: fila.nombre,
    correo: fila.correo,
    nrc: fila.nrc,
    materiaCodigo: fila.materia_codigo,
    materiaNombre: fila.materia_nombre,
    tipo_error: tipoError,
    tipoErrorDetalle: fila.tipo_error_detalle ?? "",
    motivo: fila.motivo,
    estado,
    creadoEn: fila.creado_en,
  };
}

/**
 * Aplica las reglas de duplicado y límite diario e inserta el reporte en
 * Supabase. La materia ya viene resuelta desde la malla local (la API valida
 * que el código exista); aquí no se consulta ninguna tabla de materias.
 */
export async function crearReporteEnDb(
  input: ReporteNuevoDb,
): Promise<ResultadoCreacion> {
  try {
    const supabase = obtenerSupabaseAdmin();

    const ci = input.ci.trim();
    const desde = new Date(
      Date.now() - CONFIG.ventanaDuplicadosHoras * 60 * 60 * 1000,
    ).toISOString();

    // 1. Reglas de duplicado (cédula + materia_codigo + tipo) y límite diario.
    const { data: recientes, error: errorRecientes } = await supabase
      .from("reportes")
      .select("ticket, materia_codigo, tipo_error, creado_en")
      .eq("ci", ci)
      .gte("creado_en", desde);

    if (errorRecientes) {
      console.error(
        "[reportes] no se pudieron comprobar los límites:",
        errorRecientes,
      );
      return {
        ok: false,
        codigo: "interno",
        mensaje: "No pudimos registrar el reporte. Intenta nuevamente.",
      };
    }

    const previos = (recientes ?? []) as ReporteReciente[];
    const duplicado = previos.find(
      (reporte) =>
        reporte.materia_codigo === input.materia_codigo &&
        reporte.tipo_error === input.tipo_error,
    );

    if (duplicado) {
      return {
        ok: false,
        codigo: "duplicado",
        mensaje:
          `Ya registraste un reporte para esta materia con el mismo tipo de error en las últimas ${CONFIG.ventanaDuplicadosHoras} horas.`,
        ticket: duplicado.ticket,
      };
    }

    const hoy = fechaEnZona(new Date(), CONFIG.zonaHoraria);
    const reportesHoy = previos.filter(
      (reporte) =>
        fechaEnZona(new Date(reporte.creado_en), CONFIG.zonaHoraria) === hoy,
    );

    if (reportesHoy.length >= CONFIG.maxReportesPorDia) {
      return {
        ok: false,
        codigo: "limite",
        mensaje:
          `Alcanzaste el límite de ${CONFIG.maxReportesPorDia} reportes por día. Intenta nuevamente mañana.`,
      };
    }

    // 2. Generar ticket único (TK-XXXXXX) e insertar; reintenta si choca.
    let fila: FilaReporteDb | null = null;

    for (let intento = 0; intento < 5; intento += 1) {
      const ticket = `TK-${Math.floor(100000 + Math.random() * 900000)}`;

      const { data, error } = await supabase
        .from("reportes")
        .insert([
          {
            ticket,
            ci,
            nombre: input.nombre.trim(),
            correo: input.correo.trim().toLowerCase(),
            nrc: input.nrc,
            materia_codigo: input.materia_codigo,
            materia_nombre: input.materia_nombre,
            tipo_error: input.tipo_error,
            tipo_error_detalle: input.tipo_error_detalle.trim(),
            motivo: input.motivo.trim(),
            estado: "pendiente",
          },
        ])
        .select(CAMPOS_PUBLICOS)
        .single();

      if (!error) {
        fila = data as FilaReporteDb;
        break;
      }

      // 23505: el ticket aleatorio ya existe; se prueba otro.
      if (error.code === "23505" && intento < 4) continue;

      console.error("[reportes] error al insertar reporte en Supabase:", error);
      return {
        ok: false,
        codigo: "interno",
        mensaje: "No pudimos registrar el reporte. Intenta nuevamente.",
      };
    }

    if (!fila) {
      return {
        ok: false,
        codigo: "interno",
        mensaje: "No se pudo generar un ticket único. Intenta nuevamente.",
      };
    }

    return { ok: true, reporte: mapearReporte(fila) };
  } catch (err) {
    console.error("[reportes] fallo inesperado:", err);
    return {
      ok: false,
      codigo: "interno",
      mensaje: "Ocurrió un error inesperado al procesar la solicitud.",
    };
  }
}

/** Consulta protegida: el ticket y la cédula deben coincidir. */
export async function buscarReporteEnDb(
  ticket: string,
  ci: string,
): Promise<Reporte | null> {
  const { data, error } = await obtenerSupabaseAdmin()
    .from("reportes")
    .select(CAMPOS_PUBLICOS)
    .eq("ticket", ticket)
    .eq("ci", ci)
    .maybeSingle();

  if (error) {
    console.error("[reportes] consulta falló.", error);
    throw new Error("No se pudo consultar el reporte.");
  }

  return data ? mapearReporte(data as FilaReporteDb) : null;
}