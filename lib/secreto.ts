import "server-only";

/**
 * Secreto único para firmar tokens y hashear códigos/IP. En producción es
 * obligatorio (mínimo 32 caracteres); en desarrollo hay un valor de respaldo.
 */
export function secretoVerificacion(): string {
  const valor = (process.env.VERIFICACION_SECRET ?? "").trim();

  if (valor && valor.length >= 32) return valor;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VERIFICACION_SECRET no está configurado (mínimo 32 caracteres).",
    );
  }

  return "desarrollo-secreto-de-verificacion-no-usar-en-produccion";
}
