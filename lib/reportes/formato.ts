import type { Reporte, TipoError } from "@/lib/types";

/**
 * Fila que se imprime en la consola JSON de desarrollo. No se envía a la API:
 * el servidor arma la fila real a partir del reporte.
 */
export interface FilaReporte {
  ci: string;
  nrc: string;
  materia_codigo: string;
  tipo_error: TipoError;
  tipo_error_detalle: string;
  motivo: string;
  ticket: string;
}

export function aFilaReporte(reporte: Reporte): FilaReporte {
  return {
    ci: reporte.ci,
    nrc: reporte.nrc,
    materia_codigo: reporte.materiaCodigo,
    tipo_error: reporte.tipo_error,
    tipo_error_detalle: reporte.tipoErrorDetalle,
    motivo: reporte.motivo,
    ticket: reporte.ticket,
  };
}
