import { obtenerAdmin } from "@/lib/admin/sesion";
import { respuestaError, respuestaOk } from "@/lib/api/respuestas";
import { esEstadoReporte } from "@/lib/catalogos";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import { mapearReporte, type FilaReporteDb } from "@/lib/supabase/reportes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS =
  "id, ticket, ci, nombre, correo, nrc, tipo_error, motivo, materia_nombre, materia_aula, estado, creado_en";

export async function GET(request: Request) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const parametros = new URL(request.url).searchParams;
    const estado = parametros.get("estado") ?? "";
    const q = (parametros.get("q") ?? "").trim().slice(0, 40);

    let consulta = obtenerSupabaseAdmin()
      .from("reportes")
      .select(CAMPOS)
      .order("creado_en", { ascending: false })
      .limit(200);

    if (esEstadoReporte(estado)) consulta = consulta.eq("estado", estado);

    // Solo dígitos/guion/letras: evita meter sintaxis de filtro de PostgREST.
    const seguro = q.replace(/[^A-Za-z0-9-]/g, "");
    if (seguro) {
      consulta = consulta.or(
        `ticket.ilike.%${seguro}%,ci.ilike.%${seguro}%,nrc.ilike.%${seguro}%`,
      );
    }

    const { data, error } = await consulta;

    if (error) {
      console.error("[api/admin/reportes]", error);
      return respuestaError("interno", "No pudimos cargar los reportes.", 500);
    }

    return respuestaOk({
      reportes: (data ?? []).map((fila) => mapearReporte(fila as FilaReporteDb)),
    });
  } catch (error) {
    console.error("[api/admin/reportes]", error);
    return respuestaError("interno", "No pudimos cargar los reportes.", 500);
  }
}
