import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { secretoVerificacion } from "@/lib/secreto";

function cabecera(request: Request, nombre: string): string | null {
  return request.headers.get(nombre)?.split(",")[0]?.trim() || null;
}

/** Solo se aceptan IP reales: una cabecera inventada se descarta. */
function ipValida(valor: string | null): string | null {
  if (!valor) return null;
  return isIP(valor) ? valor : null;
}

/**
 * Solo se confía en cabeceras de reenvío cuando la plataforma las controla.
 * Un cliente puede enviar `x-forwarded-for`, `cf-connecting-ip` o `x-real-ip`
 * a mano; si se usaran sin comprobar el entorno, bastaría con rotar esa
 * cabecera para saltarse los límites por IP.
 *
 * - Vercel fija `VERCEL=1` y reescribe `x-vercel-forwarded-for` / `x-real-ip`.
 * - Cloudflare Pages fija `CF_PAGES=1` y reescribe `cf-connecting-ip`.
 * - En un servidor propio detrás de un proxy de confianza (nginx, Traefik…)
 *   hay que activar `TRUST_PROXY_HEADERS=true`.
 * - En cualquier otro caso se usa la IP local, que comparte el límite.
 *
 * Además se valida el valor con `net.isIP()`: si el proxy no lo reescribe y
 * llega basura (o una IP falsa), se cae a `local` en lugar de confiar en ella.
 */
export function ipDelCliente(request: Request): string {
  if (process.env.VERCEL === "1") {
    return (
      ipValida(cabecera(request, "x-vercel-forwarded-for")) ??
      ipValida(cabecera(request, "x-real-ip")) ??
      "local"
    );
  }

  if (process.env.CF_PAGES === "1") {
    return ipValida(cabecera(request, "cf-connecting-ip")) ?? "local";
  }

  const confiarProxy =
    (process.env.TRUST_PROXY_HEADERS ?? "").trim().toLowerCase() === "true";

  if (confiarProxy) {
    return (
      ipValida(cabecera(request, "x-real-ip")) ??
      ipValida(cabecera(request, "x-forwarded-for")) ??
      "local"
    );
  }

  return "local";
}

export function hashIp(ip: string): string {
  return createHmac("sha256", secretoVerificacion()).update(ip).digest("hex");
}
