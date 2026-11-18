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
  quitarPrefijoLlegada,
  reportesACsv,
  reportesADatosIngreso,
} from "@/lib/reportes/formato";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CAMPOS_PUBLICOS,
  cargarEventosDeReportes,
  mapearReporte,
} from "@/lib/supabase/reportes";
import type { EstadoReporte, Reporte } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_LISTA = 200;
const LIMITE_DESCARGA = 5_000;
/** PostgREST devuelve como máximo 1000 filas por petición. */
const TAMANO_PAGINA = 1_000;
const MAX_IDS = 1_000;
const TAMANO_LOTE_RPC = 500;
/** Cédulas por consulta al descargar un lote (evita URLs demasiado largas). */
const CIS_POR_CONSULTA = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Filtros {
  estado: string;
  q: string;
  ids?: string[];
  /** Cédulas incluidas en el lote de descarga. */
  cis?: string[];
}

function filtrosDeTexto(estado: unknown, q: unknown): Pick<Filtros, "estado" | "q"> {
  return {
    estado: typeof estado === "string" ? estado : "",
    q: quitarPrefijoLlegada((typeof q === "string" ? q : "").trim().slice(0, 40)),
  };
}

/** PGRST205/42P01: la vista de la migración 0011 todavía no existe. */
function faltaVistaLlegada(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * Número de llegada de cada cédula visible. Lo calcula la vista sobre todo el
 * histórico (migración 0011), no sobre la página de 200. Si la migración aún
 * no está aplicada, el panel sigue funcionando sin números.
 */
async function cargarNumerosLlegada(
  cis: string[],
): Promise<{ numeros: Map<string, number>; disponible: boolean }> {
  const numeros = new Map<string, number>();
  if (cis.length === 0) return { numeros, disponible: true };

  const { data, error } = await obtenerSupabaseAdmin()
    .from("reportes_con_llegada")
    .select("ci,numero_llegada")
    .in("ci", cis);

  if (error) {
    if (faltaVistaLlegada(error)) {
      console.warn(
        "[api/admin/reportes] falta la migración 0011 (reportes_con_llegada); se omite el número de llegada.",
      );
    } else {
      console.error(
        "[api/admin/reportes] no se pudo leer el número de llegada:",
        error,
      );
    }
    return { numeros, disponible: false };
  }

  for (const fila of data ?? []) {
    if (!numeros.has(fila.ci)) numeros.set(fila.ci, fila.numero_llegada);
  }

  return { numeros, disponible: true };
}

/**
 * Cédulas cuyo número de llegada cae en el rango (inclusive). Se pagina
 * porque PostgREST devuelve como máximo 1000 filas por petición.
 */
async function cargarCisPorLlegada(
  desde: number,
  hasta: number,
): Promise<{ cis: string[]; disponible: boolean }> {
  const cis: string[] = [];

  for (let inicio = 0; inicio < LIMITE_DESCARGA; inicio += TAMANO_PAGINA) {
    const { data, error } = await obtenerSupabaseAdmin()
      .from("reportes_con_llegada")
      .select("ci")
      .gte("numero_llegada", desde)
      .lte("numero_llegada", hasta)
      .order("numero_llegada", { ascending: true })
      .range(inicio, inicio + TAMANO_PAGINA - 1);

    if (error) {
      if (faltaVistaLlegada(error)) {
        console.warn(
          "[api/admin/reportes] falta la migración 0011 (reportes_con_llegada); no se puede descargar por lote.",
        );
        return { cis, disponible: false };
      }
      throw error;
    }

    cis.push(...(data ?? []).map((fila) => fila.ci));

    if ((data?.length ?? 0) < TAMANO_PAGINA) break;
  }

  return { cis: [...new Set(cis)], disponible: true };
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
  if (filtros.cis) consulta = consulta.in("ci", filtros.cis);
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

function leerEntero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0
    ? valor
    : null;
}

function trocear<T>(valores: T[], tamano: number): T[][] {
  const bloques: T[][] = [];

  for (let inicio = 0; inicio < valores.length; inicio += tamano) {
    bloques.push(valores.slice(inicio, inicio + tamano));
  }

  return bloques;
}

/**
 * Reúne los reportes de una descarga por tandas de 1000 (tope de PostgREST).
 * Si el lote abarca muchas cédulas, se consultan en bloques pequeños y se
 * deduplican por id antes de devolverlos en orden cronológico.
 */
async function recolectarParaDescarga(
  filtros: Filtros,
): Promise<{ reportes: Reporte[]; hayMas: boolean }> {
  const reportes: Reporte[] = [];
  const vistos = new Set<string>();
  const bloques: (string[] | undefined)[] =
    filtros.cis && filtros.cis.length > CIS_POR_CONSULTA
      ? trocear(filtros.cis, CIS_POR_CONSULTA)
      : [filtros.cis];

  let totalCoincidencias = 0;
  let hayMas = false;

  for (const bloque of bloques) {
    if (reportes.length >= LIMITE_DESCARGA) {
      hayMas = true;
      break;
    }

    let contado = false;

    for (let desde = 0; desde < LIMITE_DESCARGA; desde += TAMANO_PAGINA) {
      const { data, count, error } = await consultaReportes(
        { ...filtros, cis: bloque },
        desde,
        desde + TAMANO_PAGINA - 1,
      );

      if (error) throw error;

      if (!contado) {
        totalCoincidencias += count ?? 0;
        contado = true;
      }

      for (const fila of data ?? []) {
        const reporte = mapearReporte(fila);
        if (vistos.has(reporte.id)) continue;

        vistos.add(reporte.id);
        reportes.push(reporte);

        if (reportes.length >= LIMITE_DESCARGA) break;
      }

      if (reportes.length >= LIMITE_DESCARGA) break;
      if ((data?.length ?? 0) < TAMANO_PAGINA) break;
      if (desde + TAMANO_PAGINA >= (count ?? 0)) break;
    }
  }

  if (
    reportes.length >= LIMITE_DESCARGA &&
    totalCoincidencias > LIMITE_DESCARGA
  ) {
    hayMas = true;
  }

  // Orden estable para el CSV y para que el JSON elija el dato más reciente
  // de cada cédula. Los bloques de cédulas son disjuntos.
  reportes.sort(
    (a, b) => b.creadoEn.localeCompare(a.creadoEn) || a.id.localeCompare(b.id),
  );

  return { reportes, hayMas };
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

    const reportes = (data ?? []).map((fila) => mapearReporte(fila));

    // Número de llegada y notas del historial en paralelo. Ambos son
    // opcionales: si fallan, la lista se entrega igual.
    const [{ numeros, disponible: llegadaDisponible }, eventos] = await Promise.all([
      cargarNumerosLlegada([...new Set(reportes.map((r) => r.ci))]),
      cargarEventosDeReportes(reportes.map((r) => r.id)),
    ]);

    return respuestaOk({
      reportes: reportes.map((reporte) => {
        const numeroLlegada = numeros.get(reporte.ci);
        const historial = eventos.get(reporte.id);

        return {
          ...reporte,
          ...(numeroLlegada !== undefined ? { numeroLlegada } : {}),
          ...(historial?.length ? { eventos: historial } : {}),
        };
      }),
      total: count ?? data?.length ?? 0,
      // El panel avisa si no hay números de llegada (migración 0011 pendiente).
      llegadaDisponible,
    });
  } catch (error) {
    console.error("[api/admin/reportes]", error);
    return respuestaError("interno", "No pudimos cargar los reportes.", 500);
  }
}

/**
 * Acciones por lote:
 *  - { accion: "estado", ids, estado, nota? }
 *  - { accion: "descargar", formato: "csv" | "json",
 *      ids? | estado?, q? | llegadaDesde, llegadaHasta }
 *    El formato "json" produce el datos.json de app_ingresos
 *    ({ estudiantes, reportes }); "csv" es la hoja completa para Excel.
 *    El lote por llegada descarga todas las cédulas cuyo número de llegada
 *    cae en el rango e ignora el buscador y el filtro de estado.
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

      const porLote =
        cuerpo?.llegadaDesde !== undefined || cuerpo?.llegadaHasta !== undefined;
      const llegadaDesde = porLote ? leerEntero(cuerpo?.llegadaDesde) : null;
      const llegadaHasta = porLote ? leerEntero(cuerpo?.llegadaHasta) : null;

      if (
        porLote &&
        (llegadaDesde === null ||
          llegadaHasta === null ||
          llegadaDesde > llegadaHasta)
      ) {
        return respuestaError("validacion", "Rango de lote inválido.", 422);
      }

      let cis: string[] | undefined;

      if (llegadaDesde !== null && llegadaHasta !== null) {
        const lote = await cargarCisPorLlegada(llegadaDesde, llegadaHasta);

        if (!lote.disponible) {
          return respuestaError(
            "interno",
            "No se puede descargar por lote: falta la migración 0011 (números de llegada). Ejecútala en Supabase.",
            500,
          );
        }

        if (lote.cis.length === 0) {
          return respuestaError(
            "no_encontrado",
            "No hay cédulas en ese rango de llegada.",
            404,
          );
        }

        cis = lote.cis;
      }

      // El lote ignora el buscador y el filtro de estado: «1-10» siempre
      // significa los reportes de las cédulas con llegada 1 a 10.
      const filtros: Filtros = porLote
        ? { estado: "", q: "", cis }
        : { ...filtrosDeTexto(cuerpo?.estado, cuerpo?.q), ids };

      const { reportes, hayMas } = await recolectarParaDescarga(filtros);

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
