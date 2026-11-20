import { enrolarAdmin } from "@/lib/admin/totp";
import { resolverPreAuth, respuestaErrorTotp } from "@/lib/admin/totp-api";
import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { tokenPreAuth }: devuelve el QR y el secreto para vincular la app. Solo
 * funciona con el token que se emite después de validar la contraseña.
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const token = texto(cuerpo, "tokenPreAuth");
  const pre = await resolverPreAuth(token, ["enrolar"]);

  if (!pre.ok) return pre.respuesta;

  try {
    return respuestaOk(await enrolarAdmin(pre.admin.userId, pre.admin.email));
  } catch (error) {
    return respuestaErrorTotp(error);
  }
}
