import { esEstadoReporte, esTipoError } from "@/lib/catalogos";
import { CONFIG } from "@/lib/config";
import type { Notificacion, Reporte, TipoError } from "@/lib/types";

function normalizarReporte(value: unknown): Reporte | null {
  if (typeof value !== "object" || value === null) return null;

  const reporte = value as Record<string, unknown>;
  const tipoError =
    typeof reporte.tipo_error === "string" ? reporte.tipo_error : "";

  if (
    typeof reporte.id !== "string" ||
    typeof reporte.ticket !== "string" ||
    typeof reporte.ci !== "string" ||
    typeof reporte.nombre !== "string" ||
    typeof reporte.correo !== "string" ||
    typeof reporte.nrc !== "string" ||
    typeof reporte.motivo !== "string" ||
    typeof reporte.creadoEn !== "string" ||
    !esTipoError(tipoError)
  ) {
    return null;
  }

  const estado =
    typeof reporte.estado === "string" && esEstadoReporte(reporte.estado)
      ? reporte.estado
      : "pendiente";

  return {
    id: reporte.id,
    ticket: reporte.ticket,
    ci: reporte.ci,
    nombre: reporte.nombre,
    correo: reporte.correo,
    nrc: reporte.nrc,
    tipo_error: tipoError as TipoError,
    motivo: reporte.motivo,
    materiaNombre:
      typeof reporte.materiaNombre === "string"
        ? reporte.materiaNombre
        : `NRC ${reporte.nrc}`,
    materiaAula:
      typeof reporte.materiaAula === "string" ? reporte.materiaAula : "",
    creadoEn: reporte.creadoEn,
    estado,
  };
}

/**
 * Capa de acceso al almacenamiento local del prototipo.
 * Al integrar la API, solo estas funciones deben reemplazarse por fetch.
 */
export function leerReportes(): Reporte[] {
  if (typeof window === "undefined") return [];

  try {
    const guardado = window.localStorage.getItem(CONFIG.claves.reportes);
    if (!guardado) return [];

    const datos: unknown = JSON.parse(guardado);
    if (!Array.isArray(datos)) return [];

    return datos
      .map(normalizarReporte)
      .filter((reporte): reporte is Reporte => reporte !== null)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  } catch {
    return [];
  }
}

export function guardarReportes(reportes: Reporte[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CONFIG.claves.reportes,
      JSON.stringify(reportes),
    );
  } catch (error) {
    console.error("No se pudieron guardar los reportes localmente.", error);
  }
}

export function leerNotificaciones(): Notificacion[] {
  if (typeof window === "undefined") return [];

  try {
    const guardado = window.localStorage.getItem(CONFIG.claves.notificaciones);
    if (!guardado) return [];

    const datos: unknown = JSON.parse(guardado);
    if (!Array.isArray(datos)) return [];

    return datos.filter((item): item is Notificacion => {
      if (typeof item !== "object" || item === null) return false;
      const notificacion = item as Record<string, unknown>;
      return (
        typeof notificacion.id === "string" &&
        typeof notificacion.ticket === "string" &&
        typeof notificacion.correo === "string" &&
        typeof notificacion.asunto === "string" &&
        typeof notificacion.enviadoEn === "string"
      );
    });
  } catch {
    return [];
  }
}

export function guardarNotificacion(notificacion: Notificacion): void {
  if (typeof window === "undefined") return;

  try {
    const anteriores = leerNotificaciones();
    window.localStorage.setItem(
      CONFIG.claves.notificaciones,
      JSON.stringify([notificacion, ...anteriores].slice(0, 50)),
    );
  } catch (error) {
    console.error("No se pudo guardar la notificación simulada.", error);
  }
}

/**
 * Fila que se imprime en la consola JSON y que viajará a la tabla `reportes`
 * de Supabase. Las cuatro primeras claves son las del contrato; `ticket` se
 * añade para poder consultar el reporte después.
 */
export interface FilaReporte {
  ci: string;
  nrc: string;
  tipo_error: TipoError;
  motivo: string;
  ticket: string;
}

export function aFilaReporte(reporte: Reporte): FilaReporte {
  return {
    ci: reporte.ci,
    nrc: reporte.nrc,
    tipo_error: reporte.tipo_error,
    motivo: reporte.motivo,
    ticket: reporte.ticket,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Preparado para Supabase (comentado hasta conectar el backend).
 *
 * 1. npm install @supabase/supabase-js
 * 2. Definir NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * 3. Descomentar el bloque y la llamada en `registrarReporte`
 *    (context/ReportesContext.tsx).
 *
 * import { createClient } from "@supabase/supabase-js";
 *
 * const supabase = createClient(
 *   process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 * );
 *
 * export async function guardarEnSupabase(reporte: Reporte): Promise<void> {
 *   const { error } = await supabase
 *     .from("reportes")
 *     .insert(aFilaReporte(reporte));
 *
 *   if (error) throw error;
 * }
 * ────────────────────────────────────────────────────────────────────────── */
