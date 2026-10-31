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

  console.info(`[solicitar:mock] Petición recibida para ${correo}. Simulando envío de código: 123456`);

  return respuestaOk({
    enviado: true,
    mensaje: "Código de verificación enviado correctamente (Modo simulación).",
    codigoSimulado: "123456",
  });
}