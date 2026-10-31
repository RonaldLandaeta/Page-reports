import { obtenerAdmin } from "@/lib/admin/sesion";
import { leerCuerpo, respuestaError, respuestaOk, texto } from "@/lib/api/respuestas";
import { esEstadoReporte } from "@/lib/catalogos";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const { id } = await params;
    const cuerpo = await leerCuerpo(request);
    const estado = texto(cuerpo, "estado");
    const nota = texto(cuerpo, "nota").slice(0, 500);

    if (!UUID.test(id) || !esEstadoReporte(estado)) {
      return respuestaError("validacion", "Datos inválidos.", 422);
    }

    const { data, error } = await obtenerSupabaseAdmin().rpc(
  "cambiar_estado_reporte",
  { 
    p_id: id, 
    p_estado: estado, 
    p_nota: nota || undefined 
  },
);

    if (error) {
      console.error("[api/admin/reportes/:id]", error);
      return respuestaError("interno", "No pudimos cambiar el estado.", 500);
    }

    const resultado = data as { ok?: boolean; mensaje?: string } | null;

    if (!resultado?.ok) {
      return respuestaError(
        "no_encontrado",
        resultado?.mensaje ?? "No pudimos cambiar el estado.",
        404,
      );
    }

    return respuestaOk({});
  } catch (error) {
    console.error("[api/admin/reportes/:id]", error);
    return respuestaError("interno", "No pudimos cambiar el estado.", 500);
  }
}
