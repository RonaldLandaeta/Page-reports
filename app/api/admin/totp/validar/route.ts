import { iniciarSesionAdmin } from "@/lib/admin/sesion";
import { validarTotpAdmin } from "@/lib/admin/totp";
import { resolverPreAuth, respuestaErrorTotp } from "@/lib/admin/totp-api";
import { hashIp, ipDelCliente } from "@/lib/api/ip";
import { leerCuerpo, respuestaOk, texto } from "@/lib/api/respuestas";
import { registrarIntentoAdmin } from "@/lib/supabase/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { tokenPreAuth, codigo }: segundo factor de un administrador que ya tiene la
 * app vinculada. La cookie de sesión se crea solo si el código es correcto.
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const token = texto(cuerpo, "tokenPreAuth");
  const codigo = texto(cuerpo, "codigo");
  const pre = await resolverPreAuth(token, ["totp"]);

  if (!pre.ok) return pre.respuesta;

  const ipHash = hashIp(`admin:${ipDelCliente(request)}`);

  try {
    await validarTotpAdmin(pre.admin.userId, codigo);

    await registrarIntentoAdmin({
      correo: pre.admin.email,
      ipHash,
      exito: true,
      motivo: "ok",
    });

    const response = respuestaOk({});
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
