import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import { esCorreoValido } from "@/lib/validaciones";
import { ErrorVerificacion, validarCodigo } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").toLowerCase();
  const codigo = texto(cuerpo, "codigo");
  const ci = texto(cuerpo, "ci");

  if (!esCorreoValido(correo)) {
    return respuestaError(
      "validacion",
      "Ingresa un correo electrónico válido.",
      422,
    );
  }

  try {
    const resultado = await validarCodigo(correo, codigo, ci);
    return respuestaOk(resultado);
  } catch (error) {
    if (error instanceof ErrorVerificacion) {
      return respuestaError(
        error.codigo === "interno"
          ? "interno"
          : error.codigo === "limite"
            ? "limite"
            : "verificacion",
        error.message,
        error.status,
      );
    }

    console.error("[api/verificacion/validar]", error);
    return respuestaError(
      "interno",
      "No pudimos validar el código de verificación.",
      500,
    );
  }
}
