import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV !== "production";

/**
 * CSP compatible con Next.js App Router. Next inyecta scripts y estilos
 * inline; mientras no se use un nonce por petición, `'unsafe-inline'` es
 * necesario. Aun así se bloquean orígenes externos, frames, objetos y
 * conexiones no previstas.
 */
const politicasCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  esDesarrollo
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  esDesarrollo ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(esDesarrollo ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const cabecerasSeguridad = [
  { key: "Content-Security-Policy", value: politicasCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(esDesarrollo
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
