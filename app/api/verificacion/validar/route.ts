import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";
import { responderErrorVerificacion } from "@/lib/api/verificacion";
import { validarEstudiante } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { ci, correo, codigo }: valida el código de la app ya vinculada y entrega el
 * token firmado que autoriza crear el reporte.
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const ci = texto(cuerpo, "ci");
  const correo = texto(cuerpo, "correo").toLowerCase();
  const codigo = texto(cuerpo, "codigo");

  try {
    return respuestaOk(await validarEstudiante(ci, correo, codigo));
  } catch (error) {
    return responderErrorVerificacion(
      error,
      "[api/verificacion/validar]",
      "No pudimos validar el código de la app de autenticación.",
    );
  }
}
