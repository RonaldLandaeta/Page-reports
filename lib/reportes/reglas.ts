import { CONFIG } from "@/lib/config";
import type { Reporte, ReporteInput } from "@/lib/types";

export type ResultadoRegla =
  | { ok: true }
  | {
      ok: false;
      codigo: "duplicado" | "limite";
      mensaje: string;
      ticket?: string;
    };

const MS_POR_HORA = 60 * 60 * 1000;

/**
 * Reglas del prototipo. Cuando exista backend, estas mismas reglas deben
 * validarse en el servidor antes de persistir el reporte.
 */
export function validarReglas(
  reportes: Reporte[],
  input: ReporteInput,
  ahora: Date = new Date(),
): ResultadoRegla {
  const ci = input.ci.trim();
  const desdeDuplicados =
    ahora.getTime() - CONFIG.ventanaDuplicadosHoras * MS_POR_HORA;

  const duplicado = reportes.find(
    (reporte) =>
      reporte.ci === ci &&
      reporte.nrc === input.nrc &&
      reporte.tipo_error === input.tipo_error &&
      new Date(reporte.creadoEn).getTime() >= desdeDuplicados,
  );

  if (duplicado) {
    return {
      ok: false,
      codigo: "duplicado",
      mensaje: `Ya registraste un reporte para esta materia con el mismo tipo de error en las últimas ${CONFIG.ventanaDuplicadosHoras} horas.`,
      ticket: duplicado.ticket,
    };
  }

  const inicioDelDia = new Date(ahora);
  inicioDelDia.setHours(0, 0, 0, 0);

  const reportesDeHoy = reportes.filter(
    (reporte) =>
      reporte.ci === ci &&
      new Date(reporte.creadoEn).getTime() >= inicioDelDia.getTime(),
  );

  if (reportesDeHoy.length >= CONFIG.maxReportesPorDia) {
    return {
      ok: false,
      codigo: "limite",
      mensaje: `Alcanzaste el límite de ${CONFIG.maxReportesPorDia} reportes por día. Intenta nuevamente mañana.`,
    };
  }

  return { ok: true };
}

export function generarTicketUnico(reportes: Reporte[]): string {
  const ticketsUsados = new Set(reportes.map((reporte) => reporte.ticket));

  for (let intento = 0; intento < 50; intento += 1) {
    const ticket = `TK-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!ticketsUsados.has(ticket)) return ticket;
  }

  return `TK-${Date.now().toString().slice(-6)}`;
}

export function generarIdReporte(): string {
  return `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
