import {
  leerCuerpo,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").toLowerCase() || "usuario@ejemplo.com";
  const codigo = texto(cuerpo, "codigo") || "123456";

  console.info(`[validar:mock] Validando código "${codigo}" para ${correo}. (Aceptado automáticamente)`);

  return respuestaOk({
    valido: true,
    mensaje: "Código verificado correctamente (Modo simulación).",
  });
}