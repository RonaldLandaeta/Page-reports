import "server-only";

import { createHmac } from "node:crypto";

/**
 * IP del cliente detrás de Vercel/Cloudflare. Se guarda siempre hasheada.
 */
export function ipDelCliente(request: Request): string {
  const reenviada = request.headers.get("x-forwarded-for");
  const ip =
    reenviada?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local";

  return ip;
}

export function hashIp(ip: string): string {
  const secreto =
    process.env.VERIFICACION_SECRET ?? "desarrollo-ip-hash-no-produccion";
  return createHmac("sha256", secreto).update(ip).digest("hex");
}
