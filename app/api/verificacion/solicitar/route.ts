import { hashIp, ipDelCliente } from "@/lib/api/ip";
import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import { esCorreoValido } from "@/lib/validaciones";
import {
  ErrorVerificacion,
  solicitarCodigo,
} from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").toLowerCase();

  if (!esCorreoValido(correo)) {
    return respuestaError(
      "validacion",
      "Ingresa un correo electrónico válido.",
      422,
    );
  }

  try {
    const resultado = await solicitarCodigo(
      correo,
      hashIp(ipDelCliente(request)),
    );

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

    console.error("[api/verificacion/solicitar]", error);
    return respuestaError(
      "interno",
      "No pudimos enviar el código de verificación.",
      500,
    );
  }
}
