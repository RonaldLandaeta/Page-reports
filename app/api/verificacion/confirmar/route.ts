import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";
import { responderErrorVerificacion } from "@/lib/api/verificacion";
import { confirmarEstudiante } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { ci, correo, codigo }: confirma el primer código TOTP, consume el código de
 * enrolamiento y entrega el token firmado que autoriza crear el reporte.
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const ci = texto(cuerpo, "ci");
  const correo = texto(cuerpo, "correo").toLowerCase();
  const codigo = texto(cuerpo, "codigo");

  try {
    return respuestaOk(await confirmarEstudiante(ci, correo, codigo));
  } catch (error) {
    return responderErrorVerificacion(
      error,
      "[api/verificacion/confirmar]",
      "No pudimos confirmar la app de autenticación.",
    );
  }
}
