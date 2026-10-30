import { NextResponse } from "next/server";

export type CodigoErrorApi =
  | "validacion"
  | "verificacion"
  | "duplicado"
  | "limite"
  | "materia"
  | "no_encontrado"
  | "interno";

export function respuestaOk<T extends Record<string, unknown>>(
  datos: T,
  status = 200,
): NextResponse {
  return NextResponse.json({ ok: true, ...datos }, { status });
}

export function respuestaError(
  codigo: CodigoErrorApi,
  mensaje: string,
  status: number,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    { ok: false, codigo, mensaje, ...extra },
    { status },
  );
}

export async function leerCuerpo(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo: unknown = await request.json();
    return typeof cuerpo === "object" && cuerpo !== null
      ? (cuerpo as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function texto(
  cuerpo: Record<string, unknown> | null,
  clave: string,
): string {
  const valor = cuerpo?.[clave];
  return typeof valor === "string" ? valor.trim() : "";
}
