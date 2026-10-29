import { CONFIG } from "@/lib/config";
import type { Reporte, ReporteInput, TipoError } from "@/lib/types";

export type FalloRegla = {
  ok: false;
  codigo: "duplicado" | "limite";
  mensaje: string;
  ticket?: string;
};

export type ResultadoRegla = { ok: true } | FalloRegla;

const MS_POR_HORA = 60 * 60 * 1000;

// Se crea una sola vez: instanciar Intl.DateTimeFormat es costoso.
const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: CONFIG.zonaHoraria,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario (AAAA-MM-DD) en la zona horaria configurada. */
function claveDia(ms: number): string | null {
  return Number.isNaN(ms) ? null : formatoDia.format(ms);
}

/**
 * Reglas del prototipo. Cuando exista backend, estas mismas reglas deben
 * validarse en el servidor antes de persistir el reporte.
 *
 * Las reglas están separadas para poder comprobarlas por etapas (por ejemplo
 * en el chatbot, antes de pedir todos los datos) y también en conjunto.
 */
export function validarDuplicado(
  reportes: Reporte[],
  ci: string,
  nrc: string,
  tipoError: TipoError,
  ahora: Date = new Date(),
): ResultadoRegla {
  const cedula = ci.trim();
  const desde = ahora.getTime() - CONFIG.ventanaDuplicadosHoras * MS_POR_HORA;

  const duplicado = reportes.find(
    (reporte) =>
      reporte.ci === cedula &&
      reporte.nrc === nrc &&
      reporte.tipo_error === tipoError &&
      Date.parse(reporte.creadoEn) >= desde,
  );

  if (!duplicado) return { ok: true };

  return {
    ok: false,
    codigo: "duplicado",
    mensaje: `Ya registraste un reporte para esta materia con el mismo tipo de error en las últimas ${CONFIG.ventanaDuplicadosHoras} horas.`,
    ticket: duplicado.ticket,
  };
}

export function validarLimiteDiario(
  reportes: Reporte[],
  ci: string,
  ahora: Date = new Date(),
): ResultadoRegla {
  const cedula = ci.trim();
  const hoy = claveDia(ahora.getTime());
  let reportesDeHoy = 0;

  for (const reporte of reportes) {
    if (reporte.ci === cedula && claveDia(Date.parse(reporte.creadoEn)) === hoy) {
      reportesDeHoy += 1;
    }
  }

  if (reportesDeHoy < CONFIG.maxReportesPorDia) return { ok: true };

  return {
    ok: false,
    codigo: "limite",
    mensaje: `Alcanzaste el límite de ${CONFIG.maxReportesPorDia} reportes por día. Intenta nuevamente mañana.`,
  };
}

export function validarReglas(
  reportes: Reporte[],
  input: ReporteInput,
  ahora: Date = new Date(),
): ResultadoRegla {
  const duplicado = validarDuplicado(
    reportes,
    input.ci,
    input.nrc,
    input.tipo_error,
    ahora,
  );
  if (!duplicado.ok) return duplicado;

  return validarLimiteDiario(reportes, input.ci, ahora);
}

/** Entero uniforme en [0, maximoExclusivo) sin sesgo de módulo. */
function enteroAleatorio(maximoExclusivo: number): number {
  const limite =
    Math.floor(0x100000000 / maximoExclusivo) * maximoExclusivo;
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limite);

  return buffer[0] % maximoExclusivo;
}

export function generarTicketUnico(reportes: Reporte[]): string {
  const ticketsUsados = new Set(reportes.map((reporte) => reporte.ticket));

  for (let intento = 0; intento < 1000; intento += 1) {
    const ticket = `TK-${100000 + enteroAleatorio(900000)}`;
    if (!ticketsUsados.has(ticket)) return ticket;
  }

  // Nunca se devuelve un ticket sin comprobar: un duplicado rompería la
  // consulta por ticket + cédula.
  throw new Error("No fue posible generar un ticket único.");
}

/** UUID v4: compatible con una columna `uuid` de Supabase. */
export function generarIdReporte(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}
