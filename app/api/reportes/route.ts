import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import { esTipoError, tipoRequiereDetalle } from "@/lib/catalogos";
import { enviarConfirmacionReporte } from "@/lib/email";
import { buscarMateriaPorCodigo } from "@/lib/materias";
import {
  crearReporteEnDb,
  type ReporteNuevoDb,
  type ResultadoCreacion,
} from "@/lib/supabase/reportes";
import type { TipoError } from "@/lib/types";
import {
  CEDULA_MAX_DIGITOS,
  CEDULA_MIN_DIGITOS,
  DETALLE_ERROR_MAX,
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
  const materiaCodigo = texto(cuerpo, "materia_codigo");
  const tipoError = texto(cuerpo, "tipo_error");
  const detalleEnviado = texto(cuerpo, "tipo_error_detalle").replace(/\s+/g, " ");
  const motivo = texto(cuerpo, "motivo");
  const token = texto(cuerpo, "verificacionToken");

  // El cliente envía el código único; nrc y nombre se resuelven en el servidor
  // desde la malla local (el NRC solo no sirve: se repite entre carreras).
  const materia = buscarMateriaPorCodigo(materiaCodigo);

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

  if (!materia) {
    campos.materia_codigo = "Selecciona una materia de la malla.";
  }

  if (!esTipoError(tipoError)) {
    campos.tipo_error = "Selecciona el tipo de error.";
  }

  // «Especifica el error» solo aplica a "otro"; en los demás tipos se ignora.
  const detalle = tipoRequiereDetalle(tipoError) ? detalleEnviado : "";

  if (tipoRequiereDetalle(tipoError)) {
    if (detalle.length === 0) {
      campos.tipo_error_detalle = "Especifica el error.";
    } else if (detalle.length > DETALLE_ERROR_MAX) {
      campos.tipo_error_detalle = `Máximo ${DETALLE_ERROR_MAX} caracteres.`;
    }
  }

  if (motivo.length < MOTIVO_MIN || motivo.length > MOTIVO_MAX) {
    campos.motivo = `Describe el problema entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres.`;
  }

  if (Object.keys(campos).length > 0 || !materia) {
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

  const input: ReporteNuevoDb = {
    ci,
    nombre,
    correo,
    nrc: materia.nrc,
    materia_codigo: materia.codigo,
    materia_nombre: materia.nombre,
    tipo_error: tipoError as TipoError,
    tipo_error_detalle: detalle,
    motivo,
  };

  let resultado: ResultadoCreacion;

  try {
    resultado = await crearReporteEnDb(input);
  } catch (error) {
    // Puede fallar antes de llegar a Supabase (cliente sin configurar) o por red.
    console.error("[api/reportes] no se pudo crear el reporte.", error);
    return respuestaError(
      "interno",
      "No pudimos registrar el reporte. Intenta nuevamente.",
      500,
    );
  }

  if (!resultado.ok) {
    const status =
      resultado.codigo === "duplicado"
        ? 409
        : resultado.codigo === "limite"
          ? 429
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
