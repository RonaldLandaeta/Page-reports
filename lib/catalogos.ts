import type {
  EstadoReporte,
  TipoError,
  TipoErrorOpcion,
} from "./types";

export const TIPOS_ERROR: TipoErrorOpcion[] = [
  { value: "horario-incorrecto", label: "Horario incorrecto" },
  { value: "aula-incorrecta", label: "Aula incorrecta" },
  { value: "docente-incorrecto", label: "Docente no coincide" },
  { value: "cruce-materias", label: "Cruce de materias" },
  { value: "otro", label: "Otro problema" },
];

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
