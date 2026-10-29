export function esCorreoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim());
}

/** Longitud permitida de la cédula. Único lugar donde se define. */
export const CEDULA_MIN_DIGITOS = 7;
export const CEDULA_MAX_DIGITOS = 8;

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
