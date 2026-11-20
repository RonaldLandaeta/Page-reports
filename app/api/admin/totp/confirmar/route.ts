import { iniciarSesionAdmin } from "@/lib/admin/sesion";
import { confirmarTotpAdmin } from "@/lib/admin/totp";
import { resolverPreAuth, respuestaErrorTotp } from "@/lib/admin/totp-api";
import { hashIp, ipDelCliente } from "@/lib/api/ip";
import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";
import { registrarIntentoAdmin } from "@/lib/supabase/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { tokenPreAuth, codigo }: confirma el primer código de la app y, solo
 * entonces, crea la cookie de sesión.
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const token = texto(cuerpo, "tokenPreAuth");
  const codigo = texto(cuerpo, "codigo");
  const pre = await resolverPreAuth(token, ["enrolar"]);

  if (!pre.ok) return pre.respuesta;

  const ipHash = hashIp(`admin:${ipDelCliente(request)}`);

  try {
    await confirmarTotpAdmin(pre.admin.userId, codigo);

    await registrarIntentoAdmin({
      correo: pre.admin.email,
      ipHash,
      exito: true,
      motivo: "ok",
    });

    const response = respuestaOk({ enrolado: true });
    iniciarSesionAdmin(response, pre.admin);
    return response;
  } catch (error) {
    await registrarIntentoAdmin({
      correo: pre.admin.email,
      ipHash,
      exito: false,
      motivo: "mfa_fallido",
    });

    return respuestaErrorTotp(error);
  }
}
