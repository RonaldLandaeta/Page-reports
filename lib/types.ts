/**
 * Tipos del dominio. Deben coincidir con los enums de Postgres
 * (public.estado_reporte y public.tipo_error_reporte) y con los catálogos de
 * lib/catalogos.ts.
 */

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

/** Cuerpo que el formulario o el chatbot envían a POST /api/reportes. */
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
}

/**
 * Datos que envía el cliente a la API. El servidor resuelve nrc y nombre desde
 * la malla local y, cuando la verificación real está activa, exige el token.
 */
export interface NuevoReporteInput extends ReporteInput {
  verificacionToken: string;
}

/** Reporte ya registrado, con los datos derivados por el sistema. */
export interface Reporte {
  id: string;
  ticket: string;
  ci: string;
  nombre: string;
  correo: string;
  /** NRC visible (nroCurso). Puede repetirse entre carreras. */
  nrc: string;
  /** Código único de la malla local. */
  materiaCodigo: string;
  /** Snapshot del nombre de la materia al momento del reporte. */
  materiaNombre: string;
  tipo_error: TipoError;
  /** Detalle del error cuando el tipo es "otro"; vacío en los demás. */
  tipoErrorDetalle: string;
  motivo: string;
  estado: EstadoReporte;
  creadoEn: string;
  actualizadoEn: string;
}
