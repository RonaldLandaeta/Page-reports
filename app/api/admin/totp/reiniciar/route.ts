import { esSuperAdmin, obtenerAdmin } from "@/lib/admin/sesion";
import { reiniciarTotpAdmin } from "@/lib/admin/totp";
import { respuestaErrorTotp } from "@/lib/admin/totp-api";
import { leerCuerpo, respuestaError, respuestaOk, texto } from "@/lib/api/respuestas";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * { userId }: un super administrador reinicia la app de otro administrador.
 * Es el único mecanismo de recuperación: no hay códigos de respaldo.
 */
export async function POST(request: Request) {
  const admin = await obtenerAdmin(request);

  if (!admin) {
    return respuestaError("verificacion", "Sesión no válida.", 401);
  }

  if (!esSuperAdmin(admin)) {
    return respuestaError(
      "verificacion",
      "Solo un super administrador puede reiniciar la app de otro administrador.",
      403,
    );
  }

  const cuerpo = await leerCuerpo(request);
  const userId = texto(cuerpo, "userId");

  if (!UUID.test(userId)) {
    return respuestaError("validacion", "Datos inválidos.", 422);
  }

  const { data, error } = await obtenerSupabaseAdmin()
    .from("administradores")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[api/admin/totp/reiniciar] no se pudo comprobar el administrador.", error);
    return respuestaError("interno", "No pudimos reiniciar la app.", 500);
  }

  if (!data) {
    return respuestaError("no_encontrado", "Administrador no encontrado.", 404);
  }

  try {
    await reiniciarTotpAdmin(userId);
    console.info(`[admin] ${admin.email} reinició la app de autenticación de ${userId}.`);
    return respuestaOk({});
  } catch (error) {
    return respuestaErrorTotp(error);
  }
}
