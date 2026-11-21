import "server-only";

import { CONFIG } from "@/lib/config";
import { ErrorVerificacion } from "@/lib/errores-verificacion";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import { descifrarSecreto, verificarCodigoTotp } from "@/lib/totp";

type TipoCredencial = "estudiante" | "admin";
export type EstadoCredencial = "activo" | "pendiente" | "sin_credencial";

interface CredencialTotp {
  tipo: TipoCredencial;
  sujeto: string;
  secretoCifrado: string;
  confirmadoEn: string | null;
  ultimoPaso: number;
  intentosFallidos: number;
  bloqueadoHasta: string | null;
}

function errorInterno(mensaje = "No pudimos comprobar la app de autenticación.") {
  return new ErrorVerificacion("interno", mensaje, 500);
}

async function leerCredencialTotp(
  tipo: TipoCredencial,
  sujeto: string,
): Promise<CredencialTotp | null> {
  const { data, error } = await obtenerSupabaseAdmin()
    .from("totp_credenciales")
    .select(
      "tipo, sujeto, secreto_cifrado, confirmado_en, ultimo_paso, intentos_fallidos, bloqueado_hasta",
    )
    .eq("tipo", tipo)
    .eq("sujeto", sujeto)
    .maybeSingle();

  if (error) {
    console.error("[totp] no se pudo leer la credencial.", error);
    throw errorInterno();
  }

  if (!data) return null;

  return {
    tipo: data.tipo as TipoCredencial,
    sujeto: data.sujeto,
    secretoCifrado: data.secreto_cifrado,
    confirmadoEn: data.confirmado_en,
    ultimoPaso: Number(data.ultimo_paso),
    intentosFallidos: Number(data.intentos_fallidos),
    bloqueadoHasta: data.bloqueado_hasta,
  };
}

export async function estadoCredencialTotp(
  tipo: TipoCredencial,
  sujeto: string,
): Promise<EstadoCredencial> {
  const credencial = await leerCredencialTotp(tipo, sujeto);

  if (!credencial) return "sin_credencial";

  return credencial.confirmadoEn ? "activo" : "pendiente";
}

/** Crea o reemplaza una credencial pendiente; nunca pisa una ya confirmada. */
export async function crearCredencialPendiente(
  tipo: TipoCredencial,
  sujeto: string,
  secretoCifrado: string,
): Promise<void> {
  const { data, error } = await obtenerSupabaseAdmin().rpc(
    "crear_totp_pendiente",
    {
      p_tipo: tipo,
      p_sujeto: sujeto,
      p_secreto: secretoCifrado,
    },
  );

  if (error) {
    console.error("[totp] no se pudo crear la credencial pendiente.", error);
    throw errorInterno();
  }

  if (data !== true) {
    throw new ErrorVerificacion(
      "ya_configurado",
      "Esta cuenta ya tiene una app de autenticación vinculada. Pide a un administrador que la reinicie.",
      409,
    );
  }
}

export async function reiniciarCredencialTotp(
  tipo: TipoCredencial,
  sujeto: string,
): Promise<void> {
  const { error } = await obtenerSupabaseAdmin()
    .from("totp_credenciales")
    .delete()
    .eq("tipo", tipo)
    .eq("sujeto", sujeto);

  if (error) {
    console.error("[totp] no se pudo reiniciar la credencial.", error);
    throw errorInterno("No pudimos reiniciar la app de autenticación.");
  }
}

async function registrarFallo(
  tipo: TipoCredencial,
  sujeto: string,
): Promise<boolean> {
  const { data, error } = await obtenerSupabaseAdmin().rpc(
    "registrar_fallo_totp",
    {
      p_tipo: tipo,
      p_sujeto: sujeto,
    },
  );

  if (error) {
    console.error("[totp] no se pudo registrar el intento fallido.", error);
    return false;
  }

  return Boolean((data as { bloqueado?: boolean } | null)?.bloqueado);
}

function mensajeBloqueo(): string {
  return `Demasiados intentos. Espera ${CONFIG.bloqueoTotpMinutos} minutos antes de volver a intentarlo.`;
}

function estaBloqueada(credencial: CredencialTotp): boolean {
  if (!credencial.bloqueadoHasta) return false;
  return Date.parse(credencial.bloqueadoHasta) > Date.now();
}

/**
 * Comprueba el código de 6 dígitos y marca el paso como usado de forma atómica.
 * Si la credencial está pendiente, `permitirPendiente` la confirma.
 */
async function verificarYMarcar(
  credencial: CredencialTotp,
  codigo: string,
  permitirPendiente: boolean,
): Promise<void> {
  if (!credencial.confirmadoEn && !permitirPendiente) {
    throw new ErrorVerificacion(
      "no_configurado",
      "Tu app de autenticación aún no está vinculada. Pide un código de enrolamiento a un administrador.",
      409,
    );
  }

  if (estaBloqueada(credencial)) {
    throw new ErrorVerificacion("bloqueado", mensajeBloqueo(), 429);
  }

  let secreto: string;

  try {
    secreto = descifrarSecreto(credencial.secretoCifrado);
  } catch (error) {
    console.error("[totp] no se pudo descifrar el secreto.", error);
    throw errorInterno("No pudimos validar la app de autenticación.");
  }

  const resultado = verificarCodigoTotp(
    secreto,
    codigo.trim(),
    CONFIG.totpVentanaPasos,
    CONFIG.totpPeriodoSegundos,
  );

  if (!resultado.valido) {
    const bloqueado = await registrarFallo(credencial.tipo, credencial.sujeto);

    if (bloqueado) {
      throw new ErrorVerificacion("bloqueado", mensajeBloqueo(), 429);
    }

    throw new ErrorVerificacion(
      "codigo",
      "El código no coincide. Abre tu app de autenticación y revisa los 6 dígitos.",
      400,
    );
  }

  const funcion = credencial.confirmadoEn
    ? "marcar_paso_totp"
    : "confirmar_totp";

  const { data, error } = await obtenerSupabaseAdmin().rpc(funcion, {
    p_tipo: credencial.tipo,
    p_sujeto: credencial.sujeto,
    p_paso: resultado.paso,
  });

  if (error) {
    console.error("[totp] no se pudo marcar el paso.", error);
    throw errorInterno("No pudimos completar la verificación.");
  }

  if (data !== true) {
    throw new ErrorVerificacion(
      "ya_usado",
      "Ese código ya fue usado. Espera a que tu app muestre el siguiente.",
      400,
    );
  }
}

/** Valida un código contra una credencial ya activa. */
export async function validarCredencialTotp(
  tipo: TipoCredencial,
  sujeto: string,
  codigo: string,
): Promise<void> {
  const credencial = await leerCredencialTotp(tipo, sujeto);

  if (!credencial) {
    throw new ErrorVerificacion(
      "no_configurado",
      "Tu app de autenticación aún no está vinculada. Pide un código de enrolamiento a un administrador.",
      409,
    );
  }

  await verificarYMarcar(credencial, codigo, false);
}

/** Confirma una credencial pendiente o valida una ya activa. */
export async function confirmarCredencialTotp(
  tipo: TipoCredencial,
  sujeto: string,
  codigo: string,
): Promise<void> {
  const credencial = await leerCredencialTotp(tipo, sujeto);

  if (!credencial) {
    throw new ErrorVerificacion(
      "no_configurado",
      "El enrolamiento expiró. Pide un nuevo código a un administrador.",
      409,
    );
  }

  await verificarYMarcar(credencial, codigo, true);
}
