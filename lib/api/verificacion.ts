import type { NextResponse } from "next/server";

import {
  codigoApiDeError,
  ErrorVerificacion,
} from "@/lib/errores-verificacion";

import { respuestaError } from "./respuestas";

/** Traduce el error interno de verificación al contrato público de la API. */
export function responderErrorVerificacion(
  error: unknown,
  etiqueta: string,
  mensajeInterno = "No pudimos completar la verificación.",
): NextResponse {
  if (error instanceof ErrorVerificacion) {
    return respuestaError(codigoApiDeError(error), error.message, error.status);
  }

  console.error(etiqueta, error);
  return respuestaError("interno", mensajeInterno, 500);
}
