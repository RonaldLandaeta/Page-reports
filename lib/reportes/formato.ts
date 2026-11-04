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

// ── Exportación JSON para app_ingresos ──────────────────────────────────────

/** Alumno tal como lo lee app_ingresos (una sola vez por cédula). */
export interface EstudianteIngreso {
  ci: string;
  nombre: string;
  correo: string;
}

/**
 * Reporte tal como lo lee app_ingresos. `nrc` es el número de curso; `cod` es
 * el código único de la malla (ej. «TELE-02002») y desambigua los números de
 * curso que se repiten entre carreras.
 */
export interface ReporteIngreso {
  ci: string;
  tipo_error: string;
  nrc: string;
  cod: string;
  materia: string;
  horario: string;
}

export interface DatosIngreso {
  estudiantes: EstudianteIngreso[];
  reportes: ReporteIngreso[];
}

/**
 * Arma el `datos.json` que se carga en app_ingresos: solo cédula, nombre,
 * correo, tipo de error, número de curso, materia y horario. Nada interno
 * (ticket, estado, fechas, motivo) sale en este archivo.
 *
 * - `reportes` debe venir ordenado del más reciente al más antiguo: si un
 *   alumno cambió su nombre o correo entre reportes, gana el más reciente.
 * - El horario sale de la malla local (`horarioDe`); si el código ya no
 *   existe en la malla queda vacío en lugar de inventarse.
 */
export function reportesADatosIngreso(
  reportes: Reporte[],
  etiquetaTipo: (tipo: TipoError) => string,
  horarioDe: (codigoMateria: string) => string | undefined,
): DatosIngreso {
  const estudiantes = new Map<string, EstudianteIngreso>();
  const filas: ReporteIngreso[] = [];

  for (const r of reportes) {
    const ci = r.ci.trim();

    if (!estudiantes.has(ci)) {
      estudiantes.set(ci, {
        ci,
        nombre: r.nombre.trim(),
        correo: r.correo.trim(),
      });
    }

    filas.push({
      ci,
      tipo_error: etiquetaTipo(r.tipo_error),
      nrc: r.nrc.trim(),
      cod: r.materiaCodigo.trim(),
      materia: r.materiaNombre.trim(),
      horario: horarioDe(r.materiaCodigo)?.trim() ?? "",
    });
  }

  return { estudiantes: [...estudiantes.values()], reportes: filas };
}
