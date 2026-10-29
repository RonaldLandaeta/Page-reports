export function esCorreoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim());
}

export function esCedulaValida(ci: string): boolean {
  return /^\d{10}$/.test(ci.trim());
}

export function normalizarTicket(ticket: string): string {
  return ticket.trim().toUpperCase();
}

export function esTicketValido(ticket: string): boolean {
  return /^TK-\d{6}$/.test(normalizarTicket(ticket));
}
