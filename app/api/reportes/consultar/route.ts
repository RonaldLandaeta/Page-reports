import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import { buscarReporteEnDb } from "@/lib/supabase/reportes";
import {
  esCedulaValida,
  esTicketValido,
  normalizarTicket,
} from "@/lib/validaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);

  if (!cuerpo) {
    return respuestaError("validacion", "El cuerpo de la solicitud es inválido.", 400);
  }

  const ticket = normalizarTicket(texto(cuerpo, "ticket"));
  const ci = texto(cuerpo, "ci");

  if (!esTicketValido(ticket) || !esCedulaValida(ci)) {
    return respuestaError(
      "validacion",
      "Revisa el ticket y la cédula: alguno de los dos no tiene el formato correcto.",
      422,
    );
  }

  try {
    const reporte = await buscarReporteEnDb(ticket, ci);

    if (!reporte) {
      // Mensaje genérico a propósito: no revelamos cuál dato falló.
      return respuestaError(
        "no_encontrado",
        "No encontramos un reporte con ese ticket y cédula. Verifica ambos datos.",
        404,
      );
    }

    return respuestaOk({ reporte });
  } catch (error) {
    console.error("[api/reportes/consultar]", error);
    return respuestaError(
      "interno",
      "No pudimos consultar el reporte. Intenta de nuevo.",
      500,
    );
  }
}
