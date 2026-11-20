import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { CONFIG } from "@/lib/config";
import {
  ErrorVerificacion,
  codigoApiDeError,
} from "@/lib/errores-verificacion";
import { secretoVerificacion } from "@/lib/secreto";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import {
  cifrarSecreto,
  generarCodigoEnrolamiento,
  generarSecretoTotp,
  hashCodigoEnrolamiento,
  normalizarCodigoEnrolamiento,
  qrDataUrl,
  urlOtpauth,
  LONGITUD_CODIGO_ENROLAMIENTO,
} from "@/lib/totp";
import {
  confirmarCredencialTotp,
  estadoCredencialTotp,
  validarCredencialTotp,
  type EstadoCredencial,
} from "@/lib/totp-servidor";
import {
  esCedulaValida,
  esCorreoInstitucional,
  mensajeCorreoInstitucional,
} from "@/lib/validaciones";

export { ErrorVerificacion, codigoApiDeError };
export type { CodigoErrorVerificacion } from "@/lib/errores-verificacion";

export const EMISOR_TOTP = "Reportes Horarios UCAB";

function firmarToken(correo: string, ci: string): string {
  const payload = {
    c: correo,
    i: ci,
    e:
      Math.floor(Date.now() / 1000) +
      CONFIG.duracionTokenVerificacionMinutos * 60,
    n: randomUUID(),
  };

  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = createHmac("sha256", secretoVerificacion())
    .update(cuerpo)
    .digest("base64url");

  return `${cuerpo}.${firma}`;
}

/** Verifica un token emitido tras validar el código TOTP. */
export function verificarTokenVerificacion(
  token: string,
): { correo: string; ci: string } | null {
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;

  const esperada = createHmac("sha256", secretoVerificacion())
    .update(cuerpo)
    .digest("base64url");
  const recibidaBuffer = Buffer.from(firma);
  const esperadaBuffer = Buffer.from(esperada);

  if (
    recibidaBuffer.length !== esperadaBuffer.length ||
    !timingSafeEqual(recibidaBuffer, esperadaBuffer)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8"),
    );

    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { c?: unknown }).c !== "string" ||
      typeof (payload as { i?: unknown }).i !== "string" ||
      typeof (payload as { e?: unknown }).e !== "number"
    ) {
      return null;
    }

    const { c, i, e } = payload as { c: string; i: string; e: number };
    if (e < Math.floor(Date.now() / 1000)) return null;

    return { correo: c, ci: i };
  } catch {
    return null;
  }
}

function exigirCedula(ci: string): void {
  if (!esCedulaValida(ci)) {
    throw new ErrorVerificacion(
      "validacion",
      "Ingresa una cédula válida antes de verificar tu identidad.",
      422,
    );
  }
}

function exigirCorreo(correo: string): void {
  if (!esCorreoInstitucional(correo)) {
    throw new ErrorVerificacion(
      "validacion",
      mensajeCorreoInstitucional(),
      422,
    );
  }
}

function exigirCodigo(codigo: string): void {
  if (!/^\d{6}$/.test(codigo)) {
    throw new ErrorVerificacion(
      "validacion",
      "El código debe tener exactamente 6 dígitos.",
      422,
    );
  }
}

/** El correo es dato de contacto; la base sigue exigiendo un correo por cédula. */
async function comprobarVinculoCorreoCedula(
  correo: string,
  ci: string,
): Promise<void> {
  const { data, error } = await obtenerSupabaseAdmin()
    .from("reportes")
    .select("ci")
    .eq("correo", correo)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[verificacion] no se pudo comprobar el vínculo correo-cédula.",
      error,
    );
    throw new ErrorVerificacion(
      "interno",
      "No pudimos comprobar el correo.",
      500,
    );
  }

  if (data && data.ci !== ci) {
    throw new ErrorVerificacion(
      "validacion",
      "Este correo ya está vinculado a otra cédula. Usa el correo con el que registraste tus reportes.",
      409,
    );
  }
}

// ── API del flujo para estudiantes ──────────────────────────────────────────

export async function estadoVerificacionEstudiante(
  ci: string,
): Promise<{ estado: EstadoCredencial }> {
  exigirCedula(ci);
  return { estado: await estadoCredencialTotp("estudiante", ci) };
}

/**
 * Valida el código de enrolamiento y devuelve el secreto/QR una sola vez.
 * El código no se consume hasta que el estudiante confirma el primer código,
 * así puede volver a escanear el QR si recarga la página.
 */
export async function enrolarEstudiante(
  ci: string,
  codigoEnrolamiento: string,
): Promise<{
  qr: string;
  secreto: string;
  cuenta: string;
  emisor: string;
}> {
  exigirCedula(ci);

  const codigo = normalizarCodigoEnrolamiento(codigoEnrolamiento);

  if (codigo.length !== LONGITUD_CODIGO_ENROLAMIENTO) {
    throw new ErrorVerificacion(
      "validacion",
      "El código de enrolamiento no tiene el formato correcto.",
      422,
    );
  }

  const secreto = generarSecretoTotp();
  const secretoCifrado = cifrarSecreto(secreto);

  const { data, error } = await obtenerSupabaseAdmin().rpc(
    "enrolar_estudiante",
    {
      p_ci: ci,
      p_codigo_hash: hashCodigoEnrolamiento(codigo),
      p_secreto: secretoCifrado,
    },
  );

  if (error) {
    console.error("[verificacion] no se pudo crear el enrolamiento.", error);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos iniciar el enrolamiento.",
      500,
    );
  }

  const resultado = (data ?? {}) as {
    ok?: boolean;
    codigo?: string;
    mensaje?: string;
  };

  if (resultado.ok !== true) {
    if (resultado.codigo === "ya_configurado") {
      throw new ErrorVerificacion(
        "ya_configurado",
        resultado.mensaje ??
          "Esta cédula ya tiene una app vinculada. Pide a un administrador que la reinicie.",
        409,
      );
    }

    throw new ErrorVerificacion(
      resultado.codigo === "validacion" ? "validacion" : "codigo",
      resultado.mensaje ??
        "El código de enrolamiento no es válido o expiró.",
      400,
    );
  }

  const url = urlOtpauth({
    secreto,
    cuenta: ci,
    emisor: EMISOR_TOTP,
    periodo: CONFIG.totpPeriodoSegundos,
    digitos: CONFIG.totpDigitos,
  });

  return {
    qr: await qrDataUrl(url),
    secreto,
    cuenta: ci,
    emisor: EMISOR_TOTP,
  };
}

/** Confirma el primer código y devuelve el token firmado para reportar. */
export async function confirmarEstudiante(
  ci: string,
  correo: string,
  codigo: string,
): Promise<{ token: string }> {
  exigirCedula(ci);
  exigirCorreo(correo);
  exigirCodigo(codigo);

  // Se comprueba el vínculo antes de gastar el código TOTP: un correo ajeno no
  // debe consumir el primer código del enrolamiento.
  await comprobarVinculoCorreoCedula(correo, ci);
  await confirmarCredencialTotp("estudiante", ci, codigo);

  // El código de enrolamiento ya cumplió su función: no debe reutilizarse.
  const { error } = await obtenerSupabaseAdmin().rpc(
    "consumir_enrolamiento",
    { p_ci: ci },
  );

  if (error) {
    console.error(
      "[verificacion] no se pudo consumir el código de enrolamiento.",
      error,
    );
  }

  return { token: firmarToken(correo, ci) };
}

/** Valida un código TOTP normal y devuelve el token firmado para reportar. */
export async function validarEstudiante(
  ci: string,
  correo: string,
  codigo: string,
): Promise<{ token: string }> {
  exigirCedula(ci);
  exigirCorreo(correo);
  exigirCodigo(codigo);

  await comprobarVinculoCorreoCedula(correo, ci);
  await validarCredencialTotp("estudiante", ci, codigo);

  return { token: firmarToken(correo, ci) };
}

// ── API para el panel de administración ─────────────────────────────────────

/** Genera un código de enrolamiento y reinicia la app de esa cédula. */
export async function generarEnrolamientoEstudiante(
  ci: string,
  creadoPor: string,
): Promise<{ codigo: string; expiraEn: string }> {
  exigirCedula(ci);

  const codigo = generarCodigoEnrolamiento();
  const expiraEn = new Date(
    Date.now() + CONFIG.duracionCodigoEnrolamientoHoras * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await obtenerSupabaseAdmin().rpc(
    "generar_codigo_enrolamiento",
    {
      p_ci: ci,
      p_codigo_hash: hashCodigoEnrolamiento(codigo),
      p_expira_en: expiraEn,
      p_creado_por: creadoPor.slice(0, 254),
    },
  );

  if (error) {
    console.error(
      "[verificacion] no se pudo generar el código de enrolamiento.",
      error,
    );
    throw new ErrorVerificacion(
      "interno",
      "No pudimos generar el código de enrolamiento.",
      500,
    );
  }

  return { codigo, expiraEn };
}

export async function estadoEstudiante(
  ci: string,
): Promise<EstadoCredencial> {
  exigirCedula(ci);
  return estadoCredencialTotp("estudiante", ci);
}
