export type TipoError =
  | "horario-incorrecto"
  | "aula-incorrecta"
  | "docente-incorrecto"
  | "cruce-materias"
  | "otro";

export type EstadoReporte = "pendiente" | "en-revision" | "resuelto";

export interface Materia {
  nrc: string;
  nombre: string;
  docente: string;
  horario: string;
  aula: string;
}

export interface TipoErrorOpcion {
  value: TipoError;
  label: string;
}

/** Datos que captura el formulario tradicional. */
export interface ReporteInput {
  ci: string;
  nombre: string;
  correo: string;
  nrc: string;
  tipo_error: TipoError;
  motivo: string;
}

/**
 * Datos que envía el cliente a la API. El servidor resuelve la materia desde
 * el catálogo y exige el token emitido tras verificar el correo.
 */
export interface NuevoReporteInput extends ReporteInput {
  verificacionToken: string;
}

/** Reporte ya registrado, con los datos derivados por el sistema. */
export interface Reporte extends ReporteInput {
  id: string;
  ticket: string;
  creadoEn: string;
  estado: EstadoReporte;
  materiaNombre: string;
  materiaAula: string;
}
