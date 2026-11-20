import { obtenerAdmin } from "@/lib/admin/sesion";
import { leerCuerpo, respuestaError, respuestaOk, texto } from "@/lib/api/respuestas";
import { responderErrorVerificacion } from "@/lib/api/verificacion";
import { generarEnrolamientoEstudiante } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { ci }: cualquier administrador genera un código de un solo uso para que un
 * estudiante vincule su app. También sirve como reinicio si perdió el teléfono.
 */
export async function POST(request: Request) {
  const admin = await obtenerAdmin(request);

  if (!admin) {
    return respuestaError("verificacion", "Sesión no válida.", 401);
  }

  const cuerpo = await leerCuerpo(request);
  const ci = texto(cuerpo, "ci");

  try {
    const resultado = await generarEnrolamientoEstudiante(ci, admin.email);
    console.info(`[admin] ${admin.email} generó un código de enrolamiento para la cédula ${ci}.`);
    return respuestaOk(resultado);
  } catch (error) {
    return responderErrorVerificacion(
      error,
      "[api/admin/estudiantes/enrolamiento]",
      "No pudimos generar el código de enrolamiento.",
    );
  }
}
