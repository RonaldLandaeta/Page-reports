import { NextResponse } from "next/server";

import {
  claveAnonima,
  claveServiceRole,
  fuenteUrlSupabase,
  haySupabaseConfigurado,
  obtenerSupabaseAdmin,
  proyectoSupabase,
  urlSupabase,
} from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

const TABLAS = [
  "materias",
  "reportes",
  "reporte_eventos",
  "codigos_verificacion",
  "consulta_intentos",
  "administradores",
] as const;

type TablaRequerida = (typeof TABLAS)[number];

function comprobar(comprobacion: () => unknown): boolean {
  try {
    comprobacion();
    return true;
  } catch {
    return false;
  }
}

/** Nombre de la columna que PostgREST dice que falta, si aplica. */
function columnaFaltante(mensaje: string): string | null {
  const coincidencia = mensaje.match(/column "?([\w.]+)"? does not exist/i);
  return coincidencia?.[1] ?? null;
}

/** Traduce el error de PostgREST a la migración que hay que ejecutar. */
function pistaCatalogo(codigo: string, mensaje: string): string {
  if (codigo === "42703" || codigo === "PGRST204") {
    return "Faltan columnas en public.materias. Ejecuta supabase/migrations/0005_reparar_materias.sql (o el setup.sql completo) en el proyecto que usa Vercel.";
  }

  if (codigo === "42501" || codigo === "PGRST301") {
    return "La Data API no tiene permisos sobre public.materias. Ejecuta supabase/migrations/0004_permisos.sql.";
  }

  if (codigo === "42P01" || codigo === "PGRST205") {
    return "No existe public.materias en este proyecto. Ejecuta supabase/setup.sql.";
  }

  if (/schema cache/i.test(mensaje)) {
    return "PostgREST conserva la caché vieja. Ejecuta `notify pgrst, 'reload schema';` en el SQL Editor.";
  }

  return "Revisa los logs de Vercel y ejecuta supabase/setup.sql en el proyecto configurado.";
}

async function comprobarTablas(
  supabase: ReturnType<typeof obtenerSupabaseAdmin>,
): Promise<Record<TablaRequerida, boolean>> {
  const pares = await Promise.all(
    TABLAS.map(async (tabla) => {
      const { error } = await supabase
        .from(tabla)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error(
          `[api/salud] la tabla public.${tabla} no está disponible:`,
          error.message,
        );
      }

      return [tabla, !error] as const;
    }),
  );

  return Object.fromEntries(pares) as Record<TablaRequerida, boolean>;
}

/**
 * Diagnóstico de despliegue: comprueba variables, tablas y la consulta real del
 * catálogo. No devuelve claves; sí el host del proyecto y, si falla, el código
 * de error y la columna que falta (información de esquema, no secreta).
 */
export async function GET() {
  const estado = {
    url: comprobar(urlSupabase),
    serviceRole: comprobar(claveServiceRole),
    anon: comprobar(claveAnonima),
    verificacion:
      (process.env.VERIFICACION_SECRET ?? "").trim().length >= 32,
  };

  const listo = haySupabaseConfigurado() && estado.anon && estado.verificacion;

  if (!listo) {
    return NextResponse.json(
      {
        ok: false,
        supabase: estado,
        tablas: null,
        faltantes: null,
        materias: null,
        mensaje:
          "Falta alguna variable o no es válida. Revisa Vercel → Environment Variables y vuelve a desplegar.",
      },
      { status: 503, headers: SIN_CACHE },
    );
  }

  try {
    const supabase = obtenerSupabaseAdmin();
    const tablas = await comprobarTablas(supabase);
    const faltantes = TABLAS.filter((tabla) => !tablas[tabla]);
    const proyecto = proyectoSupabase();
    const fuenteUrl = fuenteUrlSupabase();

    if (faltantes.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          supabase: estado,
          proyecto,
          fuenteUrl,
          tablas,
          faltantes,
          materias: null,
          mensaje: `Faltan tablas en Supabase: ${faltantes.join(", ")}. Ejecuta supabase/setup.sql completo.`,
        },
        { status: 503, headers: SIN_CACHE },
      );
    }

    const { count, error } = await supabase
      .from("materias")
      .select("nrc", { count: "exact", head: true })
      .eq("activo", true);

    if (error) throw error;

    // Misma consulta que `listarMaterias()`: si aquí falla, /api/materias
    // devolverá 503 aunque la tabla exista.
    const { error: errorCatalogo } = await supabase
      .from("materias")
      .select("nrc, nombre, docente, horario, aula")
      .eq("activo", true)
      .limit(1);

    if (errorCatalogo) {
      console.error(
        "[api/salud] la consulta del catálogo falló:",
        errorCatalogo.message,
      );

      return NextResponse.json(
        {
          ok: false,
          supabase: estado,
          proyecto,
          fuenteUrl,
          tablas,
          faltantes: [],
          materias: count ?? 0,
          codigo: errorCatalogo.code ?? null,
          columna: columnaFaltante(errorCatalogo.message),
          mensaje:
            "public.materias existe, pero la consulta que usa la app falla. Por eso /api/materias responde 503.",
          pista: pistaCatalogo(
            errorCatalogo.code ?? "",
            errorCatalogo.message,
          ),
        },
        { status: 503, headers: SIN_CACHE },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        supabase: estado,
        proyecto,
        fuenteUrl,
        tablas,
        faltantes: [],
        materias: count ?? 0,
        mensaje:
          (count ?? 0) > 0
            ? "Supabase responde y el catálogo tiene materias activas."
            : "Supabase responde, pero no hay materias activas. Ejecuta supabase/seed.sql.",
      },
      { headers: SIN_CACHE },
    );
  } catch (error) {
    console.error("[api/salud] no se pudo consultar materias.", error);

    return NextResponse.json(
      {
        ok: false,
        supabase: estado,
        proyecto: proyectoSupabase(),
        fuenteUrl: fuenteUrlSupabase(),
        tablas: null,
        faltantes: null,
        materias: null,
        mensaje:
          "Supabase está configurado, pero la consulta a materias falló. Revisa los logs y los permisos de la Data API.",
      },
      { status: 503, headers: SIN_CACHE },
    );
  }
}
