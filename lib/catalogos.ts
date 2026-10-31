import type {
  EstadoReporte,
  TipoError,
  TipoErrorOpcion,
} from "./types";

export const TIPOS_ERROR: TipoErrorOpcion[] = [
  { value: "error-prerrequisito", label: "Error de prerrequisito" },
  { value: "error-correquisito", label: "Error de correquisito" },
  { value: "reserva-cerrada", label: "Reserva cerrada" },
  { value: "cruce-horario", label: "Cruce de horario" },
  { value: "cambio-horario", label: "Cambio de horario" },
  { value: "otro", label: "Otros" },
];

/** Único tipo que exige el campo adicional «Especifica el error». */
export const TIPO_ERROR_CON_DETALLE: TipoError = "otro";

export function tipoRequiereDetalle(tipo: string): boolean {
  return tipo === TIPO_ERROR_CON_DETALLE;
}

export const ESTADOS_REPORTE: Array<{
  value: EstadoReporte;
  label: string;
}> = [
  { value: "pendiente", label: "Pendiente de revisión" },
  { value: "en-revision", label: "En revisión" },
  { value: "resuelto", label: "Resuelto" },
];

export function getTipoErrorLabel(tipo: TipoError): string {
  return TIPOS_ERROR.find((opcion) => opcion.value === tipo)?.label ?? tipo;
}

export function getEstadoReporteLabel(estado: EstadoReporte): string {
  return (
    ESTADOS_REPORTE.find((opcion) => opcion.value === estado)?.label ?? estado
  );
}

export function esTipoError(value: string): value is TipoError {
  return TIPOS_ERROR.some((opcion) => opcion.value === value);
}

export function esEstadoReporte(value: string): value is EstadoReporte {
  return ESTADOS_REPORTE.some((opcion) => opcion.value === value);
}
