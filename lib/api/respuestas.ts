import { NextResponse } from "next/server";

export type CodigoErrorApi =
  | "validacion"
  | "verificacion"
  | "duplicado"
  | "limite"
  | "materia"
  | "no_encontrado"
  | "interno";

/**
 * Tope del cuerpo JSON. Ninguna petición legítima se acerca a este tamaño
 * (motivo máximo: 600 caracteres), así que un cuerpo mayor se rechaza antes
 * de consumir memoria.
 */
const MAX_CUERPO_BYTES = 64 * 1024;

const CABECERAS_SIN_CACHE = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function respuestaOk<T extends Record<string, unknown>>(
  datos: T,
  status = 200,
): NextResponse {
  return NextResponse.json(
    { ok: true, ...datos },
    { status, headers: CABECERAS_SIN_CACHE },
  );
}

export function respuestaError(
  codigo: CodigoErrorApi,
  mensaje: string,
  status: number,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    { ok: false, codigo, mensaje, ...extra },
    { status, headers: CABECERAS_SIN_CACHE },
  );
}

/**
 * Lee el cuerpo JSON aplicando un límite de tamaño. Devuelve `null` si el
 * cuerpo es demasiado grande, no es JSON o no es un objeto.
 */
export async function leerCuerpo(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const tipo = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!tipo.includes("application/json")) return null;

  const largoDeclarado = Number(request.headers.get("content-length") ?? "");

  if (Number.isFinite(largoDeclarado) && largoDeclarado > MAX_CUERPO_BYTES) {
    return null;
  }

  try {
    const texto = await leerTextoLimitado(request);

    if (texto === null) return null;

    const cuerpo: unknown = JSON.parse(texto);

    return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo)
      ? (cuerpo as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Acumula el cuerpo en trozos y corta en cuanto supera el límite. */
async function leerTextoLimitado(request: Request): Promise<string | null> {
  const cuerpo = request.body;

  if (!cuerpo) return "";

  const lector = cuerpo.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await lector.read();

      if (done) break;
      if (!value) continue;

      total += value.byteLength;

      if (total > MAX_CUERPO_BYTES) {
        await lector.cancel();
        return null;
      }

      trozos.push(value);
    }
  } finally {
    lector.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let posicion = 0;

  for (const trozo of trozos) {
    bytes.set(trozo, posicion);
    posicion += trozo.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function texto(
  cuerpo: Record<string, unknown> | null,
  clave: string,
): string {
  const valor = cuerpo?.[clave];
  return typeof valor === "string" ? valor.trim() : "";
}
