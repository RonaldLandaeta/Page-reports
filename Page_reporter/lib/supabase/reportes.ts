import "server-only";

import { esEstadoReporte, esTipoError } from "@/lib/catalogos";
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

interface RespuestaRpc {
  ok: boolean;
  codigo?: string;
  mensaje?: string;
  ticket?: string;
  reporte?: FilaReporteDb;
}

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
 * Reglas + ticket + persistencia viven en la función SQL `registrar_reporte`.
 * Así dos peticiones simultáneas de la misma cédula no pueden saltarse el
 * duplicado ni el límite diario.
 */
export async function crearReporteEnDb(
  input: ReporteInput,
): Promise<ResultadoCreacion> {
  const { data, error } = await obtenerSupabaseAdmin().rpc("registrar_reporte", {
    p_ci: input.ci.trim(),
    p_nombre: input.nombre.trim(),
    p_correo: input.correo.trim().toLowerCase(),
    p_nrc: input.nrc,
    p_tipo_error: input.tipo_error,
    p_motivo: input.motivo.trim(),
  });

  if (error) {
    console.error("[reportes] registrar_reporte falló.", error);
    return {
      ok: false,
      codigo: "interno",
      mensaje: "No pudimos registrar el reporte. Intenta nuevamente.",
    };
  }

  const respuesta = data as RespuestaRpc | null;

  if (!respuesta?.ok || !respuesta.reporte) {
    const codigo = respuesta?.codigo;

    return {
      ok: false,
      codigo:
        codigo === "duplicado" || codigo === "limite" || codigo === "materia"
          ? codigo
          : "interno",
      mensaje: respuesta?.mensaje ?? "No pudimos registrar el reporte.",
      ticket: respuesta?.ticket,
    };
  }

  return { ok: true, reporte: mapearReporte(respuesta.reporte) };
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
