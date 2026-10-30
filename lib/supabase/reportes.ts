import "server-only";

import { esEstadoReporte, esTipoError } from "@/lib/catalogos";
import { buscarMateriaPorCodigo } from "@/lib/materias";
import type { Reporte, ReporteInput } from "@/lib/types";

import { obtenerSupabaseAdmin } from "./admin";

export interface FilaReporteDb {
  id: string;
  ticket: string;
  ci: string;
  nombre: string;
  correo: string;
  nrc: string;
  tipo_error: string;
  motivo: string;
  materia_nombre: string;
  materia_aula: string;
  estado: string;
  creado_en: string;
}

export type CodigoFalloCreacion =
  | "duplicado"
  | "limite"
  | "materia"
  | "interno";

export type ResultadoCreacion =
  | { ok: true; reporte: Reporte }
  | {
      ok: false;
      codigo: CodigoFalloCreacion;
      mensaje: string;
      ticket?: string;
    };

const CAMPOS_PUBLICOS =
  "id, ticket, ci, nombre, correo, nrc, tipo_error, motivo, materia_nombre, materia_aula, estado, creado_en";

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
    tipo_error: tipoError,
    motivo: fila.motivo,
    materiaNombre: fila.materia_nombre,
    materiaAula: fila.materia_aula,
    estado,
    creadoEn: fila.creado_en,
  };
}

/**
 * Inserta el reporte directamente en Supabase.
 * El nombre de la materia se obtiene en memoria desde el catálogo local.
 */
export async function crearReporteEnDb(
  input: ReporteInput,
): Promise<ResultadoCreacion> {
  try {
    const supabase = obtenerSupabaseAdmin();

    // 1. Resolver el nombre de la materia localmente desde tu malla
    const materiaLocal = buscarMateriaPorCodigo(input.nrc);
    const materiaNombre = materiaLocal
      ? materiaLocal.materia
      : "Materia no encontrada";

    // 2. Generar ticket único de reporte
    const ticket = `TICK-${Math.floor(100000 + Math.random() * 900000)}`;

    // 3. Insertar el reporte en Supabase
    const { data, error } = await supabase
      .from("reportes")
      .insert([
        {
          ticket,
          ci: input.ci.trim(),
          nombre: input.nombre.trim(),
          correo: input.correo.trim().toLowerCase(),
          nrc: input.nrc,
          materia_nombre: materiaNombre,
          materia_aula: "Por asignar",
          tipo_error: input.tipo_error,
          motivo: input.motivo.trim(),
          estado: "pendiente",
        },
      ])
      .select(CAMPOS_PUBLICOS)
      .single();

    if (error) {
      console.error("[reportes] error al insertar reporte en Supabase:", error);
      return {
        ok: false,
        codigo: "interno",
        mensaje: "No pudimos registrar el reporte. Intenta nuevamente.",
      };
    }

    return { ok: true, reporte: mapearReporte(data as FilaReporteDb) };
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