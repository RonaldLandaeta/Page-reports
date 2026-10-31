import {
  leerCuerpo,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import type { TipoError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);

  const ci = texto(cuerpo, "ci") || "12345678";
  const nombre = texto(cuerpo, "nombre") || "Estudiante Prueba";
  const correo = texto(cuerpo, "correo").toLowerCase() || "estudiante@ejemplo.com";
  const materiaCodigo = texto(cuerpo, "materia_codigo") || "MAT-101";
  const tipoError = texto(cuerpo, "tipo_error") || "horario_cruce";
  const detalle = texto(cuerpo, "tipo_error_detalle") || "";
  const motivo = texto(cuerpo, "motivo") || "Motivo de prueba simulado.";

  // Generamos un ticket único para la simulación
  const ticketSimulado = `REP-${Math.floor(100000 + Math.random() * 900000)}`;

  console.info(`[reportes:mock] Creando reporte simulado. Ticket: ${ticketSimulado} para ${nombre} (${ci})`);

  const reporteSimulado = {
    id: "mock-id-" + Date.now(),
    ticket: ticketSimulado,
    ci,
    nombre,
    correo,
    nrc: "1234",
    materiaCodigo,
    materiaNombre: "Materia Simulada",
    tipo_error: tipoError as TipoError,
    tipoErrorDetalle: detalle,
    motivo,
    estado: "pendiente",
    created_at: new Date().toISOString(),
  };

  return respuestaOk({ reporte: reporteSimulado }, 201);
}