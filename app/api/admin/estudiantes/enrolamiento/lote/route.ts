import { obtenerAdmin } from "@/lib/admin/sesion";
import { leerCuerpo, respuestaError, respuestaOk } from "@/lib/api/respuestas";
import { responderErrorVerificacion } from "@/lib/api/verificacion";
import { generarEnrolamientoLote } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { cantidad }: genera un código compartido para que hasta esa cantidad de
 * cédulas distintas se enrolen antes de que venza. No reinicia credenciales:
 * para eso está el endpoint de enrolamiento individual.
 */
export async function POST(request: Request) {
  const admin = await obtenerAdmin(request);

  if (!admin) {
    return respuestaError("verificacion", "Sesión no válida.", 401);
  }

  const cuerpo = await leerCuerpo(request);
  const cantidad = Number(cuerpo?.cantidad);

  try {
    const resultado = await generarEnrolamientoLote(cantidad, admin.email);
    console.info(
      `[admin] ${admin.email} generó un código de enrolamiento para ${resultado.maxCedulas} cédulas.`,
    );
    return respuestaOk(resultado);
  } catch (error) {
    return responderErrorVerificacion(
      error,
      "[api/admin/estudiantes/enrolamiento/lote]",
      "No pudimos generar el código de enrolamiento.",
    );
  }
}
