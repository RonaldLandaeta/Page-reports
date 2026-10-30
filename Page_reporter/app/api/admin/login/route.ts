import { NextResponse } from "next/server";

import { COOKIE_ADMIN, iniciarSesionAdmin } from "@/lib/admin/sesion";
import { hashIp, ipDelCliente } from "@/lib/api/ip";
import { leerCuerpo, respuestaError, texto } from "@/lib/api/respuestas";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import {
  consultasBloqueadas,
  registrarConsultaFallida,
} from "@/lib/supabase/consultas";
import { esCorreoValido } from "@/lib/validaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENSAJE = "Correo o contraseña incorrectos, o sin permisos de administrador.";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").toLowerCase();
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";

  if (!esCorreoValido(correo) || clave.length < 6 || clave.length > 200) {
    return respuestaError("validacion", MENSAJE, 422);
  }

  try {
    // Mismo freno de fuerza bruta que la consulta, con su propio contador.
    const ipHash = hashIp(`admin:${ipDelCliente(request)}`);

    if (await consultasBloqueadas(ipHash)) {
      return respuestaError("limite", "Demasiados intentos. Espera unos minutos.", 429);
    }

    const sesion = await iniciarSesionAdmin(correo, clave);
    let esAdmin = false;

    if (sesion) {
      const supabase = obtenerSupabaseAdmin();
      const { data: usuario } = await supabase.auth.getUser(sesion.token);
      if (usuario.user) {
        const { data: fila } = await supabase
          .from("administradores")
          .select("user_id")
          .eq("user_id", usuario.user.id)
          .maybeSingle();
        esAdmin = Boolean(fila);
      }
    }

    if (!sesion || !esAdmin) {
      await registrarConsultaFallida(ipHash);
      return respuestaError("verificacion", MENSAJE, 401);
    }

    const respuesta = NextResponse.json({ ok: true });
    respuesta.cookies.set(COOKIE_ADMIN, sesion.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: sesion.expiraEnSegundos,
    });
    return respuesta;
  } catch (error) {
    console.error("[api/admin/login]", error);
    return respuestaError("interno", "No pudimos iniciar sesión.", 500);
  }
}
