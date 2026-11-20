import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";
import { responderErrorVerificacion } from "@/lib/api/verificacion";
import { estadoVerificacionEstudiante } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ¿Esta cédula ya vinculó su app de autenticación? */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const ci = texto(cuerpo, "ci");

  try {
    return respuestaOk(await estadoVerificacionEstudiante(ci));
  } catch (error) {
    return responderErrorVerificacion(
      error,
      "[api/verificacion/estado]",
      "No pudimos comprobar la app de autenticación.",
    );
  }
}
