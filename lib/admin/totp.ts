import "server-only";

import { CONFIG } from "@/lib/config";
import {
  cifrarSecreto,
  generarSecretoTotp,
  qrDataUrl,
  urlOtpauth,
} from "@/lib/totp";
import {
  confirmarCredencialTotp,
  crearCredencialPendiente,
  estadoCredencialTotp,
  reiniciarCredencialTotp,
  validarCredencialTotp,
  type EstadoCredencial,
} from "@/lib/totp-servidor";

const EMISOR = "Reportes Horarios UCAB";

export async function estadoTotpAdmin(
  userId: string,
): Promise<EstadoCredencial> {
  return estadoCredencialTotp("admin", userId);
}

/** Devuelve el QR y el secreto solo cuando el administrador ya puso su clave. */
export async function enrolarAdmin(
  userId: string,
  email: string,
): Promise<{
  qr: string;
  secreto: string;
  cuenta: string;
  emisor: string;
}> {
  const secreto = generarSecretoTotp();

  await crearCredencialPendiente("admin", userId, cifrarSecreto(secreto));

  const cuenta = email || userId;
  const url = urlOtpauth({
    secreto,
    cuenta,
    emisor: EMISOR,
    periodo: CONFIG.totpPeriodoSegundos,
    digitos: CONFIG.totpDigitos,
  });

  return {
    qr: await qrDataUrl(url),
    secreto,
    cuenta,
    emisor: EMISOR,
  };
}

export async function confirmarTotpAdmin(
  userId: string,
  codigo: string,
): Promise<void> {
  await confirmarCredencialTotp("admin", userId, codigo);
}

export async function validarTotpAdmin(
  userId: string,
  codigo: string,
): Promise<void> {
  await validarCredencialTotp("admin", userId, codigo);
}

export async function reiniciarTotpAdmin(userId: string): Promise<void> {
  await reiniciarCredencialTotp("admin", userId);
}
