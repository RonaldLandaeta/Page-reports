import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { Reporte, TipoError } from "@/lib/types";

export type FilaReporteDb = Database["public"]["Tables"]["reportes"]["Row"];

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
  | { ok: false; codigo: string; mensaje: string; ticket?: string };

export function mapearReporte(fila: FilaReporteDb): Reporte {
  return {
    id: fila.id,
    ticket: fila.ticket,
    ci: fila.ci,
    nombre: fila.nombre,
    correo: fila.correo,
    nrc: fila.nrc,
    materiaCodigo: fila.materia_aula || "",
    materiaNombre: fila.materia_nombre,
    tipo_error: fila.tipo_error as TipoError,
    tipoErrorDetalle: "", // La tabla 'reportes' no tiene 'tipo_error_detalle', devolvemos string vacío
    motivo: fila.motivo,
    estado: fila.estado as any,
    creadoEn: fila.creado_en,
    created_at: fila.creado_en, // Solución al error: Reporte hereda created_at de ReporteInput
  };
}

export async function crearReporteEnDb(
  input: ReporteNuevoDb,
): Promise<ResultadoCreacion> {
  const supabase = obtenerSupabaseAdmin();
  const ticketGenerado = `TK-${Math.floor(100000 + Math.random() * 900000)}`;

  const { data, error } = await supabase
    .from("reportes")
    .insert({
      ticket: ticketGenerado,
      ci: input.ci,
      nombre: input.nombre,
      correo: input.correo,
      nrc: input.nrc,
      materia_nombre: input.materia_nombre,
      materia_aula: input.materia_codigo,
      tipo_error: input.tipo_error,
      motivo: input.motivo,
      estado: "pendiente",
    })
    .select()
    .single();

  if (error) {
    console.error("[supabase/reportes] Error al insertar en BD:", error);
    return {
      ok: false,
      codigo: "error_db",
      mensaje: `Error en base de datos: ${error.message}`,
    };
  }

  return {
    ok: true,
    ticket: data.ticket,
    reporte: mapearReporte(data),
  };
}