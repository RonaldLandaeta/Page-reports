import "server-only";

import { createHmac } from "node:crypto";

import { secretoVerificacion } from "@/lib/secreto";

/**
 * IP del cliente. Se prefieren las cabeceras que fija la plataforma
 * (Cloudflare, Vercel) porque `x-forwarded-for` puede venir falsificada si la
 * app corre sin proxy de confianza. Se guarda siempre hasheada.
 */
export function ipDelCliente(request: Request): string {
  const cabecera = (nombre: string) =>
    request.headers.get(nombre)?.split(",")[0]?.trim() || null;

  return (
    cabecera("cf-connecting-ip") ??
    cabecera("x-vercel-forwarded-for") ??
    cabecera("x-real-ip") ??
    cabecera("x-forwarded-for") ??
    "local"
  );
}

export function hashIp(ip: string): string {
  return createHmac("sha256", secretoVerificacion()).update(ip).digest("hex");
}
