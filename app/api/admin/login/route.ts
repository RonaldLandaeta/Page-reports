import { NextResponse } from "next/server";

import { iniciarSesionAdmin } from "@/lib/admin/sesion";
import { leerCuerpo, texto } from "@/lib/api/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").trim().toLowerCase() || "admin@ejemplo.com";

  console.info(`[admin/login:mock] Autenticando administrador simulado: ${correo}`);

  const response = NextResponse.json({ ok: true });

  // Simulación de sesión de admin activa por 24 horas (86400 segundos)
  iniciarSesionAdmin(response, "token-admin-simulado-123456", 86400);

  return response;
}