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

// ── Exportación para administradores ────────────────────────────────────────

const COLUMNAS_EXPORTACION = [
  "ticket",
  "estado",
  "creado",
  "ci",
  "nombre",
  "correo",
  "nrc",
  "codigo_materia",
  "materia",
  "tipo_error",
  "detalle",
  "motivo",
] as const;

/** Evita que Excel/Sheets ejecute como fórmula una celda escrita por un usuario. */
function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

function celdaCsv(valor: string): string {
  const seguro = neutralizarFormula(valor);
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function formatoLocal(zona: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** «2026-10-31 14:05» en la zona indicada. */
export function fechaLocal(iso: string | Date, zona: string): string {
  return formatoLocal(zona).format(new Date(iso));
}

/**
 * CSV listo para Excel en español: separador «;», BOM UTF-8 y saltos CRLF.
 * Las etiquetas (estado, tipo de error) van en texto legible.
 */
export function reportesACsv(
  reportes: Reporte[],
  etiquetas: {
    estado: (estado: Reporte["estado"]) => string;
    tipo: (tipo: TipoError) => string;
  },
  zona: string,
): string {
  const formato = formatoLocal(zona);

  const filas = reportes.map((r) =>
    [
      r.ticket,
      etiquetas.estado(r.estado),
      formato.format(new Date(r.creadoEn)),
      r.ci,
      r.nombre,
      r.correo,
      r.nrc,
      r.materiaCodigo,
      r.materiaNombre,
      etiquetas.tipo(r.tipo_error),
      r.tipoErrorDetalle,
      r.motivo,
    ]
      .map(celdaCsv)
      .join(";"),
  );

  return `\uFEFF${[COLUMNAS_EXPORTACION.join(";"), ...filas].join("\r\n")}\r\n`;
}
