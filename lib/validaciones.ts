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

export function esCedulaValida(ci: string): boolean {
  const valor = ci.trim();

  return (
    /^\d+$/.test(valor) &&
    valor.length >= CEDULA_MIN_DIGITOS &&
    valor.length <= CEDULA_MAX_DIGITOS
  );
}

export function normalizarTicket(ticket: string): string {
  return ticket.trim().toUpperCase();
}

export function esTicketValido(ticket: string): boolean {
  return /^TK-\d{6}$/.test(normalizarTicket(ticket));
}

/**
 * Dominios institucionales permitidos (NEXT_PUBLIC_DOMINIOS_CORREO, separados
 * por coma, p. ej. "universidad.edu.ve,est.universidad.edu.ve"). Vacío = sin
 * restricción. Se lee igual en cliente y servidor; el servidor es quien manda.
 */
export function dominiosPermitidos(): string[] {
  return (process.env.NEXT_PUBLIC_DOMINIOS_CORREO ?? "")
    .split(",")
    .map((dominio) => dominio.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function esCorreoInstitucional(correo: string): boolean {
  const dominios = dominiosPermitidos();
  if (dominios.length === 0) return true;

  const dominio = correo.trim().toLowerCase().split("@")[1] ?? "";
  return dominios.some((permitido) => dominio === permitido);
}

/** Mensaje para mostrar cuando el correo no es institucional. */
export const mensajeCorreoInstitucional: string =
  dominiosPermitidos().length > 0
    ? `Usa tu correo institucional (${dominiosPermitidos()
        .map((dominio) => `@${dominio}`)
        .join(", ")}).`
    : "Ingresa un correo electrónico válido.";

/** Oculta la parte local: ana.martinez@uni.edu.ve → a***@uni.edu.ve */
export function enmascararCorreo(correo: string): string {
  const [local = "", dominio = ""] = correo.split("@");
  return `${local.slice(0, 1)}***@${dominio}`;
}
