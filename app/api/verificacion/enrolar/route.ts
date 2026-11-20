import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";
import { responderErrorVerificacion } from "@/lib/api/verificacion";
import { enrolarEstudiante } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { ci, codigoEnrolamiento }: valida el código que entregó un administrador y
 * devuelve el QR y el secreto una sola vez. Todavía no crea el token: eso pasa
 * al confirmar el primer código de 6 dígitos.
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const ci = texto(cuerpo, "ci");
  const codigoEnrolamiento = texto(cuerpo, "codigoEnrolamiento");

  try {
    return respuestaOk(await enrolarEstudiante(ci, codigoEnrolamiento));
  } catch (error) {
    return responderErrorVerificacion(
      error,
      "[api/verificacion/enrolar]",
      "No pudimos iniciar el enrolamiento.",
    );
  }
}
