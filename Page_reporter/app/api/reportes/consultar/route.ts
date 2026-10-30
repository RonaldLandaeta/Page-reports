import { hashIp, ipDelCliente } from "@/lib/api/ip";
import {
  leerCuerpo,
  respuestaError,
  respuestaOk,
  texto,
} from "@/lib/api/respuestas";
import {
  consultasBloqueadas,
  registrarConsultaFallida,
} from "@/lib/supabase/consultas";
import { buscarReporteEnDb } from "@/lib/supabase/reportes";
import {
  esCedulaValida,
  enmascararCorreo,
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
    const ipHash = hashIp(ipDelCliente(request));

    if (await consultasBloqueadas(ipHash)) {
      return respuestaError(
        "limite",
        "Demasiadas consultas fallidas. Espera unos minutos e intenta de nuevo.",
        429,
      );
    }

    const reporte = await buscarReporteEnDb(ticket, ci);

    if (!reporte) {
      await registrarConsultaFallida(ipHash);
      // Mensaje genérico a propósito: no revelamos cuál dato falló.
      return respuestaError(
        "no_encontrado",
        "No encontramos un reporte con ese ticket y cédula. Verifica ambos datos.",
        404,
      );
    }

    // El correo completo no se devuelve: ticket + cédula no prueban ser el dueño.
    return respuestaOk({
      reporte: { ...reporte, correo: enmascararCorreo(reporte.correo) },
    });
  } catch (error) {
    console.error("[api/reportes/consultar]", error);
    return respuestaError(
      "interno",
      "No pudimos consultar el reporte. Intenta de nuevo.",
      500,
    );
  }
}
