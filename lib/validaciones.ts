export function esCorreoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim());
}

/** Longitud permitida de la cédula. Único lugar donde se define. */
export const CEDULA_MIN_DIGITOS = 7;
export const CEDULA_MAX_DIGITOS = 8;

/** Límites del motivo y del nombre. Deben coincidir con los CHECK de SQL. */
export const MOTIVO_MIN = 15;
export const MOTIVO_MAX = 600;
export const NOMBRE_MIN = 3;
export const NOMBRE_MAX = 120;

/** «Especifica el error» (solo tipo "otro"). Debe coincidir con el CHECK de SQL. */
export const DETALLE_ERROR_MAX = 100;

export function esCedulaValida(ci: string): boolean {
  const valor = ci.trim();

  return (
    /^\d+$/.test(valor) &&
    valor.length >= CEDULA_MIN_DIGITOS &&
    valor.length <= CEDULA_MAX_DIGITOS
  );
}

/** Formato nuevo: 7 dígitos. Se aceptan 6 por los tickets ya emitidos. */
export const TICKET_MAX_LONGITUD = 10; // "TK-" + 7 dígitos

export function normalizarTicket(ticket: string): string {
  return ticket.trim().toUpperCase();
}

export function esTicketValido(ticket: string): boolean {
  // Los tickets nuevos llevan 7 dígitos; los antiguos (6) siguen siendo
  // consultables para no dejar reportes existentes inaccesibles.
  return /^TK-\d{6,7}$/.test(normalizarTicket(ticket));
}

/**
 * Dominio institucional único y obligatorio. No se lee del entorno: si fuera
 * configurable, un despliegue con la variable vacía aceptaría cualquier
 * correo. El servidor es la autoridad; el cliente solo replica el mensaje.
 */
export const DOMINIO_INSTITUCIONAL = "est.ucab.edu.ve";

export function esCorreoInstitucional(correo: string): boolean {
  const dominio = correo.trim().toLowerCase().split("@")[1] ?? "";
  return dominio === DOMINIO_INSTITUCIONAL;
}

export function mensajeCorreoInstitucional(): string {
  return `Usa tu correo institucional @${DOMINIO_INSTITUCIONAL}.`;
}

/** Oculta la parte local: ana.martinez@uni.edu.ve → a***@uni.edu.ve */
export function enmascararCorreo(correo: string): string {
  const [local = "", dominio = ""] = correo.split("@");
  return `${local.slice(0, 1)}***@${dominio}`;
}
