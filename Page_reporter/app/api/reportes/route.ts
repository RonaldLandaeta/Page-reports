import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import { esTipoError } from "@/lib/catalogos";
import { enviarConfirmacionReporte } from "@/lib/email";
import { crearReporteEnDb } from "@/lib/supabase/reportes";
import type { ReporteInput } from "@/lib/types";
import {
  CEDULA_MAX_DIGITOS,
  CEDULA_MIN_DIGITOS,
  MOTIVO_MAX,
  MOTIVO_MIN,
  NOMBRE_MAX,
  NOMBRE_MIN,
  esCedulaValida,
  esCorreoInstitucional,
  esCorreoValido,
  mensajeCorreoInstitucional,
} from "@/lib/validaciones";
import { verificarTokenVerificacion } from "@/lib/verificacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);

  if (!cuerpo) {
    return respuestaError("validacion", "El cuerpo de la solicitud es inválido.", 400);
  }

  const ci = texto(cuerpo, "ci");
  const nombre = texto(cuerpo, "nombre").replace(/\s+/g, " ");
  const correo = texto(cuerpo, "correo").toLowerCase();
  const nrc = texto(cuerpo, "nrc");
  const tipoError = texto(cuerpo, "tipo_error");
  const motivo = texto(cuerpo, "motivo");
  const token = texto(cuerpo, "verificacionToken");

  const campos: Record<string, string> = {};

  if (!esCedulaValida(ci)) {
    campos.ci = `La cédula debe tener entre ${CEDULA_MIN_DIGITOS} y ${CEDULA_MAX_DIGITOS} dígitos.`;
  }

  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    campos.nombre = `Ingresa tu nombre completo (entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres).`;
  }

  if (!esCorreoValido(correo)) {
    campos.correo = "Ingresa un correo electrónico válido.";
  } else if (!esCorreoInstitucional(correo)) {
    campos.correo = mensajeCorreoInstitucional();
  }

  if (!/^\d{3,10}$/.test(nrc)) {
    campos.nrc = "Selecciona una materia del catálogo.";
  }

  if (!esTipoError(tipoError)) {
    campos.tipo_error = "Selecciona el tipo de error.";
  }

  if (motivo.length < MOTIVO_MIN || motivo.length > MOTIVO_MAX) {
    campos.motivo = `Describe el problema entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres.`;
  }

  if (Object.keys(campos).length > 0) {
    return respuestaError(
      "validacion",
      "Revisa los datos del formulario.",
      422,
      { campos },
    );
  }

  let sesion: { correo: string; ci: string } | null = null;

  try {
    sesion = verificarTokenVerificacion(token);
  } catch (error) {
    console.error("[api/reportes] token no verificable.", error);
    return respuestaError(
      "interno",
      "La verificación de correo no está configurada.",
      500,
    );
  }

  if (!sesion || sesion.correo !== correo || sesion.ci !== ci) {
    return respuestaError(
      "verificacion",
      "Verifica tu correo antes de enviar el reporte.",
      401,
    );
  }

  const input: ReporteInput = {
    ci,
    nombre,
    correo,
    nrc,
    tipo_error: tipoError as ReporteInput["tipo_error"],
    motivo,
  };

  const resultado = await crearReporteEnDb(input);

  if (!resultado.ok) {
    const status =
      resultado.codigo === "duplicado"
        ? 409
        : resultado.codigo === "limite"
          ? 429
          : resultado.codigo === "materia"
            ? 400
            : 500;

    return respuestaError(
      resultado.codigo,
      resultado.mensaje,
      status,
      resultado.ticket ? { ticket: resultado.ticket } : {},
    );
  }

  // El correo es best-effort: si falla, el reporte ya quedó registrado.
  try {
    await enviarConfirmacionReporte(resultado.reporte);
  } catch (error) {
    console.error("[api/reportes] confirmación por correo falló.", error);
  }

  return respuestaOk({ reporte: resultado.reporte }, 201);
}
