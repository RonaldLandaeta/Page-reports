import type { CodigoErrorApi } from "@/lib/api/respuestas";

/**
 * Códigos internos del flujo de verificación. La API traduce estos códigos a
 * los que entiende el cliente (`CodigoErrorApi`) con `codigoApiDeError`.
 */
export type CodigoErrorVerificacion =
  | "validacion"
  | "limite"
  | "bloqueado"
  | "expirado"
  | "codigo"
  | "ya_usado"
  | "no_configurado"
  | "ya_configurado"
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

/** Traduce el error interno al contrato público `{ ok, codigo, mensaje }`. */
export function codigoApiDeError(error: ErrorVerificacion): CodigoErrorApi {
  switch (error.codigo) {
    case "interno":
      return "interno";
    case "limite":
    case "bloqueado":
      return "limite";
    case "validacion":
      return "validacion";
    default:
      return "verificacion";
  }
}
