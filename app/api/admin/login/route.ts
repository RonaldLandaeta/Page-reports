import {
  autenticarAdmin,
  crearTokenPreAuth,
} from "@/lib/admin/sesion";
import { estadoTotpAdmin } from "@/lib/admin/totp";
import { hashIp, ipDelCliente } from "@/lib/api/ip";
import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import {
  consultasBloqueadas,
  intentosAdminPorCorreoBloqueados,
  registrarConsultaFallida,
  registrarIntentoAdmin,
} from "@/lib/supabase/consultas";
import { esCorreoValido } from "@/lib/validaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENSAJE =
  "Correo o contraseña incorrectos, o sin permisos de administrador.";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  const correo = texto(cuerpo, "correo").toLowerCase();
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";

  if (!esCorreoValido(correo) || clave.length < 6 || clave.length > 200) {
    return respuestaError("validacion", MENSAJE, 422);
  }

  try {
    // Mismo freno de fuerza bruta que la consulta, con su propio contador.
    const ipHash = hashIp(`admin:${ipDelCliente(request)}`);

    if (await consultasBloqueadas(ipHash)) {
      await registrarIntentoAdmin({ correo, ipHash, exito: false, motivo: "bloqueado" });
      return respuestaError("limite", "Demasiados intentos. Espera unos minutos.", 429);
    }

    // Bloqueo por correo: frena ataques distribuidos con muchas IPs. El
    // usuario aceptó el riesgo de que alguien bloquee una cuenta a propósito.
    if (await intentosAdminPorCorreoBloqueados(correo)) {
      await registrarIntentoAdmin({
        correo,
        ipHash,
        exito: false,
        motivo: "bloqueado",
      });
      return respuestaError(
        "limite",
        "Demasiados intentos para esta cuenta. Espera unos minutos.",
        429,
      );
    }

    const resultado = await autenticarAdmin(correo, clave);

    if (!resultado.ok) {
      await Promise.all([
        registrarConsultaFallida(ipHash),
        registrarIntentoAdmin({ correo, ipHash, exito: false, motivo: resultado.motivo }),
      ]);

      // Mismo mensaje para «clave mala» y «sin permisos»: no revela cuentas.
      return respuestaError("verificacion", MENSAJE, 401);
    }

    await registrarIntentoAdmin({
      correo,
      ipHash,
      exito: false,
      motivo: "mfa_requerido",
    });

    const estado = await estadoTotpAdmin(resultado.admin.userId);
    const requiereTotp = estado === "activo";

    // La cookie de sesión NO se crea aquí: primero hay que superar el segundo
    // factor. El token previo solo autoriza los endpoints de TOTP.
    return respuestaOk({
      requiereTotp,
      requiereEnrolamiento: !requiereTotp,
      tokenPreAuth: crearTokenPreAuth(
        resultado.admin,
        requiereTotp ? "totp" : "enrolar",
      ),
    });
  } catch (error) {
    console.error("[api/admin/login]", error);
    return respuestaError("interno", "No pudimos iniciar sesión.", 500);
  }
}
