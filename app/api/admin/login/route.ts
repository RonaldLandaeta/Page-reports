import { NextResponse } from "next/server";

import { autenticarAdmin, iniciarSesionAdmin } from "@/lib/admin/sesion";
import { hashIp, ipDelCliente } from "@/lib/api/ip";
import { leerCuerpo, respuestaError, texto } from "@/lib/api/respuestas";
import {
  consultasBloqueadas,
  registrarConsultaFallida,
} from "@/lib/supabase/consultas";
import { esCorreoValido } from "@/lib/validaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENSAJE =
  "Correo o contraseña incorrectos, o sin permisos de administrador.";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").trim().toLowerCase();
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";

  if (!esCorreoValido(correo) || clave.length < 6 || clave.length > 200) {
    return respuestaError("validacion", MENSAJE, 422);
  }

  try {
    // Mismo freno de fuerza bruta que la consulta, con su propio contador.
    const ipHash = hashIp(`admin:${ipDelCliente(request)}`);

    if (await consultasBloqueadas(ipHash)) {
      return respuestaError(
        "limite",
        "Demasiados intentos. Espera unos minutos.",
        429,
      );
    }

    const sesion = await autenticarAdmin(correo, clave);

    if (!sesion) {
      await registrarConsultaFallida(ipHash);
      return respuestaError("verificacion", MENSAJE, 401);
    }

    const response = NextResponse.json({ ok: true });
    iniciarSesionAdmin(response, sesion.token, sesion.expiraEnSegundos);
    return response;
  } catch (error) {
    console.error("[api/admin/login]", error);
    return respuestaError("interno", "No pudimos iniciar sesión.", 500);
  }
}
