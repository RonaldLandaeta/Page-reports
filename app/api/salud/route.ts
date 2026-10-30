import { NextResponse } from "next/server";

import {
  claveAnonima,
  claveServiceRole,
  haySupabaseConfigurado,
  obtenerSupabaseAdmin,
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
 * Diagnóstico de despliegue: comprueba variables y que la tabla `materias`
 * responda. No devuelve claves ni detalles internos de los errores.
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

    if (faltantes.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          supabase: estado,
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

    return NextResponse.json(
      {
        ok: true,
        supabase: estado,
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
