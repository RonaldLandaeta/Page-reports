import { CONFIG } from "./config";

export interface CodigoVerificacion {
  valor: string;
  expiraEn: number;
}

export type ResultadoVerificacion = "ok" | "invalido" | "expirado";

/**
 * Código de 6 dígitos para la verificación simulada del prototipo.
 * Al integrar backend, el código debe generarse y validarse en el servidor.
 */
export function generarCodigoVerificacion(
  ahora: number = Date.now(),
): CodigoVerificacion {
  return {
    valor: String(Math.floor(100000 + Math.random() * 900000)),
    expiraEn: ahora + CONFIG.duracionCodigoVerificacionMinutos * 60 * 1000,
  };
}

export function verificarCodigo(
  codigo: CodigoVerificacion | null | undefined,
  ingresado: string,
  ahora: number = Date.now(),
): ResultadoVerificacion {
  if (!codigo) return "invalido";
  if (ahora > codigo.expiraEn) return "expirado";

  return ingresado.trim() === codigo.valor ? "ok" : "invalido";
}
