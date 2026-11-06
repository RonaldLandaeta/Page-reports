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
  esCorreoValido,
} from "@/lib/validaciones";

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
  }

  if (!materia) {
    campos.materia_codigo = "Selecciona una materia válida.";
  }

  if (!esTipoError(tipoError)) {
    campos.tipo_error = "Selecciona el tipo de error.";
  }

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
    // 1. Guardar en Supabase (la función helper asignará el prefijo TK o la secuencia de BD)
    resultado = await crearReporteEnDb(input);
  } catch (error) {
    console.error("[api/reportes] Error al insertar en Supabase:", error);
    return respuestaError(
      "interno",
      "No se pudo guardar el reporte en la base de datos.",
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

  // 2. Intento de envío de correo (best-effort)
  try {
    await enviarConfirmacionReporte(resultado.reporte);
  } catch (error) {
    console.warn("[api/reportes] El correo no se envió, pero el reporte sí fue guardado:", error);
  }

  return respuestaOk({ reporte: resultado.reporte }, 201);
}