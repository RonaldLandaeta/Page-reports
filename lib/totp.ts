import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import QRCode from "qrcode";

import { secretoVerificacion } from "@/lib/secreto";

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** Sin caracteres que se confunden al dictarlos (0/O, 1/I/L). */
const ALFABETO_ENROLAMIENTO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const LONGITUD_CODIGO_ENROLAMIENTO = 10;

/** 160 bits: el tamaño recomendado por la RFC 4226 para HMAC-SHA1. */
const BYTES_SECRETO = 20;

/** Codifica bytes en base32 sin relleno (formato de las apps TOTP). */
function codificarBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = "";

  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  }

  return salida;
}

/** Decodifica base32 ignorando espacios, guiones y relleno `=`. */
function decodificarBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];

  for (const caracter of limpio) {
    const indice = ALFABETO_BASE32.indexOf(caracter);

    if (indice < 0) {
      throw new Error("El secreto TOTP no es base32 válido.");
    }

    valor = (valor << 5) | indice;
    bits += 5;

    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generarSecretoTotp(): string {
  return codificarBase32(randomBytes(BYTES_SECRETO));
}

/** Código de 6 dígitos para un paso concreto (epoch / 30 s). */
function codigoTotp(secretoBase32: string, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeUInt32BE(Math.floor(paso / 2 ** 32), 0);
  contador.writeUInt32BE(paso >>> 0, 4);

  const hash = createHmac("sha1", decodificarBase32(secretoBase32))
    .update(contador)
    .digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binario =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return String(binario % 1_000_000).padStart(6, "0");
}

function pasoActualTotp(periodo = 30): number {
  return Math.floor(Date.now() / 1000 / periodo);
}

/**
 * Comprueba el código en el paso actual y en los pasos vecinos (tolerancia a
 * relojes desfasados). Devuelve el paso que coincidió para poder impedir que
 * el mismo código se use dos veces.
 */
export function verificarCodigoTotp(
  secretoBase32: string,
  codigo: string,
  ventana = 1,
  periodo = 30,
): { valido: boolean; paso: number } {
  if (!/^\d{6}$/.test(codigo)) return { valido: false, paso: 0 };

  const actual = pasoActualTotp(periodo);
  const recibido = Buffer.from(codigo);

  // Primero el paso actual; después los vecinos.
  const pasos = [actual];
  for (let delta = 1; delta <= ventana; delta++) {
    pasos.push(actual + delta, actual - delta);
  }

  for (const paso of pasos) {
    const esperado = Buffer.from(codigoTotp(secretoBase32, paso));

    if (
      esperado.length === recibido.length &&
      timingSafeEqual(esperado, recibido)
    ) {
      return { valido: true, paso };
    }
  }

  return { valido: false, paso: 0 };
}

/** URL que las apps de autenticación leen del QR. */
export function urlOtpauth(datos: {
  secreto: string;
  cuenta: string;
  emisor: string;
  periodo?: number;
  digitos?: number;
}): string {
  const digitos = datos.digitos === 8 ? 8 : 6;
  const parametros = new URLSearchParams({
    secret: datos.secreto,
    issuer: datos.emisor,
    algorithm: "SHA1",
    digits: String(digitos),
    period: String(datos.periodo ?? 30),
  });

  const etiqueta = `${datos.emisor}:${datos.cuenta}`;

  return `otpauth://totp/${encodeURIComponent(etiqueta)}?${parametros.toString()}`;
}

export async function qrDataUrl(texto: string): Promise<string> {
  return QRCode.toDataURL(texto, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });
}

// ── Cifrado de los secretos TOTP en la base ─────────────────────────────────

/**
 * Clave separada de la de los tokens. Si se configura `TOTP_SECRET`, se usa
 * esa; si no, se deriva de `VERIFICACION_SECRET`. Cambiarla invalida todos los
 * enrolamientos existentes.
 */
function claveCifrado(): Buffer {
  const configurado = (process.env.TOTP_SECRET ?? "").trim();

  if (configurado && configurado.length < 32) {
    throw new Error("TOTP_SECRET debe tener al menos 32 caracteres.");
  }

  const material = configurado || secretoVerificacion();

  return createHash("sha256")
    .update(`totp-cifrado-v1:${material}`)
    .digest();
}

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` en base64url. */
export function cifrarSecreto(secreto: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", claveCifrado(), iv);
  const cifrado = Buffer.concat([
    cifrador.update(secreto, "utf8"),
    cifrador.final(),
  ]);
  const tag = cifrador.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

export function descifrarSecreto(valor: string): string {
  const [version, iv, tag, datos] = valor.split(".");

  if (version !== "v1" || !iv || !tag || !datos) {
    throw new Error("El secreto TOTP guardado no tiene un formato válido.");
  }

  const descifrador = createDecipheriv(
    "aes-256-gcm",
    claveCifrado(),
    Buffer.from(iv, "base64url"),
  );
  descifrador.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    descifrador.update(Buffer.from(datos, "base64url")),
    descifrador.final(),
  ]).toString("utf8");
}

// ── Códigos de enrolamiento ─────────────────────────────────────────────────

/** Código legible de 10 caracteres; se muestra una sola vez al administrador. */
export function generarCodigoEnrolamiento(): string {
  let salida = "";

  for (let i = 0; i < LONGITUD_CODIGO_ENROLAMIENTO; i++) {
    salida += ALFABETO_ENROLAMIENTO[randomInt(0, ALFABETO_ENROLAMIENTO.length)];
  }

  return salida;
}

export function normalizarCodigoEnrolamiento(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Hash con clave: la base nunca guarda el código en claro. */
export function hashCodigoEnrolamiento(codigo: string): string {
  const normalizado = normalizarCodigoEnrolamiento(codigo);

  return createHmac("sha256", secretoVerificacion())
    .update(`enrolamiento-v1:${normalizado}`)
    .digest("hex");
}
