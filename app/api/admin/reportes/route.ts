import { NextResponse } from "next/server";

import { obtenerAdmin } from "@/lib/admin/sesion";
import { leerCuerpo, respuestaError, respuestaOk, texto } from "@/lib/api/respuestas";
import {
  esEstadoReporte,
  getEstadoReporteLabel,
  getTipoErrorLabel,
} from "@/lib/catalogos";
import { CONFIG } from "@/lib/config";
import { buscarMateriaPorCodigo } from "@/lib/materias";
import {
  fechaLocal,
  reportesACsv,
  reportesADatosIngreso,
} from "@/lib/reportes/formato";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import { CAMPOS_PUBLICOS, mapearReporte } from "@/lib/supabase/reportes";
import type { EstadoReporte, Reporte } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_LISTA = 200;
const LIMITE_DESCARGA = 5_000;
/** PostgREST devuelve como máximo 1000 filas por petición. */
const TAMANO_PAGINA = 1_000;
const MAX_IDS = 1_000;
const TAMANO_LOTE_RPC = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Filtros {
  estado: string;
  q: string;
  ids?: string[];
}

function filtrosDeTexto(estado: unknown, q: unknown): Pick<Filtros, "estado" | "q"> {
  return {
    estado: typeof estado === "string" ? estado : "",
    q: (typeof q === "string" ? q : "").trim().slice(0, 40),
  };
}

/** Misma consulta para la lista y la descarga: los filtros nunca divergen. */
function consultaReportes(filtros: Filtros, desde: number, hasta: number) {
  let consulta = obtenerSupabaseAdmin()
    .from("reportes")
    .select(CAMPOS_PUBLICOS, { count: "exact" })
    .order("creado_en", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, hasta);

  if (filtros.ids) consulta = consulta.in("id", filtros.ids);
  if (esEstadoReporte(filtros.estado)) consulta = consulta.eq("estado", filtros.estado);

  const seguro = filtros.q.replace(/[^A-Za-z0-9-]/g, "");
  if (seguro) {
    consulta = consulta.or(
      `ticket.ilike.%${seguro}%,ci.ilike.%${seguro}%,nrc.ilike.%${seguro}%,materia_codigo.ilike.%${seguro}%`,
    );
  }

  return consulta;
}

function leerIds(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;

  const ids = [...new Set(valor)];

  if (ids.length === 0 || ids.length > MAX_IDS) return null;
  if (!ids.every((id): id is string => typeof id === "string" && UUID.test(id))) {
    return null;
  }

  return ids;
}

/** Cambia el estado por tandas; devuelve cuántos reportes cambiaron de verdad. */
async function cambiarEstadoPorLotes(
  ids: string[],
  estado: EstadoReporte,
  nota: string,
  adminEmail: string,
): Promise<number> {
  const supabase = obtenerSupabaseAdmin();
  let cambiados = 0;

  for (let i = 0; i < ids.length; i += TAMANO_LOTE_RPC) {
    const { data, error } = await supabase.rpc("cambiar_estado_lote", {
      p_ids: ids.slice(i, i + TAMANO_LOTE_RPC),
      p_estado: estado,
      p_nota: nota || undefined,
      p_admin: adminEmail,
    });

    if (error) throw error;
    cambiados += data ?? 0;
  }

  return cambiados;
}

export async function GET(request: Request) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const parametros = new URL(request.url).searchParams;
    const filtros = filtrosDeTexto(parametros.get("estado"), parametros.get("q"));

    const { data, count, error } = await consultaReportes(filtros, 0, LIMITE_LISTA - 1);

    if (error) {
      console.error("[api/admin/reportes] Error en consulta Supabase:", error);
      return respuestaError("interno", "No pudimos cargar los reportes.", 500);
    }

    return respuestaOk({
      reportes: (data ?? []).map((fila) => mapearReporte(fila)),
      total: count ?? data?.length ?? 0,
    });
  } catch (error) {
    console.error("[api/admin/reportes]", error);
    return respuestaError("interno", "No pudimos cargar los reportes.", 500);
  }
}

/**
 * Acciones por lote:
 *  - { accion: "estado", ids, estado, nota? }
 *  - { accion: "descargar", formato: "csv" | "json", ids? | estado?, q? }
 *    El formato "json" produce el datos.json de app_ingresos
 *    ({ estudiantes, reportes }); "csv" es la hoja completa para Excel.
 *    Al descargar, los «pendiente» pasan a «en-revision» (queda en el historial).
 */
export async function POST(request: Request) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const cuerpo = await leerCuerpo(request);
    const accion = texto(cuerpo, "accion");

    if (accion === "estado") {
      const ids = leerIds(cuerpo?.ids);
      const estado = texto(cuerpo, "estado");
      const nota = texto(cuerpo, "nota").slice(0, 500);

      if (!ids || !esEstadoReporte(estado)) {
        return respuestaError("validacion", "Datos inválidos.", 422);
      }

      const cambiados = await cambiarEstadoPorLotes(ids, estado, nota, admin.email);
      return respuestaOk({ cambiados, total: ids.length });
    }

    if (accion === "descargar") {
      const formato = texto(cuerpo, "formato") === "json" ? "json" : "csv";
      const ids = cuerpo?.ids === undefined ? undefined : leerIds(cuerpo.ids);

      if (ids === null) {
        return respuestaError("validacion", "Selección inválida.", 422);
      }

      const filtros: Filtros = {
        ...filtrosDeTexto(cuerpo?.estado, cuerpo?.q),
        ids,
      };

      const reportes: Reporte[] = [];
      let hayMas = false;

      for (let desde = 0; desde < LIMITE_DESCARGA; desde += TAMANO_PAGINA) {
        const { data, count, error } = await consultaReportes(
          filtros,
          desde,
          desde + TAMANO_PAGINA - 1,
        );

        if (error) throw error;

        reportes.push(...(data ?? []).map((fila) => mapearReporte(fila)));

        if ((data?.length ?? 0) < TAMANO_PAGINA) break;
        if (desde + TAMANO_PAGINA >= (count ?? 0)) break;
        if (desde + TAMANO_PAGINA >= LIMITE_DESCARGA) hayMas = true;
      }

      if (reportes.length === 0) {
        return respuestaError("no_encontrado", "No hay reportes para descargar.", 404);
      }

      // Primero se marca; si falla, no se entrega el archivo (nada a medias).
      const pendientes = reportes.filter((r) => r.estado === "pendiente").map((r) => r.id);
      let marcados = 0;

      if (pendientes.length > 0) {
        marcados = await cambiarEstadoPorLotes(
          pendientes,
          "en-revision",
          "Descarga de reportes",
          admin.email,
        );

        const marcadosSet = new Set(pendientes);
        for (const r of reportes) {
          if (marcadosSet.has(r.id)) r.estado = "en-revision";
        }
      }

      const marca = fechaLocal(new Date(), CONFIG.zonaHoraria).replace(/[: ]/g, "-");
      // El JSON es el «datos.json» de app_ingresos; el CSV es para Excel.
      const nombre =
        formato === "json" ? `datos-${marca}.json` : `reportes-${marca}.csv`;

      const cuerpoArchivo =
        formato === "json"
          ? JSON.stringify(
              reportesADatosIngreso(
                reportes,
                getTipoErrorLabel,
                (codigo) => buscarMateriaPorCodigo(codigo)?.horario,
              ),
              null,
              2,
            )
          : reportesACsv(
              reportes,
              { estado: getEstadoReporteLabel, tipo: getTipoErrorLabel },
              CONFIG.zonaHoraria,
            );

      return new NextResponse(cuerpoArchivo, {
        headers: {
          "Content-Type":
            formato === "json"
              ? "application/json; charset=utf-8"
              : "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombre}"`,
          "Cache-Control": "no-store",
          "X-Reportes-Total": String(reportes.length),
          "X-Reportes-Marcados": String(marcados),
          "X-Reportes-Truncado": hayMas ? "1" : "0",
        },
      });
    }

    return respuestaError("validacion", "Acción inválida.", 422);
  } catch (error) {
    console.error("[api/admin/reportes:POST]", error);
    return respuestaError("interno", "No pudimos completar la operación.", 500);
  }
}
