import "server-only";

import type { NextResponse } from "next/server";

import {
  leerTokenPreAuth,
  rolDeAdministrador,
  type AdminActual,
  type PropositoPreAuth,
} from "@/lib/admin/sesion";
import { respuestaError } from "@/lib/api/respuestas";
import { codigoApiDeError, ErrorVerificacion } from "@/lib/errores-verificacion";

/**
 * Comprueba el token previo al segundo factor y que el usuario siga siendo
 * administrador. No crea la cookie: eso ocurre solo tras validar el TOTP.
 */
export async function resolverPreAuth(
  token: string,
  propositos: PropositoPreAuth[],
): Promise<
  | { ok: true; admin: AdminActual }
  | { ok: false; respuesta: NextResponse }
> {
  const pre = leerTokenPreAuth(token);

  if (!pre || !propositos.includes(pre.proposito)) {
    return {
      ok: false,
      respuesta: respuestaError(
        "verificacion",
        "La solicitud expiró. Vuelve a iniciar sesión.",
        401,
      ),
    };
  }

  let rol: AdminActual["rol"] | null = null;

  try {
    rol = await rolDeAdministrador(pre.userId);
  } catch (error) {
    console.error("[admin/totp] no se pudo comprobar el rol.", error);
  }

  if (!rol) {
    return {
      ok: false,
      respuesta: respuestaError(
        "verificacion",
        "Tu acceso de administrador ya no está vigente.",
        403,
      ),
    };
  }

  return {
    ok: true,
    admin: { userId: pre.userId, email: pre.email, rol },
  };
}

export function respuestaErrorTotp(error: unknown): NextResponse {
  if (error instanceof ErrorVerificacion) {
    return respuestaError(codigoApiDeError(error), error.message, error.status);
  }

  console.error("[admin/totp]", error);
  return respuestaError(
    "interno",
    "No pudimos completar la verificación.",
    500,
  );
}
