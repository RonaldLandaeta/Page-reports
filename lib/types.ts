export type TipoError =
  | "error-prerrequisito"
  | "error-correquisito"
  | "reserva-cerrada"
  | "cruce-horario"
  | "cambio-horario"
  | "otro";

export type EstadoReporte = "pendiente" | "en-revision" | "resuelto";

export interface TipoErrorOpcion {
  value: TipoError;
  label: string;
}

/** Datos que captura el formulario (o el chatbot) y viajan a la API. */
export interface ReporteInput {
  ci: string;
  nombre: string;
  correo: string;
  /** Código único de la malla local (ej. "FING-02002"). */
  materia_codigo: string;
  tipo_error: TipoError;
  /** Solo para "otro" (obligatorio, máx. 100). Vacío en los demás tipos. */
  tipo_error_detalle: string;
  motivo: string;
  created_at: string;
}

/**
 * Datos que envía el cliente a la API. El servidor resuelve nrc y nombre desde
 * la malla local y exige el token emitido tras verificar el correo.
 */
export interface NuevoReporteInput extends ReporteInput {
  verificacionToken: string;
}

/** Reporte ya registrado, con los datos derivados por el sistema. */
export interface Reporte
  extends Omit<ReporteInput, "materia_codigo" | "tipo_error_detalle"> {
  id: string;
  ticket: string;
  creadoEn: string;
  estado: EstadoReporte;
  /** NRC visible (nroCurso). Puede repetirse entre carreras. */
  nrc: string;
  /** Código único de la malla local. */
  materiaCodigo: string;
  /** Snapshot del nombre de la materia al momento del reporte. */
  materiaNombre: string;
  /** Detalle del error cuando el tipo es "otro"; vacío en los demás. */
  tipoErrorDetalle: string;
}
