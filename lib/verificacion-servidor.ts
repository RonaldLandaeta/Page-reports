import "server-only";

import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { CONFIG } from "@/lib/config";
import { enviarCodigoVerificacion } from "@/lib/email";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";

export type CodigoErrorVerificacion =
  | "validacion"
  | "limite"
  | "expirado"
  | "codigo"
  | "interno";

export class ErrorVerificacion extends Error {
  readonly codigo: CodigoErrorVerificacion;
  readonly status: number;

  constructor(codigo: CodigoErrorVerificacion, mensaje: string, status = 400) {
    super(mensaje);
    this.name = "ErrorVerificacion";
    this.codigo = codigo;
    this.status = status;
  }
}

const MS_HORA = 60 * 60 * 1000;

function secreto(): string {
  const valor = process.env.VERIFICACION_SECRET;

  if (valor && valor.length >= 32) return valor;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VERIFICACION_SECRET no está configurado (mínimo 32 caracteres).",
    );
  }

  return "desarrollo-secreto-de-verificacion-no-usar-en-produccion";
}

function hashCodigo(correo: string, codigo: string): string {
  return createHmac("sha256", secreto())
    .update(`${correo}:${codigo}`)
    .digest("hex");
}

function firmarToken(correo: string): string {
  const payload = {
    c: correo,
    e: Math.floor(Date.now() / 1000) +
      CONFIG.duracionTokenVerificacionMinutos * 60,
    n: randomUUID(),
  };

  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = createHmac("sha256", secreto())
    .update(cuerpo)
    .digest("base64url");

  return `${cuerpo}.${firma}`;
}

/** Verifica un token emitido tras validar el código. */
export function verificarTokenVerificacion(
  token: string,
): { correo: string } | null {
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;

  const esperada = createHmac("sha256", secreto())
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
      typeof (payload as { e?: unknown }).e !== "number"
    ) {
      return null;
    }

    const { c, e } = payload as { c: string; e: number };
    if (e < Math.floor(Date.now() / 1000)) return null;

    return { correo: c };
  } catch {
    return null;
  }
}

/**
 * Genera un código, aplica límites por correo e IP y lo envía.
 * En desarrollo, si Resend no está configurado, devuelve `codigoDemo`.
 */
export async function solicitarCodigo(
  correo: string,
  ipHash: string,
): Promise<{ expiraEn: string; codigoDemo?: string }> {
  const supabase = obtenerSupabaseAdmin();
  const desdeHora = new Date(Date.now() - MS_HORA).toISOString();

  const { count: porCorreo, error: errorConteo } = await supabase
    .from("codigos_verificacion")
    .select("id", { count: "exact", head: true })
    .eq("correo", correo)
    .gte("creado_en", desdeHora);

  if (errorConteo) {
    console.error("[verificacion] conteo por correo falló.", errorConteo);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos procesar la solicitud.",
      500,
    );
  }

  if ((porCorreo ?? 0) >= CONFIG.maxSolicitudesCodigoPorHora) {
    throw new ErrorVerificacion(
      "limite",
      "Solicitaste demasiados códigos. Espera una hora antes de intentarlo de nuevo.",
      429,
    );
  }

  const { data: ultimo, error: errorUltimo } = await supabase
    .from("codigos_verificacion")
    .select("creado_en")
    .eq("correo", correo)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorUltimo) {
    console.error("[verificacion] última solicitud falló.", errorUltimo);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos procesar la solicitud.",
      500,
    );
  }

  if (ultimo) {
    const transcurrido = Date.now() - Date.parse(ultimo.creado_en);
    const espera = CONFIG.segundosEntreSolicitudes * 1000 - transcurrido;

    if (espera > 0) {
      throw new ErrorVerificacion(
        "limite",
        `Espera ${Math.ceil(espera / 1000)} segundos antes de pedir otro código.`,
        429,
      );
    }
  }

  const { count: porIp, error: errorIp } = await supabase
    .from("codigos_verificacion")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("creado_en", desdeHora);

  if (errorIp) {
    console.error("[verificacion] conteo por IP falló.", errorIp);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos procesar la solicitud.",
      500,
    );
  }

  if ((porIp ?? 0) >= CONFIG.maxSolicitudesCodigoPorIpHora) {
    throw new ErrorVerificacion(
      "limite",
      "Demasiadas solicitudes desde tu conexión. Intenta más tarde.",
      429,
    );
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiraEn = new Date(
    Date.now() + CONFIG.duracionCodigoVerificacionMinutos * 60 * 1000,
  ).toISOString();

  const { data: fila, error: errorInsert } = await supabase
    .from("codigos_verificacion")
    .insert({
      correo,
      codigo_hash: hashCodigo(correo, codigo),
      expira_en: expiraEn,
      ip_hash: ipHash,
    })
    .select("id")
    .single();

  if (errorInsert || !fila) {
    console.error("[verificacion] no se pudo guardar el código.", errorInsert);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos generar el código.",
      500,
    );
  }

  let enviado = false;

  try {
    const resultado = await enviarCodigoVerificacion(
      correo,
      codigo,
      CONFIG.duracionCodigoVerificacionMinutos,
    );
    enviado = resultado.enviado;
  } catch (error) {
    console.error("[verificacion] envío de correo falló.", error);
    await supabase.from("codigos_verificacion").delete().eq("id", fila.id);

    throw new ErrorVerificacion(
      "interno",
      "No pudimos enviar el correo de verificación. Intenta más tarde.",
      502,
    );
  }

  const esDesarrollo = process.env.NODE_ENV !== "production";

  if (!enviado && !esDesarrollo) {
    await supabase.from("codigos_verificacion").delete().eq("id", fila.id);
    throw new ErrorVerificacion(
      "interno",
      "El envío de correo no está configurado.",
      503,
    );
  }

  const mostrarDemo =
    !enviado &&
    esDesarrollo &&
    process.env.MOSTRAR_CODIGO_DEMO !== "false";

  if (mostrarDemo) {
    console.info(`[verificacion:dev] Código para ${correo}: ${codigo}`);
  }

  return {
    expiraEn,
    ...(mostrarDemo ? { codigoDemo: codigo } : {}),
  };
}

/** Valida el código y devuelve un token firmado de corta duración. */
export async function validarCodigo(
  correo: string,
  codigo: string,
): Promise<{ token: string }> {
  if (!/^\d{6}$/.test(codigo)) {
    throw new ErrorVerificacion(
      "validacion",
      "El código debe tener exactamente 6 dígitos.",
    );
  }

  const supabase = obtenerSupabaseAdmin();

  const { data: fila, error } = await supabase
    .from("codigos_verificacion")
    .select("id, codigo_hash, expira_en, intentos, consumido_en")
    .eq("correo", correo)
    .is("consumido_en", null)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[verificacion] consulta de código falló.", error);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos validar el código.",
      500,
    );
  }

  if (!fila) {
    throw new ErrorVerificacion(
      "expirado",
      "El código expiró o no existe. Solicita uno nuevo.",
    );
  }

  if (Date.parse(fila.expira_en) < Date.now()) {
    throw new ErrorVerificacion(
      "expirado",
      "El código expiró. Solicita uno nuevo.",
    );
  }

  if (fila.intentos >= CONFIG.maxIntentosCodigo) {
    throw new ErrorVerificacion(
      "limite",
      "Demasiados intentos con este código. Solicita uno nuevo.",
      429,
    );
  }

  const esperado = Buffer.from(fila.codigo_hash, "hex");
  const recibido = Buffer.from(hashCodigo(correo, codigo), "hex");

  if (
    esperado.length !== recibido.length ||
    !timingSafeEqual(esperado, recibido)
  ) {
    await supabase
      .from("codigos_verificacion")
      .update({ intentos: fila.intentos + 1 })
      .eq("id", fila.id);

    throw new ErrorVerificacion(
      "codigo",
      "El código no coincide. Revisa los 6 dígitos e intenta de nuevo.",
    );
  }

  const { error: errorConsumo } = await supabase
    .from("codigos_verificacion")
    .update({ consumido_en: new Date().toISOString() })
    .eq("id", fila.id);

  if (errorConsumo) {
    console.error("[verificacion] no se pudo consumir el código.", errorConsumo);
    throw new ErrorVerificacion(
      "interno",
      "No pudimos completar la verificación.",
      500,
    );
  }

  return { token: firmarToken(correo) };
}
