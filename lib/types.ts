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

/** Datos normalizados que recibe el estado global antes de registrar. */
export interface NuevoReporteInput extends ReporteInput {
  materiaNombre: string;
  materiaAula: string;
}

/** Reporte ya registrado, con los datos derivados por el sistema. */
export interface Reporte extends NuevoReporteInput {
  id: string;
  ticket: string;
  creadoEn: string;
  estado: EstadoReporte;
}

/** Registro local de un correo simulado. Se reemplazará por el proveedor real. */
export interface Notificacion {
  id: string;
  ticket: string;
  correo: string;
  asunto: string;
  tipo: "confirmacion" | "cambio-estado";
  enviadoEn: string;
}
